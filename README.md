# trace.moe-id

[![License](https://img.shields.io/github/license/soruly/trace.moe-id.svg?style=flat-square)](https://github.com/soruly/trace.moe-id/blob/master/LICENSE)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/soruly/trace.moe-id/node.js.yml?style=flat-square)](https://github.com/soruly/trace.moe-id/actions)
[![npm](https://img.shields.io/npm/v/trace.moe-id.svg?style=flat-square)](https://www.npmjs.com/package/trace.moe-id)
[![Discord](https://img.shields.io/discord/437578425767559188.svg?style=flat-square)](https://discord.gg/K9jn6Kj)

**trace.moe** - **I**mage **D**escriptor Extraction Tool. Fast, zero-dependency, isomorphic JavaScript / TypeScript library for extracting visual feature vectors from raw image pixels.

Designed for reverse image search, content-based image retrieval (CBIR), and visual similarity indexing with tools like Solr, Elasticsearch, PostgreSQL, or vector databases.

---

## Features

- **Zero Runtime Dependencies**: Works in Node.js, Web Browsers, Web Workers, and Edge runtimes.
- **Fast Performance**:
  - Extracts thumbnails in sub-millisecond times (>5,000 img/s on modern CPU cores).
  - Distance metrics exceed 1,000,000 to 4,000,000 comparisons/s.
- **Full TypeScript Support**: Comprehensive type definitions for all extractors, inputs, and outputs.

---

## Supported Descriptors

| Code     | Extractor              | Feature Vector                            | URL-Safe Base64 Hash | Distance Metric           | Description                                                           |
| :------- | :--------------------- | :---------------------------------------- | :------------------- | :------------------------ | :-------------------------------------------------------------------- |
| **`cl`** | `ColorLayout`          | 33 values (21 Y, 6 Cb, 6 Cr)              | **28 chars**         | MPEG-7 Weighted Euclidean | MPEG-7 spatial color distribution via 8×8 DCT                         |
| **`eh`** | `EdgeHistogram`        | 80 bins (16 sub-images × 5 edge types)    | **40 chars**         | MPEG-7 Edge Metric        | MPEG-7 spatial distribution of 5 directional edge types               |
| **`ce`** | `CEDD`                 | 144 bins                                  | **72 chars**         | Tanimoto Distance         | Color and Edge Directivity Descriptor (Fuzzy 10/24 color + edges)     |
| **`fc`** | `FCTH`                 | 192 bins                                  | **96 chars**         | Tanimoto Distance         | Fuzzy Color and Texture Histogram (Fuzzy 10/24 color + Haar wavelets) |
| **`jc`** | `JCD`                  | 168 bins                                  | **112 chars**        | Tanimoto Distance         | Joint Composite Descriptor combining CEDD and FCTH                    |
| **`oh`** | `OpponentHistogram`    | 64 bins (4 × 4 × 4 in Opponent space)     | **75 chars**         | Jensen-Shannon Divergence | Shift-invariant color histogram in (O1, O2, O3) space                 |
| **`ac`** | `AutoColorCorrelogram` | 256 entries (64 HSV colors × 4 distances) | **171 chars**        | Jensen-Shannon Divergence | Spatial color correlations across distance radii D = {1, 2, 3, 4}     |

> Note: All implementations are verified against the reference [LIRE](https://github.com/dermotte/LIRE) implementations.

---

## Installation

```bash
npm install trace.moe-id
```

---

## Usage

### 1. Node.js (with `sharp`)

```typescript
import sharp from "sharp";
import { ColorLayout, CEDD, extract } from "trace.moe-id";

// Load raw pixel buffer via Sharp
const { data, info } = await sharp("input.jpg").raw().toBuffer({ resolveWithObject: true });

const image = {
  data: new Uint8Array(data),
  width: info.width,
  height: info.height,
  channels: info.channels, // supports 3 (RGB) or 4 (RGBA)
};

// Extract a single descriptor vector (e.g. ColorLayout)
const vector = ColorLayout.extract(image); // number[]: [38, 5, 2, ...] (33 coefficients)

// Encode into compact URL-safe base64 hash string
const hash = ColorLayout.encode(vector); // string: "ChCEIQhCEIQhCEIQhCCEIQhBCEIQ" (28 chars)

// Decode hash string back into feature vector
const decoded = ColorLayout.decode(hash); // number[]

// Extract all descriptors at once
const all = extract(image);
console.log(all.cl); // number[] (ColorLayout)
console.log(all.eh); // number[] (EdgeHistogram)
console.log(all.ce); // number[] (CEDD)
console.log(all.fc); // number[] (FCTH)
console.log(all.jc); // number[] (JCD)
console.log(all.ac); // number[] (AutoColorCorrelogram)
console.log(all.oh); // number[] (OpponentHistogram)

// Extract specific descriptors
const { cl, eh } = extract(image, ["cl", "eh"]);
```

### 2. Web Browser (with HTML5 `<canvas>` / `ImageData`)

```typescript
import { ColorLayout, CEDD } from "trace.moe-id";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

const image = {
  data: imageData.data,
  width: imageData.width,
  height: imageData.height,
  channels: 4, // getImageData always returns 4 channels (RGBA)
};

const ceddVector = CEDD.extract(image); // number[]: 144 bins
```

### 3. Measuring Visual Distance Between Two Images

Each extractor provides a `.distance()` method implementing its standardized metric:

```typescript
import { ColorLayout } from "trace.moe-id";

const vec1 = ColorLayout.extract(image1);
const vec2 = ColorLayout.extract(image2);

// Compare using either numerical vectors or compact URL-safe hash strings:
const distVectors = ColorLayout.distance(vec1, vec2);
const hash1 = ColorLayout.encode(vec1);
const hash2 = ColorLayout.encode(vec2);
const distHashes = ColorLayout.distance(hash1, hash2);

console.log(`Visual Distance: ${distVectors}`); // 0 = identical
```

### 4. Searching via trace.moe API

The extracted `ColorLayout` vector can be sent directly to `https://api.trace.moe/search` for fast search without uploading raw image files:

```typescript
const res = await fetch("https://api.trace.moe/search", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    vector: cl,
  }),
});
```

For more details and batch search examples, see the [trace.moe API documentation](https://soruly.github.io/trace.moe-api/#/docs?id=search-by-color-layout-vector).

---

## Benchmarks

Benchmark performed on a single Node.js thread:

### Extraction Throughput (320 × 240 Thumbnail)

| Extractor | Algorithm            | Avg Time    | Throughput            |
| :-------- | :------------------- | :---------- | :-------------------- |
| **`eh`**  | MPEG-7 EdgeHistogram | **0.18 ms** | **~5,600 images/sec** |
| **`cl`**  | MPEG-7 ColorLayout   | **0.25 ms** | **~4,060 images/sec** |
| **`oh`**  | OpponentHistogram    | **0.44 ms** | **~2,260 images/sec** |
| **`ce`**  | CEDD                 | **0.76 ms** | **~1,310 images/sec** |
| **`fc`**  | FCTH                 | **1.25 ms** | **~800 images/sec**   |
| **`jc`**  | JCD                  | **1.75 ms** | **~570 images/sec**   |
| **`ac`**  | AutoColorCorrelogram | **~95 ms**  | **~11 images/sec**    |

### Distance Throughput (1 vs 1 Visual Comparison)

| Distance Metric                 | Avg Time / Comparison | Comparisons / Second   |
| :------------------------------ | :-------------------- | :--------------------- |
| **EdgeHistogram (`eh`)**        | < 0.0003 ms           | **~4,450,000 ops/sec** |
| **CEDD (`ce`)**                 | 0.0006 ms             | **~1,560,000 ops/sec** |
| **FCTH (`fc`)**                 | 0.0007 ms             | **~1,310,000 ops/sec** |
| **ColorLayout (`cl`)**          | 0.0008 ms             | **~1,240,000 ops/sec** |
| **JCD (`jc`)**                  | 0.0008 ms             | **~1,140,000 ops/sec** |
| **OpponentHistogram (`oh`)**    | 0.0014 ms             | **~710,000 ops/sec**   |
| **AutoColorCorrelogram (`ac`)** | 0.0055 ms             | **~180,000 ops/sec**   |

---

## Testing & Verification

Run the built-in regression test suite (183 test cases across 21 synthetic pattern images & edge cases):

```bash
# Build TypeScript
npm run build

# Run unit and pattern regression tests
npm test

# Run performance benchmarks
npm run bench

# Format codebase with Prettier
npm run format
```

---

## License

[MIT](LICENSE) © [soruly](https://github.com/soruly)
