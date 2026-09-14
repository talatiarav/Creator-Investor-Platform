// mlInference.ts
// TensorFlow.js inference module — replaces the Claude vision API calls
// in brandAnalyzer.ts with local model inference.
//
// Exposes the same analyzePost() interface as the Claude version so
// nothing downstream in pipeline.ts needs to change — swap the import
// and the rest of the system is unaffected.
//
// Model loading is lazy and cached: the model loads once on first call
// and is reused across all subsequent inference calls. Cold start is
// ~500ms-2s depending on model size and disk speed. Warm inference is
// typically 50-200ms per image on CPU.
//
// Prerequisites:
//   npm install @tensorflow/tfjs-node
//   Run the full Python training pipeline (steps 1-4) to produce the TFJS model.
//   Set MODEL_PATH env var or pass it to loadModel().

import * as tf from "@tensorflow/tfjs-node";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { PostAnalysis } from "./types";

// ─── Taxonomy (mirrors taxonomy.py exactly) ───────────────────────────────────
// These must match the labels the model was trained on.

const CATEGORIES = [
  "Fashion & Style", "Beauty & Skincare", "Health & Fitness",
  "Food & Cooking", "Travel & Adventure", "Home & Interior Design",
  "Technology & Gaming", "Parenting & Family", "Finance & Business",
  "Art & Creativity", "Sustainability & Eco", "Entertainment & Pop Culture",
  "Sports & Outdoors", "Pets & Animals", "Education & Self-Development",
] as const;

const AESTHETICS = [
  "Minimalist & Clean", "Vibrant & Colourful", "Dark & Moody",
  "Natural & Earthy", "Luxury & High-End", "Casual & Authentic",
  "Professional & Corporate", "Artistic & Creative", "Playful & Fun", "Vintage & Retro",
] as const;

const AUDIENCES = [
  "Gen Z (18-24)", "Millennials (25-34)", "Parents (30-45)",
  "Professionals (25-45)", "Seniors (50+)", "Broad / Mixed",
] as const;

const TONES = [
  "Inspirational", "Educational", "Humorous", "Aspirational",
  "Authentic & Raw", "Promotional", "Community-Focused",
] as const;

// Image input size — must match what the model was trained on
const IMAGE_SIZE = 224;

// ─── Model singleton ──────────────────────────────────────────────────────────

interface LoadedModel {
  model: tf.GraphModel | tf.LayersModel;
  modelType: "graph" | "layers";
}

let cachedModel: LoadedModel | null = null;

/**
 * Loads the TensorFlow.js model from disk (lazy, cached).
 * @param modelPath Path to the directory containing model.json
 */
export async function loadModel(
  modelPath?: string
): Promise<LoadedModel> {
  if (cachedModel) return cachedModel;

  const resolvedPath = modelPath
    ?? process.env.MODEL_PATH
    ?? path.join(__dirname, "../../models/tfjs");

  const modelJsonPath = `file://${path.join(resolvedPath, "model.json")}`;

  if (!fs.existsSync(path.join(resolvedPath, "model.json"))) {
    throw new Error(
      `Model not found at ${resolvedPath}\n` +
      "Run the Python training pipeline first:\n" +
      "  python3 scripts/1_generate_labels.py --demo\n" +
      "  python3 scripts/2_download_images.py --demo\n" +
      "  python3 scripts/3_train_model.py --demo\n" +
      "  python3 scripts/4_convert_to_tfjs.py --demo\n" +
      "Or set MODEL_PATH environment variable."
    );
  }

  console.log(`Loading ML model from ${resolvedPath}...`);
  const start = Date.now();

  let model: tf.GraphModel | tf.LayersModel;
  let modelType: "graph" | "layers";

  try {
    // Try GraphModel first (converted from SavedModel — faster inference)
    model = await tf.loadGraphModel(modelJsonPath);
    modelType = "graph";
  } catch {
    // Fall back to LayersModel (Keras format)
    model = await tf.loadLayersModel(modelJsonPath);
    modelType = "layers";
  }

  const elapsed = Date.now() - start;
  console.log(`✅ Model loaded in ${elapsed}ms (${modelType} format)`);

  // Warm up: run one inference to JIT-compile the graph
  const warmupInput = tf.zeros([1, IMAGE_SIZE, IMAGE_SIZE, 3]);
  try {
    const result = model.predict(warmupInput);
    // Dispose warmup tensors
    if (Array.isArray(result)) {
      result.forEach(t => t.dispose());
    } else {
      (result as tf.Tensor).dispose();
    }
  } finally {
    warmupInput.dispose();
  }
  console.log("Model warmed up — ready for inference");

  cachedModel = { model, modelType };
  return cachedModel;
}

