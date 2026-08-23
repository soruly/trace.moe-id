import { FeatureExtractor, FeatureResult, PixelData } from "./types.js";
import { bytesToBase64 } from "./utils.js";

const ARRAY_ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

const ARRAY_COSIN = [
  [
    3.535534e-1, 3.535534e-1, 3.535534e-1, 3.535534e-1, 3.535534e-1, 3.535534e-1, 3.535534e-1,
    3.535534e-1,
  ],
  [
    4.903926e-1, 4.157348e-1, 2.777851e-1, 9.754516e-2, -9.754516e-2, -2.777851e-1, -4.157348e-1,
    -4.903926e-1,
  ],
  [
    4.619398e-1, 1.913417e-1, -1.913417e-1, -4.619398e-1, -4.619398e-1, -1.913417e-1, 1.913417e-1,
    4.619398e-1,
  ],
  [
    4.157348e-1, -9.754516e-2, -4.903926e-1, -2.777851e-1, 2.777851e-1, 4.903926e-1, 9.754516e-2,
    -4.157348e-1,
  ],
  [
    3.535534e-1, -3.535534e-1, -3.535534e-1, 3.535534e-1, 3.535534e-1, -3.535534e-1, -3.535534e-1,
    3.535534e-1,
  ],
  [
    2.777851e-1, -4.903926e-1, 9.754516e-2, 4.157348e-1, -4.157348e-1, -9.754516e-2, 4.903926e-1,
    -2.777851e-1,
  ],
  [
    1.913417e-1, -4.619398e-1, 4.619398e-1, -1.913417e-1, -1.913417e-1, 4.619398e-1, -4.619398e-1,
    1.913417e-1,
  ],
  [
    9.754516e-2, -2.777851e-1, 4.157348e-1, -4.903926e-1, 4.903926e-1, -4.157348e-1, 2.777851e-1,
    -9.754516e-2,
  ],
];

const WEIGHT_MATRIX = [
  new Int32Array(64).fill(1),
  new Int32Array(64).fill(1),
  new Int32Array(64).fill(1),
];
WEIGHT_MATRIX[0][0] = 2;
WEIGHT_MATRIX[0][1] = 2;
WEIGHT_MATRIX[0][2] = 2;
WEIGHT_MATRIX[1][0] = 2;
WEIGHT_MATRIX[1][1] = 1;
WEIGHT_MATRIX[1][2] = 1;
WEIGHT_MATRIX[2][0] = 4;
WEIGHT_MATRIX[2][1] = 2;
WEIGHT_MATRIX[2][2] = 2;

function quantYdc(i: number): number {
  if (i > 192) return 112 + ((i - 192) >> 2);
  if (i > 160) return 96 + ((i - 160) >> 1);
  if (i > 96) return 32 + (i - 96);
  if (i > 64) return 16 + ((i - 64) >> 1);
  return i >> 2;
}

function quantCdc(i: number): number {
  if (i > 191) return 63;
  if (i > 160) return 56 + ((i - 160) >> 2);
  if (i > 144) return 48 + ((i - 144) >> 1);
  if (i > 112) return 16 + (i - 112);
  if (i > 96) return 8 + ((i - 96) >> 1);
  if (i > 64) return (i - 64) >> 2;
  return 0;
}

function quantAc(i: number): number {
  let val = i;
  if (val > 255) val = 255;
  if (val < -256) val = -256;
  const absVal = Math.abs(val);
  let j: number;
  if (absVal > 127) {
    j = 64 + (absVal >> 2);
  } else if (absVal > 63) {
    j = 32 + (absVal >> 1);
  } else {
    j = absVal;
  }
  j = val < 0 ? -j : j;
  return j + 128;
}

function fdct(shapes: Int32Array): void {
  const dct = new Float64Array(64);
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      let s = 0.0;
      for (let k = 0; k < 8; k++) {
        s += ARRAY_COSIN[j][k] * shapes[8 * i + k];
      }
      dct[8 * i + j] = s;
    }
  }

  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      let s = 0.0;
      for (let k = 0; k < 8; k++) {
        s += ARRAY_COSIN[i][k] * dct[8 * k + j];
      }
      shapes[8 * i + j] = Math.floor(s + 0.499999);
    }
  }
}

