import { FeatureExtractor, FeatureResult, PixelData } from "./types.js";
import { bytesToBase64 } from "./utils.js";

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

export const EdgeHistogram: FeatureExtractor = {
  name: "EdgeHistogram",
  code: "eh",

  extract(image: PixelData): FeatureResult {
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

    const maxX = width - blockSize;
    const maxY = height - blockSize;

    // 3. Scan image blocks
    for (let j = 0; j <= maxY; j += blockSize) {
      for (let i = 0; i <= maxX; i += blockSize) {
        const subX = Math.floor((i * 4) / width);
        const subY = Math.floor((j * 4) / height);
        const subLocalIdx = subX + (subY << 2);
        countLocal[subLocalIdx]++;

        // Compute 4 sub-block luminance averages
        let avg1 = 0;
        let avg2 = 0;
        let avg3 = 0;
        let avg4 = 0;

        for (let n = 0; n < halfBlock; n++) {
          const row1 = (j + n) * width;
          for (let m = 0; m < halfBlock; m++) {
            avg1 += grey[row1 + (i + m)];
          }
          for (let m = halfBlock; m < blockSize; m++) {
            avg2 += grey[row1 + (i + m)];
          }
        }

        for (let n = halfBlock; n < blockSize; n++) {
          const row2 = (j + n) * width;
          for (let m = 0; m < halfBlock; m++) {
            avg3 += grey[row2 + (i + m)];
          }
          for (let m = halfBlock; m < blockSize; m++) {
            avg4 += grey[row2 + (i + m)];
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

    const featureVector = Array.from(bins);

    // Pack into 40 bytes matching LIRE: ((b0 << 4) | b1) - 128
    const byteArray = new Uint8Array(40);
    for (let i = 0; i < 40; i++) {
      const high = bins[i << 1] & 0x0f;
      const low = bins[(i << 1) + 1] & 0x0f;
      const val = (high << 4) | low;
      // Convert (val - 128) signed byte to Uint8 byte representation
      byteArray[i] = (val - 128) & 0xff;
    }

    return {
      featureVector,
      byteArray,
      base64: bytesToBase64(byteArray),
    };
  },

  distance(a: number[] | Uint8Array, b: number[] | Uint8Array): number {
    let binsA: number[];
    let binsB: number[];

    if (a instanceof Uint8Array || (Array.isArray(a) && a.length === 40)) {
      binsA = new Array(80);
      for (let i = 0; i < 40; i++) {
        const tmp = (a[i] + 128) & 0xff;
        binsA[(i << 1) + 1] = tmp & 0x0f;
        binsA[i << 1] = (tmp >> 4) & 0x0f;
      }
    } else {
      binsA = a as number[];
    }

    if (b instanceof Uint8Array || (Array.isArray(b) && b.length === 40)) {
      binsB = new Array(80);
      for (let i = 0; i < 40; i++) {
        const tmp = (b[i] + 128) & 0xff;
        binsB[(i << 1) + 1] = tmp & 0x0f;
        binsB[i << 1] = (tmp >> 4) & 0x0f;
      }
    } else {
      binsB = b as number[];
    }

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
