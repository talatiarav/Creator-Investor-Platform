#!/usr/bin/env python3
"""
1_generate_labels.py — Knowledge distillation: label generation step.

Uses Claude's vision API to classify Instagram post images and saves
the structured labels as the training dataset for the TensorFlow model.

Claude is the TEACHER model. The TF model we train is the STUDENT.
The student learns to replicate the teacher's classifications at a
fraction of the inference cost and latency.

Usage:
    python3 1_generate_labels.py --urls urls.txt --output ../data/labels/labels.jsonl
    python3 1_generate_labels.py --demo   # runs on 5 sample URLs without API key

The input file is one image URL per line.
Output is JSONL — one JSON object per line, one per successfully labeled image.

At scale, you'd pipe Instagram Graph API media URLs through this script.
"""

import json
import argparse
import time
import os
import base64
import urllib.request
from pathlib import Path
from typing import Optional

# Import taxonomy from the same directory
import sys
sys.path.insert(0, str(Path(__file__).parent))
from taxonomy import DIMENSIONS, LABEL_TO_IDX

# ── Claude API call ───────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a brand identity classifier for Instagram content creators.
You analyze post images and classify them into fixed taxonomies.
Always respond with valid JSON only. No preamble, no markdown, no explanation."""

def build_classification_prompt() -> str:
    dims = DIMENSIONS
    return f"""Analyze this Instagram post image and classify it.

Return a JSON object with exactly these fields:
{{
  "category":  "<one of: {', '.join(dims['category'])}>",
  "aesthetic": "<one of: {', '.join(dims['aesthetic'])}>",
  "audience":  "<one of: {', '.join(dims['audience'])}>",
  "tone":      "<one of: {', '.join(dims['tone'])}>",
  "confidence": <float 0.0-1.0, your certainty in these classifications>,
  "key_signals": ["<2-3 brief visual observations that justify your classification>"]
}}

Use only the exact label strings listed above. Return only the JSON object."""


def classify_image_url(image_url: str, api_key: str, max_retries: int = 3) -> Optional[dict]:
    """
    Calls Claude's vision API with an image URL.
    Returns parsed JSON classification or None on failure.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=400,
                system=SYSTEM_PROMPT,
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "url", "url": image_url},
                        },
                        {
                            "type": "text",
                            "text": build_classification_prompt(),
                        },
                    ],
                }],
            )

            text = response.content[0].text.strip()
            parsed = json.loads(text)

            # Validate that all required fields are present and valid
            for dim, labels in DIMENSIONS.items():
                if dim not in parsed:
                    raise ValueError(f"Missing field: {dim}")
                if parsed[dim] not in labels:
                    raise ValueError(f"Invalid {dim} label: '{parsed[dim]}'")

            return parsed

        except json.JSONDecodeError as e:
            print(f"  [attempt {attempt+1}] JSON parse error: {e}")
        except ValueError as e:
            print(f"  [attempt {attempt+1}] Validation error: {e}")
        except Exception as e:
            print(f"  [attempt {attempt+1}] API error: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # exponential backoff

    return None


def classify_image_bytes(image_bytes: bytes, api_key: str) -> Optional[dict]:
    """
    Classifies an image from raw bytes (used for local images during testing).
    Encodes to base64 and sends as image data rather than URL.
    """
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=400,
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": build_classification_prompt()},
                ],
            }],
        )
        return json.loads(response.content[0].text.strip())
    except Exception as e:
        print(f"  Classification error: {e}")
        return None

# ── Demo mode (no API key required) ──────────────────────────────────────────

