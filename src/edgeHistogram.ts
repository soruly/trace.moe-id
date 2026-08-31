import { FeatureExtractor, PixelData } from "./types.js";
import { encodeFixedBits, decodeFixedBits, bytesToBase64Url, base64UrlToBytes } from "./utils.js";

const QUANT_TABLE = [
  [0.010867, 0.057915, 0.099526, 0.144849, 0.195573, 0.260504, 0.358031, 0.530128],
  [0.012266, 0.069934, 0.125879, 0.182307, 0.243396, 0.314563, 0.411728, 0.564319],
  [0.004193, 0.025852, 0.04686, 0.068519, 0.093286, 0.12349, 0.161505, 0.22896],
  [0.004174, 0.025924, 0.046232, 0.067163, 0.089655, 0.115391, 0.151904, 0.217745],
  [0.006778, 0.051667, 0.10865, 0.166257, 0.224226, 0.285691, 0.356375, 0.450972],
];

const SQRT2 = Math.SQRT2;
const EDGE_FILTER = [
  [1.0, -1.0, 1.0, -1.0],
  [1.0, 1.0, -1.0, -1.0],
  [SQRT2, 0.0, 0.0, -SQRT2],
  [0.0, SQRT2, -SQRT2, 0.0],
  [2.0, -2.0, -2.0, 2.0],
];

const NO_EDGE = 0;
const VERTICAL_EDGE = 1;
const HORIZONTAL_EDGE = 2;
const NON_DIRECTIONAL_EDGE = 3;
const DIAGONAL_45_EDGE = 4;
const DIAGONAL_135_EDGE = 5;

/**
 * Encodes 80 3-bit EdgeHistogram bins into a compact URL-safe base64 string.
 */
export function encodeEdgeHistogram(vector: number[]): string {
  return bytesToBase64Url(encodeFixedBits(vector, 3, 30));
}

/**
 * Decodes a compact URL-safe base64 string into an 80-bin EdgeHistogram vector.
 */
export function decodeEdgeHistogram(hash: string): number[] {
  const bytes = base64UrlToBytes(hash);
  return decodeFixedBits(bytes, 3, 80);
}