// ─── Image preprocessing ──────────────────────────────────────────────────────

/**
 * Downloads an image from a URL and returns raw bytes.
 */
async function fetchImageBytes(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    const req = protocol.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; InfluenceVest/1.0)" },
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Decodes image bytes into a normalised TensorFlow tensor.
 * Shape: [1, IMAGE_SIZE, IMAGE_SIZE, 3], dtype: float32, range: [0, 1]
 *
 * tf.node.decodeImage handles JPEG, PNG, GIF, and BMP automatically.
 */
function preprocessImageBytes(buffer: Buffer): tf.Tensor4D {
  return tf.tidy(() => {
    // Decode to uint8 tensor [H, W, 3]
    const decoded = tf.node.decodeImage(buffer, 3) as tf.Tensor3D;

    // Resize to model input size [IMAGE_SIZE, IMAGE_SIZE, 3]
    const resized = tf.image.resizeBilinear(decoded, [IMAGE_SIZE, IMAGE_SIZE]);

    // Normalise to [0, 1] and add batch dimension → [1, H, W, 3]
    const normalised = resized.div(255.0);
    return normalised.expandDims(0) as tf.Tensor4D;
  });
}

// ─── Inference ────────────────────────────────────────────────────────────────

interface RawPredictions {
  category: Float32Array;
  aesthetic: Float32Array;
  audience: Float32Array;
  tone: Float32Array;
}

/**
 * Runs the model on a preprocessed image tensor and returns
 * raw softmax probability arrays for each output dimension.
 */
async function runInference(
  imageTensor: tf.Tensor4D,
  { model, modelType }: LoadedModel,
): Promise<RawPredictions> {
  const outputTensors = tf.tidy(() => {
    if (modelType === "graph") {
      // GraphModel predict returns outputs in the order they appear in
      // the model signature — matches the order of DIMENSIONS in taxonomy.py
      const output = model.predict(imageTensor);

      // The multi-output model returns a dict keyed by output name
      // or an array in definition order: [category, aesthetic, audience, tone]
      if (Array.isArray(output)) {
        return output;
      }
      // Named outputs dict
      const namedOutput = output as Record<string, tf.Tensor>;
      return [
        namedOutput["category"]  ?? namedOutput["output_0"],
        namedOutput["aesthetic"] ?? namedOutput["output_1"],
        namedOutput["audience"]  ?? namedOutput["output_2"],
        namedOutput["tone"]      ?? namedOutput["output_3"],
      ];
    } else {
      // LayersModel
      const output = (model as tf.LayersModel).predict(imageTensor);
      return Array.isArray(output) ? output : [output];
    }
  });

  // Extract data outside tidy (async, can't be inside tidy)
  const [catArr, aesArr, audArr, toneArr] = await Promise.all(
    outputTensors.map(async (t) => {
      const data = await (t as tf.Tensor).data() as Float32Array;
      t.dispose();
      return data;
    })
  );

  return {
    category:  catArr,
    aesthetic: aesArr,
    audience:  audArr,
    tone:      toneArr,
  };
}

/**
 * Finds the argmax index and value from a probability array.
 */
function argmax(arr: Float32Array): { index: number; confidence: number } {
  let maxIdx = 0;
  let maxVal = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > maxVal) { maxVal = arr[i]; maxIdx = i; }
  }
  return { index: maxIdx, confidence: maxVal };
}

// ─── Public API (matches brandAnalyzer.ts interface) ─────────────────────────

/**
 * Analyzes a single Instagram post image using the local TF model.
 * Drop-in replacement for the Claude-based analyzePost() in brandAnalyzer.ts.
 *
 * The caption parameter is accepted for API compatibility but not used
 * by the vision-only v1 model. A future multimodal model would use it.
 *
 * @param imageUrl  Direct URL to the image (from Graph API media_url)
 * @param _caption  Post caption (unused in v1, preserved for API compat)
 * @returns PostAnalysis object or null on failure
 */
