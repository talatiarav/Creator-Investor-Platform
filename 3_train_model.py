#!/usr/bin/env python3
"""
3_train_model.py — Train the multi-output brand classification model.

Architecture: MobileNetV3Small backbone (pretrained on ImageNet) with
four classification heads — one per brand dimension. The backbone is
shared: it learns visual features once, and each head specialises on
its own classification task.

This is called multi-task learning. The heads regularise each other
because the visual features that distinguish "Health & Fitness" posts
overlap substantially with features for "Natural & Earthy" aesthetics.
A shared backbone learns these correlated signals jointly and produces
better features than four separate single-task models would.

Training strategy:
  Phase 1 (feature extraction): freeze backbone, train heads only.
          The backbone weights are frozen because they've already learned
          rich ImageNet features. Training heads first lets them converge
          to reasonable weights before we start adjusting the backbone.

  Phase 2 (fine-tuning): unfreeze the top layers of the backbone and
          train end-to-end at a very low learning rate. This specialises
          the backbone features for Instagram content rather than general
          ImageNet images.

Usage:
    python3 3_train_model.py --data-dir ../data/processed/ --output ../models/saved/
    python3 3_train_model.py --demo   # quick training run on synthetic data
"""

import json
import argparse
import os
import numpy as np
import tensorflow as tf
from tensorflow import keras
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight

import sys
sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import DIMENSIONS, IDX_TO_LABEL, IMAGE_SIZE

# Suppress TF info logs for cleaner output
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

# ── Model architecture ────────────────────────────────────────────────────────

def build_model(
    input_shape: tuple = (*IMAGE_SIZE, 3),
    num_classes: dict = None,
    dropout_rate: float = 0.3,
) -> keras.Model:
    """
    Build the multi-output brand classifier.

    Architecture:
        Input (224, 224, 3)
            ↓
        MobileNetV3Small backbone (pretrained ImageNet weights)
            ↓
        Global Average Pooling  [reduces (7,7,576) → (576,)]
            ↓
        Shared Dense(256) + BatchNorm + Dropout
            ↓
        ┌──────────┬──────────┬──────────┬──────────┐
        │ category │aesthetic │ audience │   tone   │
        │Dense(128)│Dense(128)│Dense(128)│Dense(128)│
        │ softmax  │ softmax  │ softmax  │ softmax  │
        └──────────┴──────────┴──────────┴──────────┘

    The four heads share everything up to the task-specific dense layers.
    This is standard multi-task architecture — shared representation,
    task-specific prediction layers.
    """
    if num_classes is None:
        num_classes = {dim: len(labels) for dim, labels in DIMENSIONS.items()}

    inputs = keras.Input(shape=input_shape, name="image")

    # MobileNetV3Small: fast, accurate, 3.2M params vs ResNet50's 25M
    # include_top=False removes the ImageNet classification head
    # include_preprocessing=True applies MobileNetV3's expected normalisation
    try:
        backbone = keras.applications.MobileNetV3Small(
            input_shape=input_shape,
            include_top=False,
            weights="imagenet",
            include_preprocessing=True,
        )
    except Exception as e:
        print(f"  Warning: Could not load ImageNet weights ({e})")
        print("  Falling back to random initialisation (weights=None)")
        print("  In production: ensure network access to storage.googleapis.com")
        backbone = keras.applications.MobileNetV3Small(
            input_shape=input_shape,
            include_top=False,
            weights=None,
            include_preprocessing=False,
        )
    backbone.trainable = False  # freeze for phase 1

    x = backbone(inputs, training=False)

    # Global average pooling: collapses spatial dimensions
    # More robust than flatten for varying-content images
    x = keras.layers.GlobalAveragePooling2D(name="gap")(x)

    # Shared representation layer — learned jointly across all tasks
    x = keras.layers.Dense(256, activation="relu", name="shared_dense")(x)
    x = keras.layers.BatchNormalization(name="shared_bn")(x)
    x = keras.layers.Dropout(dropout_rate, name="shared_dropout")(x)

    # Task-specific heads
    outputs = {}
    for dim, n_classes in num_classes.items():
        head = keras.layers.Dense(128, activation="relu", name=f"{dim}_dense")(x)
        head = keras.layers.Dropout(dropout_rate * 0.5, name=f"{dim}_dropout")(head)
        outputs[dim] = keras.layers.Dense(
            n_classes, activation="softmax", name=dim
        )(head)

    return keras.Model(inputs=inputs, outputs=outputs, name="influencevest_classifier")