function extractEdgeHistogramVector(image: PixelData): number[] {
  const width = image.width;
  const height = image.height;
  const channels = image.channels ?? 4;
  const data = image.data;

  // 1. Calculate block size
  const a = Math.floor(Math.sqrt((width * height) / 1100));
  let blockSize = Math.floor(a / 2) * 2;
  if (blockSize <= 0) blockSize = 2;
  const halfBlock = blockSize >> 1;
  const invBlockArea4 = 4.0 / (blockSize * blockSize);

  // 2. Convert to luminance (grey level)
  const grey = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const yy = (0.299 * r + 0.587 * g + 0.114 * b) / 256.0;
      grey[rowOffset + x] = Math.floor(219.0 * yy + 16.5);
    }
  }

  const localHistogram = new Float64Array(80);
  const countLocal = new Int32Array(16);

  // 3. Process blocks
  for (let y = 0; y <= height - blockSize; y += blockSize) {
    const subLocalY = Math.min(Math.floor((y * 4) / height), 3);
    for (let x = 0; x <= width - blockSize; x += blockSize) {
      const subLocalX = Math.min(Math.floor((x * 4) / width), 3);
      const subLocalIdx = (subLocalY << 2) + subLocalX;
      countLocal[subLocalIdx]++;

      // Compute average grey levels for 4 sub-blocks
      let avg1 = 0;
      let avg2 = 0;
      let avg3 = 0;
      let avg4 = 0;

      for (let j = 0; j < halfBlock; j++) {
        const row1 = (y + j) * width;
        const row2 = (y + halfBlock + j) * width;
        for (let i = 0; i < halfBlock; i++) {
          avg1 += grey[row1 + x + i];
          avg2 += grey[row1 + x + halfBlock + i];
          avg3 += grey[row2 + x + i];
          avg4 += grey[row2 + x + halfBlock + i];
        }
      }

      avg1 *= invBlockArea4;
      avg2 *= invBlockArea4;
      avg3 *= invBlockArea4;
      avg4 *= invBlockArea4;

      // Apply edge filters
      const avg = [avg1, avg2, avg3, avg4];
      let maxStrength = 0;
      let edgeType = NO_EDGE;

      const s0 = Math.abs(
        avg[0] * EDGE_FILTER[0][0] +
          avg[1] * EDGE_FILTER[0][1] +
          avg[2] * EDGE_FILTER[0][2] +
          avg[3] * EDGE_FILTER[0][3],
      );
      const s1 = Math.abs(
        avg[0] * EDGE_FILTER[1][0] +
          avg[1] * EDGE_FILTER[1][1] +
          avg[2] * EDGE_FILTER[1][2] +
          avg[3] * EDGE_FILTER[1][3],
      );
      const s2 = Math.abs(
        avg[0] * EDGE_FILTER[2][0] +
          avg[1] * EDGE_FILTER[2][1] +
          avg[2] * EDGE_FILTER[2][2] +
          avg[3] * EDGE_FILTER[2][3],
      );
      const s3 = Math.abs(
        avg[0] * EDGE_FILTER[3][0] +
          avg[1] * EDGE_FILTER[3][1] +
          avg[2] * EDGE_FILTER[3][2] +
          avg[3] * EDGE_FILTER[3][3],
      );
      const s4 = Math.abs(
        avg[0] * EDGE_FILTER[4][0] +
          avg[1] * EDGE_FILTER[4][1] +
          avg[2] * EDGE_FILTER[4][2] +
          avg[3] * EDGE_FILTER[4][3],
      );

      maxStrength = s0;
      edgeType = VERTICAL_EDGE;

      if (s1 > maxStrength) {
        maxStrength = s1;
        edgeType = HORIZONTAL_EDGE;
      }
      if (s2 > maxStrength) {
        maxStrength = s2;
        edgeType = DIAGONAL_45_EDGE;
      }
      if (s3 > maxStrength) {
        maxStrength = s3;
        edgeType = DIAGONAL_135_EDGE;
      }
      if (s4 > maxStrength) {
        maxStrength = s4;
        edgeType = NON_DIRECTIONAL_EDGE;
      }

      if (maxStrength < 11) {
        edgeType = NO_EDGE;
      }

      switch (edgeType) {
        case VERTICAL_EDGE:
          localHistogram[subLocalIdx * 5]++;
          break;
        case HORIZONTAL_EDGE:
          localHistogram[subLocalIdx * 5 + 1]++;
          break;
        case DIAGONAL_45_EDGE:
          localHistogram[subLocalIdx * 5 + 2]++;
          break;
        case DIAGONAL_135_EDGE:
          localHistogram[subLocalIdx * 5 + 3]++;
          break;
        case NON_DIRECTIONAL_EDGE:
          localHistogram[subLocalIdx * 5 + 4]++;
          break;
      }
    }
  }

  // Normalize per sub-image
  for (let k = 0; k < 80; k++) {
    const cnt = countLocal[Math.floor(k / 5)];
    if (cnt > 0) {
      localHistogram[k] /= cnt;
    }
  }

  // Quantize into 80 bins [0..7]
  const bins = new Int32Array(80);
  for (let i = 0; i < 80; i++) {
    const qRow = i % 5;
    for (let j = 0; j < 8; j++) {
      bins[i] = j;
      const quantVal = j < 7 ? (QUANT_TABLE[qRow][j] + QUANT_TABLE[qRow][j + 1]) / 2.0 : 1.0;
      if (localHistogram[i] <= quantVal) {
        break;
      }
    }
  }

  return Array.from(bins);
}

export const EdgeHistogram: FeatureExtractor = {
  extract(image: PixelData): number[] {
    return extractEdgeHistogramVector(image);
  },

  encode: encodeEdgeHistogram,
  decode: decodeEdgeHistogram,

  distance(a: number[] | string, b: number[] | string): number {
    const toVector = (x: number[] | string): number[] => {
      if (typeof x === "string") {
        return decodeEdgeHistogram(x);
      }
      return x;
    };

    const binsA = toVector(a);
    const binsB = toVector(b);

    let result = 0.0;
    for (let i = 0; i < 80; i++) {
      result += Math.abs(QUANT_TABLE[i % 5][binsA[i]] - QUANT_TABLE[i % 5][binsB[i]]);
    }
    for (let i = 0; i <= 4; i++) {
      result += 5.0 * Math.abs(binsA[i] - binsB[i]);
    }
    for (let i = 5; i < 80; i++) {
      result += Math.abs(binsA[i] - binsB[i]);
    }

    return result;
  },
};