DEMO_LABELS = [
    {
        "url": "https://example.com/post1.jpg",
        "category": "Health & Fitness",
        "aesthetic": "Natural & Earthy",
        "audience": "Millennials (25-34)",
        "tone": "Inspirational",
        "confidence": 0.91,
        "key_signals": ["outdoor workout", "earthy tones", "motivational pose"],
        "category_idx": LABEL_TO_IDX["category"]["Health & Fitness"],
        "aesthetic_idx": LABEL_TO_IDX["aesthetic"]["Natural & Earthy"],
        "audience_idx": LABEL_TO_IDX["audience"]["Millennials (25-34)"],
        "tone_idx": LABEL_TO_IDX["tone"]["Inspirational"],
    },
    {
        "url": "https://example.com/post2.jpg",
        "category": "Fashion & Style",
        "aesthetic": "Minimalist & Clean",
        "audience": "Gen Z (18-24)",
        "tone": "Aspirational",
        "confidence": 0.87,
        "key_signals": ["neutral palette", "studio lighting", "minimal accessories"],
        "category_idx": LABEL_TO_IDX["category"]["Fashion & Style"],
        "aesthetic_idx": LABEL_TO_IDX["aesthetic"]["Minimalist & Clean"],
        "audience_idx": LABEL_TO_IDX["audience"]["Gen Z (18-24)"],
        "tone_idx": LABEL_TO_IDX["tone"]["Aspirational"],
    },
    {
        "url": "https://example.com/post3.jpg",
        "category": "Food & Cooking",
        "aesthetic": "Vibrant & Colourful",
        "audience": "Millennials (25-34)",
        "tone": "Educational",
        "confidence": 0.93,
        "key_signals": ["colorful ingredients", "recipe-style layout", "bright overhead shot"],
        "category_idx": LABEL_TO_IDX["category"]["Food & Cooking"],
        "aesthetic_idx": LABEL_TO_IDX["aesthetic"]["Vibrant & Colourful"],
        "audience_idx": LABEL_TO_IDX["audience"]["Millennials (25-34)"],
        "tone_idx": LABEL_TO_IDX["tone"]["Educational"],
    },
]

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate training labels using Claude vision")
    parser.add_argument("--urls", type=str, help="Path to file with one image URL per line")
    parser.add_argument("--output", type=str, default="../data/labels/labels.jsonl",
                        help="Output JSONL file path")
    parser.add_argument("--demo", action="store_true",
                        help="Run in demo mode with synthetic labels (no API key needed)")
    parser.add_argument("--min-confidence", type=float, default=0.6,
                        help="Skip labels below this confidence threshold (default: 0.6)")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="Seconds between API calls to respect rate limits (default: 0.5)")
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # ── Demo mode ─────────────────────────────────────────────────────────────
    if args.demo:
        print("Running in demo mode — writing synthetic labels")
        with open(output_path, "w") as f:
            for label in DEMO_LABELS:
                f.write(json.dumps(label) + "\n")
        print(f"Wrote {len(DEMO_LABELS)} demo labels to {output_path}")
        print("\nLabel structure:")
        print(json.dumps(DEMO_LABELS[0], indent=2))
        return

    # ── Real mode ─────────────────────────────────────────────────────────────
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("Set ANTHROPIC_API_KEY environment variable")

    if not args.urls:
        raise ValueError("Provide --urls path or use --demo")

    urls = Path(args.urls).read_text().strip().splitlines()
    urls = [u.strip() for u in urls if u.strip()]
    print(f"Labeling {len(urls)} images...")

    # Load existing labels to allow resuming interrupted runs
    existing_urls: set[str] = set()
    if output_path.exists():
        with open(output_path) as f:
            for line in f:
                try:
                    existing_urls.add(json.loads(line)["url"])
                except Exception:
                    pass
        print(f"Resuming — {len(existing_urls)} already labeled, skipping")

    labeled = skipped_low_conf = failed = 0

    with open(output_path, "a") as out_file:
        for i, url in enumerate(urls):
            if url in existing_urls:
                continue

            print(f"[{i+1}/{len(urls)}] {url[:60]}...")
            result = classify_image_url(url, api_key)

            if result is None:
                print("  FAILED — skipping")
                failed += 1
                continue

            if result["confidence"] < args.min_confidence:
                print(f"  Low confidence ({result['confidence']:.2f}) — skipping")
                skipped_low_conf += 1
                continue

            # Enrich with integer indices for fast training
            record = {
                "url": url,
                **result,
                "category_idx":  LABEL_TO_IDX["category"][result["category"]],
                "aesthetic_idx": LABEL_TO_IDX["aesthetic"][result["aesthetic"]],
                "audience_idx":  LABEL_TO_IDX["audience"][result["audience"]],
                "tone_idx":      LABEL_TO_IDX["tone"][result["tone"]],
            }

            out_file.write(json.dumps(record) + "\n")
            out_file.flush()
            labeled += 1

            print(f"  ✓ {result['category']} / {result['aesthetic']} "
                  f"(confidence: {result['confidence']:.2f})")

            if args.delay > 0:
                time.sleep(args.delay)

    print(f"\nDone — {labeled} labeled, {skipped_low_conf} low-confidence, {failed} failed")
    print(f"Output: {output_path}")
    # Estimated cost: ~$0.01 per image with Claude Sonnet
    print(f"Estimated labeling cost: ~${labeled * 0.01:.2f}")


if __name__ == "__main__":
    main()