def get_backbone(model: keras.Model) -> keras.Model:
    """Extracts the MobileNetV3 backbone from the multi-output model."""
    # Keras uses the class name as the default layer name
    for name in ["MobileNetV3Small", "mobile_net_v3_small"]:
        try:
            return model.get_layer(name)
        except ValueError:
            continue
    raise ValueError(f"Could not find MobileNetV3 backbone. Layers: {[l.name for l in model.layers]}")


# ── Data augmentation ─────────────────────────────────────────────────────────

def build_augmentation_pipeline() -> keras.Sequential:
    """
    Light augmentation applied only during training.
    Augmentation simulates the variety of real Instagram posts:
    different crops, slight rotations, brightness and contrast shifts.

    We keep augmentation light because Instagram posts are deliberately
    composed — heavy distortion would destroy meaningful visual signals.
    """
    return keras.Sequential([
        keras.layers.RandomFlip("horizontal"),
        keras.layers.RandomRotation(0.05),          # ±18 degrees max
        keras.layers.RandomZoom(0.1),               # up to 10% zoom
        keras.layers.RandomBrightness(0.1),         # slight brightness shift
        keras.layers.RandomContrast(0.1),           # slight contrast shift
    ], name="augmentation")


# ── Training ──────────────────────────────────────────────────────────────────

