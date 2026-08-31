import { FeatureExtractor, PixelData } from "./types.js";
import { bytesToBase64Url, base64UrlToBytes } from "./utils.js";

const ARRAY_ZIGZAG = new Uint8Array([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
  13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
  45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]);

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

const dctBuffer = new Float32Array(64);

function fdct(shapes: Int16Array | Int32Array): void {
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      let s = 0.0;
      for (let k = 0; k < 8; k++) {
        s += ARRAY_COSIN[j][k] * shapes[8 * i + k];
      }
      dctBuffer[8 * i + j] = s;
    }
  }

  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      let s = 0.0;
      for (let k = 0; k < 8; k++) {
        s += ARRAY_COSIN[i][k] * dctBuffer[8 * k + j];
      }
      shapes[8 * i + j] = Math.floor(s + 0.499999);
    }
  }
}

/**
 * Encodes a 33-coefficient ColorLayout feature vector into a compact URL-safe base64 string.
 *
 * Bit allocations:
 * - Y DC (index 0): 6 bits
 * - Y AC (indices 1..20, 20 coeffs): 5 bits each
 * - Cb DC (index 21): 6 bits
 * - Cb AC (indices 22..26, 5 coeffs): 5 bits each
 * - Cr DC (index 27): 6 bits
 * - Cr AC (indices 28..32, 5 coeffs): 5 bits each
 */
export function encodeColorLayout(vector: number[]): string {
  const bytes = new Uint8Array(21);
  let bitOffset = 0;

  const writeBits = (val: number, numBits: number) => {
    for (let i = numBits - 1; i >= 0; i--) {
      const bit = (val >> i) & 1;
      const byteIdx = bitOffset >> 3;
      const bitIdx = 7 - (bitOffset & 7);
      bytes[byteIdx] |= bit << bitIdx;
      bitOffset++;
    }
  };

  // Y (index 0: 6 bits, indices 1..20: 5 bits)
  writeBits(vector[0], 6);
  for (let i = 1; i <= 20; i++) writeBits(vector[i], 5);

  // Cb (index 21: 6 bits, indices 22..26: 5 bits)
  writeBits(vector[21], 6);
  for (let i = 22; i <= 26; i++) writeBits(vector[i], 5);

  // Cr (index 27: 6 bits, indices 28..32: 5 bits)
  writeBits(vector[27], 6);
  for (let i = 28; i <= 32; i++) writeBits(vector[i], 5);

  return bytesToBase64Url(bytes);
}

/**
 * Decodes a URL-safe base64 string back into the 33-coefficient feature vector.
 */
export function decodeColorLayout(hash: string): number[] {
  const bytes = base64UrlToBytes(hash);
  let bitOffset = 0;

  const readBits = (numBits: number): number => {
    let val = 0;
    for (let i = 0; i < numBits; i++) {
      const byteIdx = bitOffset >> 3;
      const bitIdx = 7 - (bitOffset & 7);
      val = (val << 1) | ((bytes[byteIdx] >> bitIdx) & 1);
      bitOffset++;
    }
    return val;
  };

  const v = new Array(33);
  // Y
  v[0] = readBits(6);
  for (let i = 1; i <= 20; i++) v[i] = readBits(5);

  // Cb
  v[21] = readBits(6);
  for (let i = 22; i <= 26; i++) v[i] = readBits(5);

  // Cr
  v[27] = readBits(6);
  for (let i = 28; i <= 32; i++) v[i] = readBits(5);

  return v;
}

function extractColorLayoutVector(image: PixelData): number[] {
  const width = image.width;
  const height = image.height;
  const channels = image.channels ?? 4;
  const data = image.data;

  const sumR = new Float32Array(64);
  const sumG = new Float32Array(64);
  const sumB = new Float32Array(64);

  const xStart = new Uint32Array(9);
  const yStart = new Uint32Array(9);
  for (let i = 0; i <= 8; i++) {
    xStart[i] = Math.ceil((i * width) / 8);
    yStart[i] = Math.ceil((i * height) / 8);
  }

  let ptr = 0;
  for (let by = 0; by < 8; by++) {
    const yEnd = yStart[by + 1];
    for (let y = yStart[by]; y < yEnd; y++) {
      for (let bx = 0; bx < 8; bx++) {
        const xEnd = xStart[bx + 1];
        const kIdx = (by << 3) + bx;

        let sR = sumR[kIdx];
        let sG = sumG[kIdx];
        let sB = sumB[kIdx];

        for (let x = xStart[bx]; x < xEnd; x++) {
          sR += data[ptr];
          sG += data[ptr + 1];
          sB += data[ptr + 2];
          ptr += channels;
        }
        sumR[kIdx] = sR;
        sumG[kIdx] = sG;
        sumB[kIdx] = sB;
      }
    }
  }

  const shape = [new Int16Array(64), new Int16Array(64), new Int16Array(64)];
  for (let by = 0; by < 8; by++) {
    const h = yStart[by + 1] - yStart[by];
    for (let bx = 0; bx < 8; bx++) {
      const w = xStart[bx + 1] - xStart[bx];
      const count = w * h;
      const kIdx = (by << 3) + bx;

      if (count !== 0) {
        const invCount = 1 / (count * 256);
        const R = sumR[kIdx] * invCount;
        const G = sumG[kIdx] * invCount;
        const B = sumB[kIdx] * invCount;

        const yy = 0.299 * R + 0.587 * G + 0.114 * B;
        shape[0][kIdx] = Math.floor(219 * yy + 16.5);
        shape[1][kIdx] = Math.floor(126.336 * (B - yy) + 128.5);
        shape[2][kIdx] = Math.floor(159.712 * (R - yy) + 128.5);
      }
    }
  }

  fdct(shape[0]);
  fdct(shape[1]);
  fdct(shape[2]);

  const numYCoeff = 21;
  const numCCoeff = 6;
  const YCoeff = new Int16Array(64);
  const CbCoeff = new Int16Array(64);
  const CrCoeff = new Int16Array(64);

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

  return featureVector;
}

export const ColorLayout: FeatureExtractor = {
  extract(image: PixelData): number[] {
    return extractColorLayoutVector(image);
  },

  encode: encodeColorLayout,
  decode: decodeColorLayout,

  distance(a: number[] | string, b: number[] | string): number {
    const toVector = (x: number[] | string): number[] => {
      if (typeof x === "string") {
        return decodeColorLayout(x);
      }
      return x;
    };

    const vecA = toVector(a);
    const vecB = toVector(b);

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
