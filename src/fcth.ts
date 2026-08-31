import { FeatureExtractor, PixelData } from "./types.js";
import { encodeFixedBits, decodeFixedBits, bytesToBase64Url, base64UrlToBytes } from "./utils.js";
import { applyFuzzy10, applyFuzzy24, rgbToHsv } from "./cedd.js";

const HORIZ_MEMBERSHIP = [0, 0, 20, 90, 20, 90, 255, 255];
const VERT_MEMBERSHIP = [0, 0, 20, 90, 20, 90, 255, 255];
const ENERGY_MEMBERSHIP = [0, 0, 20, 80, 20, 80, 255, 255];

const TEXTURE_RULES: [number, number, number, number][] = [
  [0, 0, 0, 0],
  [0, 0, 1, 1],
  [0, 1, 0, 2],
  [0, 1, 1, 3],
  [1, 0, 0, 4],
  [1, 0, 1, 5],
  [1, 1, 0, 6],
  [1, 1, 1, 7],
];

const FCTH_QUANT_TABLES = [
  [
    130.0887781556944, 9317.31301788632, 22434.355689233365, 43120.54860272206, 83168.64016590505,
    101430.52589975641, 174840.65838706805, 224480.41479670047,
  ],
  [
    130.0887781556944, 9317.31301788632, 22434.355689233365, 43120.54860272206, 83168.64016590505,
    151430.5258997564, 174840.65838706805, 224480.41479670047,
  ],
  [
    239.769468748322, 17321.70431233569, 39113.6431807347, 69333.51209387438, 79122.46400035513,
    90980.3325940354, 161795.93301552488, 184729.98648386425,
  ],
  [
    239.769468748322, 17321.70431233569, 39113.6431807347, 69333.51209387438, 79122.46400035513,
    90980.3325940354, 161795.93301552488, 184729.98648386425,
  ],
  [
    239.769468748322, 17321.70431233569, 39113.6431807347, 69333.51209387438, 79122.46400035513,
    90980.3325940354, 161795.93301552488, 184729.98648386425,
  ],
  [
    239.769468748322, 17321.70431233569, 39113.6431807347, 69333.51209387438, 79122.46400035513,
    90980.3325940354, 161795.93301552488, 184729.98648386425,
  ],
  [
    180.19686541079636, 23730.024499150866, 41457.152912541605, 53918.55437576842,
    69122.46400035513, 81980.3325940354, 91795.93301552488, 124729.98648386425,
  ],
  [
    180.19686541079636, 23730.024499150866, 41457.152912541605, 53918.55437576842,
    69122.46400035513, 81980.3325940354, 91795.93301552488, 124729.98648386425,
  ],
];

function findMembership(input: number, triangles: number[], out: Float64Array): void {
  let temp = 0;
  for (let i = 0; i < triangles.length; i += 4) {
    out[temp] = 0;
    if (input >= triangles[i + 1] && input <= triangles[i + 2]) {
      out[temp] = 1;
    } else if (input >= triangles[i] && input < triangles[i + 1]) {
      out[temp] = (input - triangles[i]) / (triangles[i + 1] - triangles[i]);
    } else if (input > triangles[i + 2] && input <= triangles[i + 3]) {
      out[temp] = (input - triangles[i + 2]) / (triangles[i + 2] - triangles[i + 3]) + 1;
    }
    temp++;
  }
}

function applyFuzzyTexture(
  f1: number,
  f2: number,
  f3: number,
  color24: Float64Array,
  fcthOut: Float64Array,
): void {
  const hAct = new Float64Array(2);
  const vAct = new Float64Array(2);
  const eAct = new Float64Array(2);
  const resultsTable = new Float64Array(8);

  findMembership(f1, HORIZ_MEMBERSHIP, hAct);
  findMembership(f2, VERT_MEMBERSHIP, vAct);
  findMembership(f3, ENERGY_MEMBERSHIP, eAct);

  // Method 2 (MultiParticipate_Defazzificator)
  for (let i = 0; i < 8; i++) {
    const rule = TEXTURE_RULES[i];
    const in1 = hAct[rule[0]];
    const in2 = vAct[rule[1]];
    const in3 = eAct[rule[2]];
    if (in1 > 0 && in2 > 0 && in3 > 0) {
      resultsTable[rule[3]] += Math.min(in1, Math.min(in2, in3));
    }
  }

  for (let i = 0; i < 8; i++) {
    if (resultsTable[i] > 0) {
      const offset = 24 * i;
      for (let j = 0; j < 24; j++) {
        if (color24[j] > 0) {
          fcthOut[offset + j] += resultsTable[i] * color24[j];
        }
      }
    }
  }
}