def train(
    images: np.ndarray,
    labels: np.ndarray,
    output_dir: Path,
    batch_size: int = 32,
    phase1_epochs: int = 15,
    phase2_epochs: int = 10,
    validation_split: float = 0.15,
):
    """
    Two-phase training:
      Phase 1: frozen backbone, train heads only (fast convergence)
      Phase 2: unfreeze top backbone layers, fine-tune end-to-end (specialisation)
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── Split data ────────────────────────────────────────────────────────────
    # Stratify on primary category to ensure all classes appear in both splits
    cat_labels = labels[:, 0]
    X_train, X_val, y_train, y_val = train_test_split(
        images, labels,
        test_size=validation_split,
        stratify=cat_labels,
        random_state=42,
    )

    print(f"Training set:   {len(X_train)} samples")
    print(f"Validation set: {len(X_val)} samples")

    # ── Build tf.data pipelines ───────────────────────────────────────────────
    augment = build_augmentation_pipeline()

    def make_outputs(y_batch):
        return {
            "category":  y_batch[:, 0],
            "aesthetic": y_batch[:, 1],
            "audience":  y_batch[:, 2],
            "tone":      y_batch[:, 3],
        }

    def train_map(x, y):
        x = augment(x, training=True)
        return x, make_outputs(y)

    def val_map(x, y):
        return x, make_outputs(y)

    AUTOTUNE = tf.data.AUTOTUNE

    train_ds = (
        tf.data.Dataset.from_tensor_slices((X_train, y_train))
        .shuffle(buffer_size=min(len(X_train), 1000), seed=42)
        .batch(batch_size)
        .map(train_map, num_parallel_calls=AUTOTUNE)
        .prefetch(AUTOTUNE)
    )

    val_ds = (
        tf.data.Dataset.from_tensor_slices((X_val, y_val))
        .batch(batch_size)
        .map(val_map, num_parallel_calls=AUTOTUNE)
        .prefetch(AUTOTUNE)
    )

    # ── Build model ───────────────────────────────────────────────────────────
    num_classes = {dim: len(labels_list) for dim, labels_list in DIMENSIONS.items()}
    model = build_model(num_classes=num_classes)

    model.summary(line_length=90)
    print(f"\nTrainable params (phase 1): {model.count_params():,}")

    # ── Loss and metrics per head ─────────────────────────────────────────────
    # Sparse categorical crossentropy: expects integer labels, not one-hot
    losses = {dim: "sparse_categorical_crossentropy" for dim in DIMENSIONS}
    metrics = {dim: ["accuracy"] for dim in DIMENSIONS}

    # Weight losses equally — all four dimensions matter equally to brand fit
    loss_weights = {dim: 1.0 for dim in DIMENSIONS}

    # ── Callbacks ─────────────────────────────────────────────────────────────
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=5,
            restore_best_weights=True,
            verbose=1,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=3,
            min_lr=1e-6,
            verbose=1,
        ),
        keras.callbacks.ModelCheckpoint(
            filepath=str(output_dir / "checkpoint_best.keras"),
            monitor="val_loss",
            save_best_only=True,
            verbose=0,
        ),
    ]

    # ── Phase 1: train heads only ─────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("Phase 1: Feature extraction (frozen backbone)")
    print(f"{'='*60}")

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss=losses,
        loss_weights=loss_weights,
        metrics=metrics,
    )

    history_phase1 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=phase1_epochs,
        callbacks=callbacks,
        verbose=1,
    )

    # ── Phase 2: fine-tune top backbone layers ────────────────────────────────
    print(f"\n{'='*60}")
    print("Phase 2: Fine-tuning (unfreezing top backbone layers)")
    print(f"{'='*60}")

    backbone = get_backbone(model)
    backbone.trainable = True

    # Unfreeze only the top 20 layers — enough to specialise features
    # without destroying the low-level edge/texture detectors that
    # transfer well from ImageNet
    for layer in backbone.layers[:-20]:
        layer.trainable = False

    trainable_after = sum(1 for l in backbone.layers if l.trainable)
    print(f"Backbone layers trainable: {trainable_after}/{len(backbone.layers)}")

    # Very low LR for fine-tuning to avoid catastrophic forgetting
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-5),
        loss=losses,
        loss_weights=loss_weights,
        metrics=metrics,
    )

    history_phase2 = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=phase2_epochs,
        callbacks=callbacks,
        verbose=1,
    )

    # ── Evaluate ──────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("Final evaluation on validation set")
    print(f"{'='*60}")

    eval_results = model.evaluate(val_ds, verbose=0)
    metric_names = model.metrics_names

    results = {}
    for name, value in zip(metric_names, eval_results):
        results[name] = round(float(value), 4)
        if "accuracy" in name:
            print(f"  {name}: {value:.1%}")

    # ── Save model ────────────────────────────────────────────────────────────
    model_path = output_dir / "influencevest_classifier.keras"
    model.save(model_path)
    print(f"\nModel saved to: {model_path}")

    # Save training metadata
    meta = {
        "architecture": "MobileNetV3Small + multi-output heads",
        "input_shape": [*IMAGE_SIZE, 3],
        "output_dimensions": {
            dim: {"classes": list(labels_list), "num_classes": len(labels_list)}
            for dim, labels_list in DIMENSIONS.items()
        },
        "training": {
            "samples_train": len(X_train),
            "samples_val": len(X_val),
            "batch_size": batch_size,
            "phase1_epochs": phase1_epochs,
            "phase2_epochs": phase2_epochs,
        },
        "val_metrics": results,
    }

    with open(output_dir / "model_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"Metadata saved to: {output_dir / 'model_metadata.json'}")
    return model, results


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train the brand classification model")
    parser.add_argument("--data-dir", type=str, default="../data/processed/")
    parser.add_argument("--output", type=str, default="../models/saved/")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--phase1-epochs", type=int, default=15)
    parser.add_argument("--phase2-epochs", type=int, default=10)
    parser.add_argument("--demo", action="store_true",
                        help="Quick training run on synthetic data to verify pipeline works")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    output_dir = Path(args.output)

    if args.demo:
        # Run step 2 in demo mode first to generate synthetic data
        print("Generating synthetic training data...")
        import subprocess
        subprocess.run([
            "python3", str(Path(__file__).parent / "2_download_images.py"),
            "--demo", "--output-dir", str(data_dir)
        ], check=True)

        # Short training run for demo
        args.phase1_epochs = 3
        args.phase2_epochs = 2

    images_path = data_dir / "images.npy"
    labels_path = data_dir / "labels.npy"

    if not images_path.exists() or not labels_path.exists():
        raise FileNotFoundError(
            f"Run 2_download_images.py first to generate {data_dir}/images.npy"
        )

    print(f"Loading data from {data_dir}...")
    images = np.load(images_path)
    labels = np.load(labels_path)

    print(f"  images: {images.shape}, dtype={images.dtype}")
    print(f"  labels: {labels.shape}, dtype={labels.dtype}")
    print(f"  pixel range: [{images.min():.3f}, {images.max():.3f}]")

    # Class distribution for primary category
    print("\nClass distribution (primary category):")
    from taxonomy import CATEGORIES
    unique, counts = np.unique(labels[:, 0], return_counts=True)
    for idx, count in zip(unique, counts):
        print(f"  {CATEGORIES[idx]}: {count} samples")

    model, results = train(
        images=images,
        labels=labels,
        output_dir=output_dir,
        batch_size=args.batch_size,
        phase1_epochs=args.phase1_epochs,
        phase2_epochs=args.phase2_epochs,
    )

    print("\n✅ Training complete")
    print("Next step: python3 4_convert_to_tfjs.py")


if __name__ == "__main__":
    main()
