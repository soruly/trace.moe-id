import sharp from "sharp";
import { performance } from "node:perf_hooks";
import {
  ColorLayout,
  EdgeHistogram,
  CEDD,
  FCTH,
  JCD,
  AutoColorCorrelogram,
  OpponentHistogram,
  extract,
} from "../dist/index.js";

const TEST_IMAGE_PATH =
  "/home/soruly/project/LIRE/testdata/ferrari/red/1408706779_ef3c0138e8_b.jpg";

async function loadImage(path, resizeTo = null) {
  let pipeline = sharp(path).ensureAlpha();
  if (resizeTo) {
    pipeline = pipeline.resize(resizeTo.width, resizeTo.height, { fit: "cover" });
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: 4,
  };
}

function runBenchmark(name, fn, iterations = 100, warmup = 5) {
  const warmupIters = Math.min(warmup, Math.max(1, Math.floor(iterations / 5)));
  // Warmup
  for (let i = 0; i < warmupIters; i++) {
    fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const totalMs = performance.now() - start;
  const avgMs = totalMs / iterations;
  const opsPerSec = (iterations / totalMs) * 1000;

  return {
    name,
    iterations,
    avgMs: Number(avgMs.toFixed(3)),
    opsPerSec: Math.round(opsPerSec),
  };
}

async function main() {
  console.log("===============================================================");
  console.log("  Handcrafted Feature Extraction Performance Benchmark (Node.js)");
  console.log("===============================================================");

  const fullImage = await loadImage(TEST_IMAGE_PATH);
  console.log(`Original Image Resolution: ${fullImage.width} x ${fullImage.height}`);

  const resizedImage = await loadImage(TEST_IMAGE_PATH, { width: 320, height: 240 });
  console.log(`Thumbnail Resolution:      ${resizedImage.width} x ${resizedImage.height}\n`);

  const resultsOriginal = [];
  const resultsResized = [];
  const distanceResults = [];

  const targets = [
    { code: "cl", name: "ColorLayout (cl)", extractor: ColorLayout, iters: 100 },
    { code: "eh", name: "EdgeHistogram (eh)", extractor: EdgeHistogram, iters: 50 },
    { code: "ce", name: "CEDD (ce)", extractor: CEDD, iters: 30 },
    { code: "fc", name: "FCTH (fc)", extractor: FCTH, iters: 30 },
    { code: "jc", name: "JCD (jc)", extractor: JCD, iters: 15 },
    { code: "oh", name: "OpponentHistogram (oh)", extractor: OpponentHistogram, iters: 100 },
    {
      code: "ac",
      name: "AutoColorCorrelogram (ac)",
      extractor: AutoColorCorrelogram,
      iters: 1,
      warmup: 0,
    },
  ];

  // 1. Benchmark on Original Full Size Image
  console.log("--- 1. Extraction Speed (Original Image) ---");
  for (const t of targets) {
    const res = runBenchmark(t.name, () => t.extractor.extract(fullImage), t.iters, t.warmup ?? 5);
    resultsOriginal.push(res);
  }
  const allResOrig = runBenchmark("extract (all 7 features)", () => extract(fullImage), 1, 0);
  resultsOriginal.push(allResOrig);
  console.table(resultsOriginal);

  // 2. Benchmark on Resized Thumbnail (320x240)
  console.log("\n--- 2. Extraction Speed (320x240 Thumbnail) ---");
  for (const t of targets) {
    const res = runBenchmark(
      t.name,
      () => t.extractor.extract(resizedImage),
      t.code === "ac" ? 10 : t.iters * 2,
      t.code === "ac" ? 2 : undefined,
    );
    resultsResized.push(res);
  }
  const allResThumb = runBenchmark("extract (all 7 features)", () => extract(resizedImage), 10, 2);
  resultsResized.push(allResThumb);
  console.table(resultsResized);

  // 3. Benchmark Distance Calculations (Cosine / Tanimoto / L1 / JSD)
  console.log("\n--- 3. Distance Calculation Throughput (Ops/sec) ---");
  for (const t of targets) {
    const feature1 = t.extractor.extract(fullImage);
    const feature2 = t.extractor.extract(resizedImage);
    const res = runBenchmark(
      `${t.name} distance`,
      () => t.extractor.distance(feature1, feature2),
      20000,
      500,
    );
    distanceResults.push(res);
  }
  console.table(distanceResults);
}

main().catch(console.error);
