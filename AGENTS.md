# AGENTS.md

Welcome to **`trace.moe-id`**. This guide outlines the project structure, architectural principles, coding conventions, and testing practices for AI agents working in this repository.

---

## 1. Project Overview

`trace.moe-id` is a high-performance, zero-runtime-dependency, isomorphic TypeScript library for extracting classical visual feature descriptors (MPEG-7, CEDD, FCTH, JCD, AutoColorCorrelogram, OpponentHistogram) from raw image pixels.

### Supported Feature Extractors

| Code     | Extractor              | Feature Vector Size | Packed Byte Size          | Metric                     |
| :------- | :--------------------- | :------------------ | :------------------------ | :------------------------- |
| **`cl`** | `ColorLayout`          | 33 coefficients     | 35 bytes                  | MPEG-7 Weighted Euclidean  |
| **`eh`** | `EdgeHistogram`        | 80 bins             | 40 bytes                  | MPEG-7 Local/Global Metric |
| **`ce`** | `CEDD`                 | 144 bins            | Variable ($\le 54$ bytes) | Tanimoto Distance          |
| **`fc`** | `FCTH`                 | 192 bins            | Variable ($\le 72$ bytes) | Tanimoto Distance          |
| **`jc`** | `JCD`                  | 168 bins            | Variable ($\le 54$ bytes) | Tanimoto Distance          |
| **`ac`** | `AutoColorCorrelogram` | 256 entries         | 128 bytes                 | Jensen-Shannon Divergence  |
| **`oh`** | `OpponentHistogram`    | 64 bins             | 64 bytes                  | Jensen-Shannon Divergence  |

---

## 2. Directory Structure

```
l2/
├── src/                        # TypeScript source code
│   ├── types.ts                # Common interfaces (PixelData, FeatureResult, FeatureExtractor)
│   ├── utils.ts                # Standalone Base64 and RGB pixel helpers
│   ├── colorLayout.ts          # MPEG-7 ColorLayout (8x8 DCT, quantization, zig-zag)
│   ├── edgeHistogram.ts        # MPEG-7 EdgeHistogram (5-kernel spatial edge filters)
│   ├── cedd.ts                 # CEDD (fuzzy 10/24 color binning + edge directivity)
│   ├── fcth.ts                 # FCTH (fuzzy 10/24 color binning + Haar wavelets)
│   ├── jcd.ts                  # Joint Composite Descriptor (CEDD + FCTH join)
│   ├── autoColorCorrelogram.ts # AutoColorCorrelogram (64 HSV colors, 4 distance radii)
│   ├── opponentHistogram.ts    # OpponentHistogram (64-bin O1, O2, O3 space)
│   └── index.ts                # Main entry point exporting all descriptors and extract()
├── test/                       # Test and benchmark suite
│   ├── extract.test.js         # Node.js test runner suite (170 regression tests)
│   ├── generate_patterns.js    # Synthetic pattern and fixture generator
│   ├── benchmark.js            # Extraction and distance throughput benchmarks
│   └── fixtures/               # 21 synthetic pattern images and reference_results.json
├── package.json                # Project configuration, scripts, devDependencies
├── tsconfig.json               # NodeNext TypeScript compiler options
└── .prettierrc                 # Code formatting rules
```

---

## 3. Core Architectural Rules

1. **Zero Runtime Dependencies**:
   - `src/` must NEVER import external third-party libraries.
   - All image math, DCT transforms, wavelets, fuzzy rules, bit packing, Base64 conversion, and distance metrics must remain self-contained.
   - `sharp` is only used as a devDependency in tests/benchmarks for loading files from disk.

2. **Pixel Format Agnostic & Isomorphic**:
   - Input format is `PixelData { data: ArrayLike<number>; width: number; height: number; channels?: number }`.
   - Always support both 3-channel (RGB) and 4-channel (RGBA) pixel buffers using `const channels = image.channels ?? 4;`.
   - `src/utils.ts` provides fallback Base64 encode/decode using standard web APIs (`btoa`/`atob`) when running in browser environments without Node's `Buffer`.

3. **Standardized Interface**:
   Every descriptor implements the `FeatureExtractor` interface:
   - `extract(image: PixelData): FeatureResult`
     - Returns `{ featureVector: number[], byteArray: Uint8Array, base64: string }`
   - `distance(a: ArrayLike<number> | Uint8Array, b: ArrayLike<number> | Uint8Array): number`
     - Supports comparing both unquantized feature vectors and packed byte arrays.

4. **Distance Metric Invariants**:
   Every distance calculation must satisfy metric properties:
   - Identity: $d(x, x) = 0$
   - Non-negativity: $d(x, y) \ge 0$
   - Symmetry: $d(x, y) = d(y, x)$

---

## 4. Development Workflow & Commands

Always verify changes using the standard scripts:

```bash
# Compile TypeScript to dist/
npm run build

# Run full test suite (170 test cases against synthetic patterns)
npm test

# Check code formatting with Prettier
npm run lint

# Automatically format all files
npm run format

# Run performance benchmarks
npm run bench
```
