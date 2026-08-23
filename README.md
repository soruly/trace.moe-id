# trace.moe-id

[![License](https://img.shields.io/github/license/soruly/trace.moe-id.svg?style=flat-square)](https://github.com/soruly/trace.moe-id/blob/master/LICENSE)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/soruly/trace.moe-id/node.js.yml?style=flat-square)](https://github.com/soruly/trace.moe-id/actions)
[![pipeline status](https://gitlab.com/soruly/trace.moe-id/badges/master/pipeline.svg?style=flat-square)](https://gitlab.com/soruly/trace.moe-id/commits/master)
[![npm](https://img.shields.io/npm/v/trace.moe-id.svg?style=flat-square)](https://www.npmjs.com/package/trace.moe-id)
[![Discord](https://img.shields.io/discord/437578425767559188.svg?style=flat-square)](https://discord.gg/K9jn6Kj)

**trace.moe** - **I**mage **D**escriptor Extraction Tool. Fast, zero-dependency, isomorphic JavaScript / TypeScript library for extracting visual feature vectors from raw image pixels.

Designed for reverse image search, content-based image retrieval (CBIR), and visual similarity indexing with tools like Solr, Elasticsearch, PostgreSQL, or vector databases.

---

## Features

- **Zero Runtime Dependencies**: Works in Node.js, Web Browsers, Web Workers, and Edge runtimes.
- **Fast Performance**:
  - Extracts thumbnails in sub-millisecond times ($>5,000\text{ img/s}$ on modern CPU cores).
  - Distance metrics exceed $1,000,000\text{ to }4,000,000\text{ comparisons/s}$.
- **Full TypeScript Support**: Comprehensive type definitions for all extractors, inputs, and outputs.

---

## Supported Descriptors

| Code     | Extractor              | Feature Vector                                    | Packed Bytes              | Distance Metric           | Description                                                           |
| :------- | :--------------------- | :------------------------------------------------ | :------------------------ | :------------------------ | :-------------------------------------------------------------------- |
| **`cl`** | `ColorLayout`          | 33 values (21 Y, 6 Cb, 6 Cr)                      | 35 bytes                  | MPEG-7 Weighted Euclidean | MPEG-7 spatial color distribution via $8\times 8$ DCT                 |
| **`eh`** | `EdgeHistogram`        | 80 bins (16 sub-images $\times$ 5 edge types)     | 40 bytes                  | MPEG-7 Edge Metric        | MPEG-7 spatial distribution of 5 directional edge types               |
| **`ce`** | `CEDD`                 | 144 bins                                          | Variable ($\le 54$ bytes) | Tanimoto Distance         | Color and Edge Directivity Descriptor (Fuzzy 10/24 color + edges)     |
| **`fc`** | `FCTH`                 | 192 bins                                          | Variable ($\le 72$ bytes) | Tanimoto Distance         | Fuzzy Color and Texture Histogram (Fuzzy 10/24 color + Haar wavelets) |
| **`jc`** | `JCD`                  | 168 bins                                          | Variable ($\le 54$ bytes) | Tanimoto Distance         | Joint Composite Descriptor combining CEDD and FCTH                    |
| **`ac`** | `AutoColorCorrelogram` | 256 entries (64 HSV colors $\times$ 4 distances)  | 128 bytes                 | Jensen-Shannon Divergence | Spatial color correlations across distance radii $D=\{1, 2, 3, 4\}$   |
| **`oh`** | `OpponentHistogram`    | 64 bins ($4 \times 4 \times 4$ in Opponent space) | 64 bytes                  | Jensen-Shannon Divergence | Shift-invariant color histogram in $(O_1, O_2, O_3)$ space            |

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

// Extract a single descriptor (e.g. ColorLayout)
const cl = ColorLayout.extract(image);
console.log(cl.featureVector); // number[]: [38, 5, 2, ...] (33 coefficients)
console.log(cl.byteArray); // Uint8Array(35): [21, 6, ...]
console.log(cl.base64); // string: Base64 string for Solr/DB indexing

// Extract all descriptors by default
const all = extract(image);
console.log(all.cl.base64);
console.log(all.eh.base64);
console.log(all.ce.base64);
console.log(all.fc.base64);
console.log(all.jc.base64);
console.log(all.ac.base64);
console.log(all.oh.base64);

// Extract only two specific descriptors (e.g. ColorLayout & EdgeHistogram)
const { cl, eh } = extract(image, ["cl", "eh"]);
console.log(cl.base64);
console.log(eh.base64);
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

const ceddResult = CEDD.extract(image);
console.log(ceddResult.base64);
```

### 3. Measuring Visual Distance Between Two Images

Each extractor provides a `.distance()` method implementing its standardized metric:

```typescript
import { ColorLayout, CEDD } from "trace.moe-id";

const img1 = ColorLayout.extract(image1);
const img2 = ColorLayout.extract(image2);

// Compare using either byte arrays or raw feature vectors:
const dist = ColorLayout.distance(img1.byteArray, img2.byteArray);
console.log(`Visual Distance: ${dist}`); // 0 = identical
```

---

## Benchmarks

Benchmark performed on a single Node.js thread:

### Extraction Throughput ($320 \times 240$ Thumbnail)

| Extractor | Algorithm            | Avg Time    | Throughput            |
| :-------- | :------------------- | :---------- | :-------------------- |
| **`eh`**  | MPEG-7 EdgeHistogram | **0.18 ms** | **~5,600 images/sec** |
| **`cl`**  | MPEG-7 ColorLayout   | **0.25 ms** | **~4,060 images/sec** |
| **`oh`**  | OpponentHistogram    | **0.44 ms** | **~2,260 images/sec** |
| **`ce`**  | CEDD                 | **0.76 ms** | **~1,310 images/sec** |
| **`fc`**  | FCTH                 | **1.25 ms** | **~800 images/sec**   |
| **`jc`**  | JCD                  | **1.75 ms** | **~570 images/sec**   |

### Distance Throughput (1 vs 1 Visual Comparison)

| Distance Metric          | Avg Time / Comparison | Comparisons / Second   |
| :----------------------- | :-------------------- | :--------------------- |
| **EdgeHistogram (`eh`)** | < 0.0003 ms           | **~4,450,000 ops/sec** |
| **CEDD (`ce`)**          | 0.0006 ms             | **~1,560,000 ops/sec** |
| **FCTH (`fc`)**          | 0.0007 ms             | **~1,310,000 ops/sec** |
| **ColorLayout (`cl`)**   | 0.0008 ms             | **~1,240,000 ops/sec** |
| **JCD (`jc`)**           | 0.0008 ms             | **~1,140,000 ops/sec** |

---

## Testing & Verification

Run the built-in regression test suite (170 test cases across 21 synthetic pattern images & edge cases):

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
