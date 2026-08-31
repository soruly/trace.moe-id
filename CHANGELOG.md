# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **ColorLayout Performance Optimizations**:
  - Implemented upfront integer scanline grid coordinate calculation (`xStart`, `yStart`), eliminating per-pixel floating-point division and `Math.floor()` operations.
  - Reorganized image traversal to scan rows and blocks sequentially (`by` $\rightarrow$ `y` $\rightarrow$ `bx` $\rightarrow$ `x`), enabling monotonic pointer iteration (`ptr += channels`) for optimal CPU L1/L2 cache locality.
  - Switched color space conversion from per-pixel evaluation to 8×8 block average level, reducing floating-point color conversions from $W \times H$ times to exactly 64 times per frame.
  - Optimized 1D DCT stage with flat `Float32Array` buffers and fast inverse multiplication.
  - Achieved ~2.8× speedup on thumbnails (15,300+ ops/sec at 320×240) and ~3.8× speedup on high-resolution images (1,580+ ops/sec at 1024×681).

### Fixed

- Updated regression test reference fixtures in `test/fixtures/reference_results.json` to reflect the optimized ColorLayout coefficient calculations.

---

## [1.0.0] - 2026-08-31

### Added

- **Zero-Dependency Core**:
  - Isomorphic TypeScript library running in Node.js, Web Browsers, Web Workers, and Edge runtimes.
  - Native support for both 3-channel (RGB) and 4-channel (RGBA) pixel buffers.
  - Standalone Base64 encoding/decoding utilities without external dependencies.
- **Visual Feature Extractors**:
  - **ColorLayout (`cl`)**: MPEG-7 spatial color distribution via 8×8 Discrete Cosine Transform (DCT), zig-zag scanning, non-linear quantization, and MPEG-7 weighted Euclidean distance.
  - **EdgeHistogram (`eh`)**: MPEG-7 spatial distribution of 5 directional edge filters (horizontal, vertical, 45°, 135°, non-directional) across 16 sub-images with local/global metric.
  - **CEDD (`ce`)**: Color and Edge Directivity Descriptor combining 10/24 fuzzy color binning and 6-region edge detection with Tanimoto distance metric.
  - **FCTH (`fc`)**: Fuzzy Color and Texture Histogram combining 10/24 fuzzy color binning and 8-region Haar wavelet transform with Tanimoto distance metric.
  - **JCD (`jc`)**: Joint Composite Descriptor combining CEDD and FCTH into a 168-bin texture/color descriptor.
  - **AutoColorCorrelogram (`ac`)**: Spatial color correlations across 64 quantized HSV colors across distance radii $D = \{1, 2, 3, 4\}$ with Jensen-Shannon Divergence.
  - **OpponentHistogram (`oh`)**: 64-bin shift-invariant color histogram in $(O_1, O_2, O_3)$ opponent space with Jensen-Shannon Divergence.
- **Convenience API**:
  - Unified `extract()` function for extracting single or batch visual descriptors in a single call.
  - Full TypeScript types and interfaces (`PixelData`, `FeatureResult`, `FeatureExtractor`, `FeatureCode`).
- **Testing & Benchmarks**:
  - Comprehensive test runner suite with 170 synthetic pattern regression tests and distance metric property tests (identity, non-negativity, symmetry).
  - Built-in benchmarking suite (`npm run bench`) for measuring extraction speed and distance calculation throughput.