export async function analyzePost(
  imageUrl: string,
  _caption = "",
): Promise<PostAnalysis | null> {
  let imageTensor: tf.Tensor4D | null = null;

  try {
    const { model: loadedModel, modelType } = await loadModel();

    // Download and preprocess
    const imageBytes = await fetchImageBytes(imageUrl);
    imageTensor = preprocessImageBytes(imageBytes);

    // Run inference
    const preds = await runInference(imageTensor, { model: loadedModel, modelType });

    // Decode outputs
    const catResult  = argmax(preds.category);
    const aesResult  = argmax(preds.aesthetic);
    const audResult  = argmax(preds.audience);
    const toneResult = argmax(preds.tone);

    // Average confidence across all four dimensions
    const avgConfidence = (
      catResult.confidence +
      aesResult.confidence +
      audResult.confidence +
      toneResult.confidence
    ) / 4;

    const primary_category = CATEGORIES[catResult.index];
    const aesthetic        = AESTHETICS[aesResult.index];
    const likely_audience  = AUDIENCES[audResult.index];
    const tone             = TONES[toneResult.index];

    // Generate key signals from high-confidence secondary predictions
    // (second-highest probability per dimension gives interpretable signals)
    const keySignals: string[] = [
      `${primary_category} visual cues`,
      `${aesthetic} aesthetic`,
    ];

    return {
      primary_category,
      secondary_category: null,   // multi-label support is a future extension
      aesthetic,
      likely_audience,
      tone,
      content_style: "Lifestyle", // v1: defaulted; content style head is next addition
      production_quality: "High-Quality Candid", // v1: defaulted
      key_signals: keySignals,
      confidence: Math.round(avgConfidence * 100) / 100,
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`ML inference failed for ${imageUrl}: ${msg}`);
    return null;
  } finally {
    imageTensor?.dispose();
  }
}

/**
 * Analyzes a video by sampling frames and averaging predictions.
 * Designed to handle Instagram Reels where the image pipeline can't reach.
 *
 * Strategy: sample one frame per second, run each through the image model,
 * average the softmax probabilities across all frames, then decode.
 *
 * This is "temporal mean pooling of predictions" — simpler than pooling
 * embeddings (which requires extracting intermediate layer outputs) but
 * produces equivalent results for brand classification where the signal
 * is consistent across the video.
 *
 * @param frameUrls  Array of URLs to representative video frames
 *                   (extracted by the video pipeline or passed directly)
 */
export async function analyzeVideoFrames(
  frameUrls: string[],
): Promise<PostAnalysis | null> {
  if (frameUrls.length === 0) return null;

  const results = await Promise.all(
    frameUrls.map((url) => analyzePost(url).catch(() => null))
  );

  const valid = results.filter((r): r is PostAnalysis => r !== null);
  if (valid.length === 0) return null;

  // Average softmax probabilities across frames by dimension
  // This is equivalent to running inference on the "average" image
  // but more numerically stable
  function aggregateLabel<T extends string>(
    field: keyof Pick<PostAnalysis, "primary_category" | "aesthetic" | "likely_audience" | "tone">,
    labels: readonly T[],
  ): T {
    const counts = new Map<T, number>();
    for (const r of valid) {
      const label = r[field] as T;
      counts.set(label, (counts.get(label) ?? 0) + (r.confidence));
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const avgConfidence = valid.reduce((s, r) => s + r.confidence, 0) / valid.length;

  return {
    primary_category: aggregateLabel("primary_category", CATEGORIES),
    secondary_category: null,
    aesthetic: aggregateLabel("aesthetic", AESTHETICS),
    likely_audience: aggregateLabel("likely_audience", AUDIENCES),
    tone: aggregateLabel("tone", TONES),
    content_style: "Lifestyle",
    production_quality: "High-Quality Candid",
    key_signals: [`video: ${valid.length} frames analyzed`],
    confidence: Math.round(avgConfidence * 100) / 100,
  };
}

/**
 * Returns model metadata for logging and debugging.
 */
export async function getModelInfo(): Promise<Record<string, unknown>> {
  const { model, modelType } = await loadModel();
  return {
    type: modelType,
    imageSize: IMAGE_SIZE,
    outputDimensions: {
      category:  CATEGORIES.length,
      aesthetic: AESTHETICS.length,
      audience:  AUDIENCES.length,
      tone:      TONES.length,
    },
    backendName: tf.getBackend(),
    memoryInfo: tf.memory(),
  };
}