/**
 * Encodes 192 3-bit FCTH bins into a compact URL-safe base64 string.
 */
export function encodeFCTH(vector: number[]): string {
  return bytesToBase64Url(encodeFixedBits(vector, 3, 72));
}

/**
 * Decodes a compact URL-safe base64 string into a 192-bin FCTH vector.
 */
export function decodeFCTH(hash: string): number[] {
  const bytes = base64UrlToBytes(hash);
  return decodeFixedBits(bytes, 3, 192);
}

function extractFCTHVector(image: PixelData): number[] {
  const width = image.width;
  const height = image.height;
  const channels = image.channels ?? 4;
  const data = image.data;

  const imgGridR = new Int32Array(width * height);
  const imgGridG = new Int32Array(width * height);
  const imgGridB = new Int32Array(width * height);
  const imgGridLuma = new Int32Array(width * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = (rowOffset + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      imgGridR[rowOffset + x] = r;
      imgGridG[rowOffset + x] = g;
      imgGridB[rowOffset + x] = b;
      imgGridLuma[rowOffset + x] = Math.floor(0.114 * b + 0.587 * g + 0.299 * r);
    }
  }

  const numberOfBlocks = 1600;
  let stepX = Math.floor(width / Math.sqrt(numberOfBlocks));
  let stepY = Math.floor(height / Math.sqrt(numberOfBlocks));
  if (stepX % 2 !== 0) stepX -= 1;
  if (stepY % 2 !== 0) stepY -= 1;
  if (stepX < 4) stepX = 4;
  if (stepY < 4) stepY = 4;

  const fcth = new Float64Array(192);
  const fuzzy10 = new Float64Array(10);
  const fuzzy24 = new Float64Array(24);

  const block = [
    new Float64Array(4),
    new Float64Array(4),
    new Float64Array(4),
    new Float64Array(4),
  ];
  const blockCount = [new Int32Array(4), new Int32Array(4), new Int32Array(4), new Int32Array(4)];
  const blockR = [new Int32Array(4), new Int32Array(4), new Int32Array(4), new Int32Array(4)];
  const blockG = [new Int32Array(4), new Int32Array(4), new Int32Array(4), new Int32Array(4)];
  const blockB = [new Int32Array(4), new Int32Array(4), new Int32Array(4), new Int32Array(4)];

  const stepX4 = Math.floor(stepX / 4);
  const stepX2 = Math.floor(stepX / 2);
  const stepX34 = Math.floor((3 * stepX) / 4);

  const stepY4 = Math.floor(stepY / 4);
  const stepY2 = Math.floor(stepY / 2);
  const stepY34 = Math.floor((3 * stepY) / 4);

  const totalStepPixels = stepX * stepY;

  for (let y = 0; y < height - stepY; y += stepY) {
    for (let x = 0; x < width - stepX; x += stepX) {
      for (let i = 0; i < 4; i++) {
        block[i].fill(0);
        blockCount[i].fill(0);
      }

      let meanR = 0;
      let meanG = 0;
      let meanB = 0;

      for (let i = 0; i < stepX; i++) {
        let curPxX = 0;
        if (i >= stepX4) curPxX = 1;
        if (i >= stepX2) curPxX = 2;
        if (i >= stepX34) curPxX = 3;

        for (let j = 0; j < stepY; j++) {
          let curPxY = 0;
          if (j >= stepY4) curPxY = 1;
          if (j >= stepY2) curPxY = 2;
          if (j >= stepY34) curPxY = 3;

          const pIdx = (y + j) * width + (x + i);
          block[curPxX][curPxY] += imgGridLuma[pIdx];
          blockCount[curPxX][curPxY]++;

          blockR[curPxX][curPxY] = imgGridR[pIdx];
          blockG[curPxX][curPxY] = imgGridG[pIdx];
          blockB[curPxX][curPxY] = imgGridB[pIdx];

          meanR += blockR[curPxX][curPxY];
          meanG += blockG[curPxX][curPxY];
          meanB += blockB[curPxX][curPxY];
        }
      }

      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (blockCount[i][j] > 0) {
            block[i][j] /= blockCount[i][j];
          }
        }
      }

      // Haar Wavelet Transform on 4x4 matrix
      const resultMatrix = [
        new Float64Array(4),
        new Float64Array(4),
        new Float64Array(4),
        new Float64Array(4),
      ];
      for (let cy = 0; cy < 4; cy++) {
        for (let cx = 0; cx < 4; cx++) {
          if (cy < 2 && cx < 2) {
            resultMatrix[cx][cy] =
              (block[2 * cx][2 * cy] +
                block[2 * cx + 1][2 * cy] +
                block[2 * cx][2 * cy + 1] +
                block[2 * cx + 1][2 * cy + 1]) /
              4;
            const vertDiff =
              -block[2 * cx][2 * cy] -
              block[2 * cx + 1][2 * cy] +
              block[2 * cx][2 * cy + 1] +
              block[2 * cx + 1][2 * cy + 1];
            const horzDiff =
              block[2 * cx][2 * cy] -
              block[2 * cx + 1][2 * cy] +
              block[2 * cx][2 * cy + 1] -
              block[2 * cx + 1][2 * cy + 1];
            const diagDiff =
              -block[2 * cx][2 * cy] +
              block[2 * cx + 1][2 * cy] +
              block[2 * cx][2 * cy + 1] -
              block[2 * cx + 1][2 * cy + 1];

            resultMatrix[cx + 2][cy] = Math.abs(vertDiff);
            resultMatrix[cx][cy + 2] = Math.abs(horzDiff);
            resultMatrix[cx + 2][cy + 2] = Math.abs(diagDiff);
          }
        }
      }

      let temp1 = 0;
      let temp2 = 0;
      let temp3 = 0;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          temp1 += 0.25 * Math.pow(resultMatrix[2 + i][j], 2);
          temp2 += 0.25 * Math.pow(resultMatrix[i][2 + j], 2);
          temp3 += 0.25 * Math.pow(resultMatrix[2 + i][2 + j], 2);
        }
      }

      const F1 = Math.sqrt(temp1);
      const F2 = Math.sqrt(temp2);
      const F3 = Math.sqrt(temp3);

      const avgR = Math.floor(meanR / totalStepPixels);
      const avgG = Math.floor(meanG / totalStepPixels);
      const avgB = Math.floor(meanB / totalStepPixels);

      const [h, s, v] = rgbToHsv(avgR, avgG, avgB);
      applyFuzzy10(h, s, v, fuzzy10);
      applyFuzzy24(h, s, v, fuzzy10, fuzzy24);

      applyFuzzyTexture(F3, F2, F1, fuzzy24, fcth);
    }
  }

  let totalSum = 0;
  for (let i = 0; i < 192; i++) totalSum += fcth[i];
  if (totalSum > 0) {
    for (let i = 0; i < 192; i++) fcth[i] /= totalSum;
  }

  // Quantize into 192 bins [0..7]
  const quantized = new Uint8Array(192);
  for (let section = 0; section < 8; section++) {
    const qTable = FCTH_QUANT_TABLES[section];
    const start = section * 24;
    for (let i = 0; i < 24; i++) {
      const val = fcth[start + i];
      let bestDist = 1.0;
      let bestBin = 0;
      for (let j = 0; j < 8; j++) {
        const dist = Math.abs(val - qTable[j] / 1000000);
        if (dist < bestDist) {
          bestDist = dist;
          bestBin = j;
        }
      }
      quantized[start + i] = bestBin;
    }
  }

  return Array.from(quantized);
}

