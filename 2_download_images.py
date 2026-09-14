#!/usr/bin/env python3
"""
2_download_images.py — Download and preprocess labeled images for training.

Reads the labels JSONL from step 1, downloads each image, resizes to
224x224 (MobileNetV3 input size), normalizes pixel values to [0, 1],
and saves as numpy arrays alongside a filtered labels file.

Why save as numpy arrays instead of JPEGs?
  - Training reads images thousands of times across epochs
  - Loading pre-processed arrays is ~10x faster than decoding JPEG each time
  - Normalization is applied once here, not repeated per batch

Usage:
    python3 2_download_images.py \
        --labels ../data/labels/labels.jsonl \
        --output-dir ../data/processed/

Output structure:
    data/processed/
        images.npy     # float32 array shape (N, 224, 224, 3)
        labels.npy     # int32 array shape (N, 4) — [cat, aes, aud, tone] indices
        metadata.jsonl # filtered labels with local paths, for debugging
"""

import json
import argparse
import urllib.request
import urllib.error
import io
import numpy as np
from pathlib import Path
from typing import Optional

# Pillow for image decoding and resizing
from PIL import Image, UnidentifiedImageError

import sys
sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import IMAGE_SIZE

# ── Image loading ─────────────────────────────────────────────────────────────

def load_and_preprocess(source: str | bytes, size: tuple = IMAGE_SIZE) -> Optional[np.ndarray]:
    """
    Load an image from a URL or raw bytes, resize to target size,
    and normalize pixel values to float32 in [0, 1].

    Returns None if the image cannot be loaded or is not RGB.
    """
    try:
        if isinstance(source, str):
            # URL — download with a browser-like User-Agent to avoid 403s
            req = urllib.request.Request(
                source,
                headers={"User-Agent": "Mozilla/5.0 (compatible; InfluenceVest/1.0)"}
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read()
        else:
            raw = source

        img = Image.open(io.BytesIO(raw))

        # Convert to RGB — handles RGBA, greyscale, palette modes
        img = img.convert("RGB")

        # Resize with high-quality Lanczos resampling
        img = img.resize(size, Image.LANCZOS)

        # To numpy float32, normalize to [0, 1]
        arr = np.array(img, dtype=np.float32) / 255.0
        assert arr.shape == (*size, 3), f"Unexpected shape: {arr.shape}"

        return arr

    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        print(f"    Download error: {e}")
        return None
    except UnidentifiedImageError:
        print("    Cannot identify image format — skipping")
        return None
    except Exception as e:
        print(f"    Preprocessing error: {e}")
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Download and preprocess labeled images")
    parser.add_argument("--labels", type=str, default="../data/labels/labels.jsonl")
    parser.add_argument("--output-dir", type=str, default="../data/processed/")
    parser.add_argument("--demo", action="store_true",
                        help="Generate synthetic image data without downloading (for testing)")
    args = parser.parse_args()

    labels_path = Path(args.labels)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── Demo mode: generate synthetic images ──────────────────────────────────
    if args.demo:
        print("Demo mode — generating synthetic image data")
        n = 50  # synthetic samples per category for demo

        # Generate random images with slight per-class color biases
        # so the model has something non-trivial to learn
        rng = np.random.default_rng(42)
        images, label_rows, meta = [], [], []

        demo_labels = [
            {"category_idx": 2, "aesthetic_idx": 3, "audience_idx": 1, "tone_idx": 0,
             "category": "Health & Fitness", "aesthetic": "Natural & Earthy",
             "audience": "Millennials (25-34)", "tone": "Inspirational",
             "confidence": 0.91, "key_signals": ["demo"], "url": "demo://0"},
            {"category_idx": 0, "aesthetic_idx": 0, "audience_idx": 0, "tone_idx": 3,
             "category": "Fashion & Style", "aesthetic": "Minimalist & Clean",
             "audience": "Gen Z (18-24)", "tone": "Aspirational",
             "confidence": 0.87, "key_signals": ["demo"], "url": "demo://1"},
            {"category_idx": 3, "aesthetic_idx": 1, "audience_idx": 1, "tone_idx": 1,
             "category": "Food & Cooking", "aesthetic": "Vibrant & Colourful",
             "audience": "Millennials (25-34)", "tone": "Educational",
             "confidence": 0.93, "key_signals": ["demo"], "url": "demo://2"},
        ]

        for sample_label in demo_labels:
            for _ in range(n):
                # Add class-specific color bias so classes are separable
                bias = np.array([
                    sample_label["category_idx"] / 15,
                    sample_label["aesthetic_idx"] / 10,
                    sample_label["tone_idx"] / 7,
                ], dtype=np.float32)
                img = rng.random((224, 224, 3), dtype=np.float32) * 0.5 + bias * 0.5
                img = np.clip(img, 0, 1)
                images.append(img)
                label_rows.append([
                    sample_label["category_idx"],
                    sample_label["aesthetic_idx"],
                    sample_label["audience_idx"],
                    sample_label["tone_idx"],
                ])
                meta.append(sample_label)

        images_arr = np.stack(images, axis=0)
        labels_arr = np.array(label_rows, dtype=np.int32)

        np.save(output_dir / "images.npy", images_arr)
        np.save(output_dir / "labels.npy", labels_arr)

        with open(output_dir / "metadata.jsonl", "w") as f:
            for m in meta:
                f.write(json.dumps(m) + "\n")

        print(f"Saved {len(images_arr)} synthetic images")
        print(f"  images.npy shape: {images_arr.shape} dtype: {images_arr.dtype}")
        print(f"  labels.npy shape: {labels_arr.shape} dtype: {labels_arr.dtype}")
        print(f"  Output: {output_dir}")
        return

    # ── Real mode: download from URLs ─────────────────────────────────────────
    if not labels_path.exists():
        raise FileNotFoundError(f"Labels file not found: {labels_path}")

    records = []
    with open(labels_path) as f:
        for line in f:
            try:
                records.append(json.loads(line.strip()))
            except json.JSONDecodeError:
                pass

    print(f"Processing {len(records)} labeled images...")

    images, label_rows, meta = [], [], []
    failed = 0

    for i, record in enumerate(records):
        url = record.get("url", "")
        print(f"[{i+1}/{len(records)}] {url[:60]}...")

        img = load_and_preprocess(url)
        if img is None:
            failed += 1
            continue

        images.append(img)
        label_rows.append([
            record["category_idx"],
            record["aesthetic_idx"],
            record["audience_idx"],
            record["tone_idx"],
        ])
        meta.append(record)

    if not images:
        raise RuntimeError("No images downloaded successfully")

    # Stack into arrays and save
    images_arr = np.stack(images, axis=0).astype(np.float32)
    labels_arr = np.array(label_rows, dtype=np.int32)

    np.save(output_dir / "images.npy", images_arr)
    np.save(output_dir / "labels.npy", labels_arr)

    with open(output_dir / "metadata.jsonl", "w") as f:
        for m in meta:
            f.write(json.dumps(m) + "\n")

    print(f"\nDone — {len(images_arr)} saved, {failed} failed")
    print(f"  images.npy: {images_arr.shape} ({images_arr.nbytes / 1e6:.1f} MB)")
    print(f"  labels.npy: {labels_arr.shape}")
    print(f"  Output: {output_dir}")


if __name__ == "__main__":
    main()