export const ColorLayout: FeatureExtractor = {
  name: "ColorLayout",
  code: "cl",

  extract(image: PixelData): FeatureResult {
    const width = image.width;
    const height = image.height;
    const channels = image.channels ?? 4;
    const data = image.data;

    const sum = [new Float64Array(64), new Float64Array(64), new Float64Array(64)];
    const cnt = new Int32Array(64);

    const blockWidth = width / 8.0;
    const blockHeight = height / 8.0;

    for (let y = 0; y < height; y++) {
      const yAxis = Math.floor(y / blockHeight);
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const xAxis = Math.floor(x / blockWidth);
        const k = (yAxis << 3) + xAxis;

        const idx = (rowOffset + x) * channels;
        const R = data[idx];
        const G = data[idx + 1];
        const B = data[idx + 2];

        // RGB to YCbCr matching LIRE integer quantization
        const yy = (0.299 * R + 0.587 * G + 0.114 * B) / 256.0;
        sum[0][k] += Math.floor(219.0 * yy + 16.5);
        sum[1][k] += Math.floor(224.0 * 0.564 * (B / 256.0 - yy) + 128.5);
        sum[2][k] += Math.floor(224.0 * 0.713 * (R / 256.0 - yy) + 128.5);
        cnt[k]++;
      }
    }

    const shape = [new Int32Array(64), new Int32Array(64), new Int32Array(64)];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const idx = (i << 3) + j;
        for (let k = 0; k < 3; k++) {
          shape[k][idx] = cnt[idx] !== 0 ? Math.floor(sum[k][idx] / cnt[idx]) : 0;
        }
      }
    }

    fdct(shape[0]);
    fdct(shape[1]);
    fdct(shape[2]);

    const numYCoeff = 21;
    const numCCoeff = 6;
    const YCoeff = new Int32Array(64);
    const CbCoeff = new Int32Array(64);
    const CrCoeff = new Int32Array(64);

    YCoeff[0] = quantYdc(shape[0][0] >> 3) >> 1;
    CbCoeff[0] = quantCdc(shape[1][0] >> 3);
    CrCoeff[0] = quantCdc(shape[2][0] >> 3);

    for (let i = 1; i < 64; i++) {
      const zigZagIdx = ARRAY_ZIGZAG[i];
      YCoeff[i] = quantAc(shape[0][zigZagIdx] >> 1) >> 3;
      CbCoeff[i] = quantAc(shape[1][zigZagIdx]) >> 3;
      CrCoeff[i] = quantAc(shape[2][zigZagIdx]) >> 3;
    }

    // Standard 33-coefficient feature vector
    const featureVector: number[] = new Array(numYCoeff + numCCoeff * 2);
    for (let i = 0; i < numYCoeff; i++) featureVector[i] = YCoeff[i];
    for (let i = 0; i < numCCoeff; i++) {
      featureVector[i + numYCoeff] = CbCoeff[i];
      featureVector[i + numYCoeff + numCCoeff] = CrCoeff[i];
    }

    // Binary packed byte array: 2 header bytes + 33 coefficients = 35 bytes
    const byteArray = new Uint8Array(2 + numYCoeff + 2 * numCCoeff);
    byteArray[0] = numYCoeff;
    byteArray[1] = numCCoeff;
    for (let i = 0; i < numYCoeff; i++) {
      byteArray[2 + i] = YCoeff[i] & 0xff;
    }
    for (let i = 0; i < numCCoeff; i++) {
      byteArray[2 + numYCoeff + i] = CbCoeff[i] & 0xff;
      byteArray[2 + numYCoeff + numCCoeff + i] = CrCoeff[i] & 0xff;
    }

    return {
      featureVector,
      byteArray,
      base64: bytesToBase64(byteArray),
    };
  },

  distance(a: number[] | Uint8Array, b: number[] | Uint8Array): number {
    const vecA = Array.isArray(a) ? a : Array.from(a.slice(2));
    const vecB = Array.isArray(b) ? b : Array.from(b.slice(2));

    const numY = 21;
    const numC = 6;
    let sumY = 0;
    let sumCb = 0;
    let sumCr = 0;

    for (let j = 0; j < numY; j++) {
      const diff = vecA[j] - vecB[j];
      sumY += WEIGHT_MATRIX[0][j] * diff * diff;
    }

    for (let j = 0; j < numC; j++) {
      const diffCb = vecA[numY + j] - vecB[numY + j];
      sumCb += WEIGHT_MATRIX[1][j] * diffCb * diffCb;

      const diffCr = vecA[numY + numC + j] - vecB[numY + numC + j];
      sumCr += WEIGHT_MATRIX[2][j] * diffCr * diffCr;
    }

    return Math.sqrt(sumY) + Math.sqrt(sumCb) + Math.sqrt(sumCr);
  },
};