export const FCTH: FeatureExtractor = {
  extract(image: PixelData): number[] {
    return extractFCTHVector(image);
  },

  encode: encodeFCTH,
  decode: decodeFCTH,

  distance(a: number[] | string, b: number[] | string): number {
    const toVector = (x: number[] | string): number[] => {
      if (typeof x === "string") {
        return decodeFCTH(x);
      }
      return x;
    };

    const histA = toVector(a);
    const histB = toVector(b);

    let temp1 = 0;
    let temp2 = 0;
    for (let i = 0; i < 192; i++) {
      temp1 += histA[i];
      temp2 += histB[i];
    }

    if (temp1 === 0 && temp2 === 0) return 0;
    if (temp1 === 0 || temp2 === 0) return 100;

    let tempCount1 = 0;
    let tempCount2 = 0;
    let tempCount3 = 0;

    for (let i = 0; i < 192; i++) {
      const iTmp1 = histA[i] / temp1;
      const iTmp2 = histB[i] / temp2;
      tempCount1 += iTmp1 * iTmp2;
      tempCount2 += iTmp2 * iTmp2;
      tempCount3 += iTmp1 * iTmp1;
    }

    return 100 - 100 * (tempCount1 / (tempCount2 + tempCount3 - tempCount1));
  },
};
