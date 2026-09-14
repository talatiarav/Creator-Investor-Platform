#!/usr/bin/env python3
"""
4_convert_to_tfjs.py — Convert the trained SavedModel to TensorFlow.js format.

TensorFlow.js can load models in two formats:
  - GraphModel (converted from SavedModel): faster inference, frozen graph
  - LayersModel (converted from Keras): preserves layer structure, slightly larger

We use GraphModel because it's optimised for inference — we never need
to train or inspect layers from the Node.js side.

The conversion produces a model.json file (graph topology) and one or more
.bin shards (weights). Both are loaded by tfjs in Node.js.

Usage:
    python3 4_convert_to_tfjs.py \
        --input ../models/saved/influencevest_classifier \
        --output ../models/tfjs/

Requirements:
    pip install tensorflowjs --break-system-packages

Output:
    models/tfjs/
        model.json        # graph topology + weight manifest
        group1-shard1of1.bin  # weight values
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path


def convert(input_path: Path, output_path: Path, quantize: bool = True):
    """
    Converts a TensorFlow SavedModel to TensorFlow.js GraphModel format.

    Quantisation (uint16) reduces the model file size by ~50% with minimal
    accuracy loss — important for loading quickly in Node.js. For a
    MobileNetV3Small model this brings weights from ~8MB to ~4MB.
    """
    output_path.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "tensorflowjs_converter",
        "--input_format", "tf_saved_model",
        "--output_format", "tfjs_graph_model",
        "--signature_name", "serving_default",
        "--saved_model_tags", "serve",
    ]

    if quantize:
        # uint16 quantisation: good balance of size and accuracy
        # float16 is another option if accuracy is more important than size
        cmd += ["--quantize_uint16", "*"]

    cmd += [str(input_path), str(output_path)]

    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        raise RuntimeError(f"Conversion failed with exit code {result.returncode}")

    print(result.stdout)

    # Print output manifest for verification
    model_json_path = output_path / "model.json"
    if model_json_path.exists():
        with open(model_json_path) as f:
            manifest = json.load(f)

        # Count total weight size
        weight_files = manifest.get("weightsManifest", [{}])[0].get("paths", [])
        total_size = sum(
            (output_path / p).stat().st_size
            for p in weight_files
            if (output_path / p).exists()
        )

        print(f"\n✅ Conversion successful")
        print(f"   Output: {output_path}")
        print(f"   model.json: {model_json_path.stat().st_size / 1024:.1f} KB")
        print(f"   Weight files: {len(weight_files)} shards, {total_size / 1e6:.2f} MB total")
        print(f"\nTo load in Node.js (TensorFlow.js):")
        print(f"  const model = await tf.loadGraphModel('file://{output_path}/model.json');")
    else:
        raise RuntimeError("model.json not found in output — conversion may have failed silently")


def demo_check(output_path: Path):
    """
    Verifies the converted model structure without actually loading it
    (since we may not have TFJS Python binding installed).
    """
    model_json = output_path / "model.json"
    if not model_json.exists():
        print(f"model.json not found at {model_json}")
        return

    with open(model_json) as f:
        manifest = json.load(f)

    # Read output node names from the signature
    sig = manifest.get("userDefinedMetadata", {}).get("signature", {})
    outputs = list(manifest.get("signature", {}).get("outputs", {}).keys()) or ["(not readable in demo)"]

    print("\nModel manifest summary:")
    print(f"  Format:  {manifest.get('format', 'unknown')}")
    print(f"  Backend: {manifest.get('convertedBy', 'unknown')}")
    print(f"  Outputs: {outputs}")
    weight_files = manifest.get("weightsManifest", [{}])[0].get("paths", [])
    print(f"  Weight shards: {len(weight_files)}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert TensorFlow SavedModel to TensorFlow.js format"
    )
    parser.add_argument(
        "--input", type=str,
        default="../models/saved/influencevest_classifier",
        help="Path to TF SavedModel directory"
    )
    parser.add_argument(
        "--output", type=str,
        default="../models/tfjs/",
        help="Output directory for TFJS model"
    )
    parser.add_argument(
        "--no-quantize", action="store_true",
        help="Skip quantisation (larger model, no accuracy loss)"
    )
    parser.add_argument(
        "--demo", action="store_true",
        help="Show what the conversion command would be without running it"
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if args.demo:
        print("Demo mode — showing conversion command without running it\n")
        quantize_flag = "" if args.no_quantize else "--quantize_uint16 *"
        print(f"tensorflowjs_converter \\")
        print(f"  --input_format tf_saved_model \\")
        print(f"  --output_format tfjs_graph_model \\")
        print(f"  --signature_name serving_default \\")
        print(f"  --saved_model_tags serve \\")
        if quantize_flag:
            print(f"  {quantize_flag} \\")
        print(f"  {input_path} \\")
        print(f"  {output_path}")
        print(f"\nInstall tensorflowjs: pip install tensorflowjs --break-system-packages")

        # Check if converted model already exists
        if (output_path / "model.json").exists():
            print(f"\nExisting converted model found at {output_path}:")
            demo_check(output_path)
        return

    if not input_path.exists():
        raise FileNotFoundError(
            f"SavedModel not found at {input_path}\n"
            "Run 3_train_model.py first to generate the model."
        )

    # Check if tensorflowjs is installed
    try:
        import tensorflowjs  # noqa: F401
    except ImportError:
        print("tensorflowjs not installed.")
        print("Install with: pip install tensorflowjs --break-system-packages")
        print("\nShowing what the conversion would do:")
        args.demo = True
        main()
        return

    convert(
        input_path=input_path,
        output_path=output_path,
        quantize=not args.no_quantize,
    )


if __name__ == "__main__":
    main()
