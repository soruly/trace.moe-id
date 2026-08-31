import { FeatureExtractor, PixelData } from "./types.js";
import { encodeFixedBits, decodeFixedBits, bytesToBase64Url, base64UrlToBytes } from "./utils.js";

const HUE_MEMBERSHIP = [
  0, 0, 5, 10, 5, 10, 35, 50, 35, 50, 70, 85, 70, 85, 150, 165, 150, 165, 195, 205, 195, 205, 265,
  280, 265, 280, 315, 330, 315, 330, 360, 360,
];

const SAT_MEMBERSHIP_10 = [0, 0, 10, 75, 10, 75, 255, 255];
const VAL_MEMBERSHIP_10 = [0, 0, 10, 75, 10, 75, 180, 220, 180, 220, 255, 255];

const SAT_MEMBERSHIP_24 = [0, 0, 68, 188, 68, 188, 255, 255];
const VAL_MEMBERSHIP_24 = [0, 0, 68, 188, 68, 188, 255, 255];

const FUZZY_10_RULES: [number, number, number, number][] = [
  [0, 0, 0, 2],
  [0, 1, 0, 2],
  [0, 0, 2, 0],
  [0, 0, 1, 1],
  [1, 0, 0, 2],
  [1, 1, 0, 2],
  [1, 0, 2, 0],
  [1, 0, 1, 1],
  [2, 0, 0, 2],
  [2, 1, 0, 2],
  [2, 0, 2, 0],
  [2, 0, 1, 1],
  [3, 0, 0, 2],
  [3, 1, 0, 2],
  [3, 0, 2, 0],
  [3, 0, 1, 1],
  [4, 0, 0, 2],
  [4, 1, 0, 2],
  [4, 0, 2, 0],
  [4, 0, 1, 1],
  [5, 0, 0, 2],
  [5, 1, 0, 2],
  [5, 0, 2, 0],
  [5, 0, 1, 1],
  [6, 0, 0, 2],
  [6, 1, 0, 2],
  [6, 0, 2, 0],
  [6, 0, 1, 1],
  [7, 0, 0, 2],
  [7, 1, 0, 2],
  [7, 0, 2, 0],
  [7, 0, 1, 1],
  [0, 1, 1, 3],
  [0, 1, 2, 3],
  [1, 1, 1, 4],
  [1, 1, 2, 4],
  [2, 1, 1, 5],
  [2, 1, 2, 5],
  [3, 1, 1, 6],
  [3, 1, 2, 6],
  [4, 1, 1, 7],
  [4, 1, 2, 7],
  [5, 1, 1, 8],
  [5, 1, 2, 8],
  [6, 1, 1, 9],
  [6, 1, 2, 9],
  [7, 1, 1, 3],
  [7, 1, 2, 3],
];

const FUZZY_24_RULES: [number, number, number][] = [
  [1, 1, 1],
  [0, 0, 2],
  [0, 1, 0],
  [1, 0, 2],
];

const QUANT_TABLES = [
  [
    180.19686541079636, 23730.024499150866, 61457.152912541605, 113918.55437576842,
    179122.46400035513, 260980.3325940354, 341795.93301552488, 554729.98648386425,
  ],
  [
    209.25176965926232, 22490.587286241735, 60250.893514185, 120705.78805758058, 181128.0870906305,
    234132.08135690055, 325660.6177331057, 520702.1758586575,
  ],
  [
    405.4642173212585, 4877.976331907148, 10882.170090625908, 18167.239081219657,
    27043.385568785292, 38129.413201299016, 52675.22131629386, 79555.40260700481,
  ],
  [
    405.4642173212585, 4877.976331907148, 10882.170090625908, 18167.239081219657,
    27043.385568785292, 38129.413201299016, 52675.22131629386, 79555.40260700481,
  ],
  [
    968.8847597769558, 10725.159033657819, 24161.2053603767, 41555.91734438532, 62895.62844640226,
    93066.27137969488, 136976.13317822068, 262897.86056221306,
  ],
  [
    968.8847597769558, 10725.159033657819, 24161.2053603767, 41555.91734438532, 62895.62844640226,
    93066.27137969488, 136976.13317822068, 262897.86056221306,
  ],
];

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const maxHSV = Math.max(r, Math.max(g, b));
  const minHSV = Math.min(r, Math.min(g, b));
  const hsvV = Math.floor(maxHSV);
  let hsvS = 0;
  if (maxHSV !== 0) {
    hsvS = Math.floor(255 - 255 * (minHSV / maxHSV));
  }
  let hsvH = 0;
  if (maxHSV !== minHSV) {
    const intMax = Math.floor(maxHSV);
    if (intMax === r && g >= b) {
      hsvH = Math.floor((60 * (g - b)) / (maxHSV - minHSV));
    } else if (intMax === r && g < b) {
      hsvH = Math.floor(359 + (60 * (g - b)) / (maxHSV - minHSV));
    } else if (intMax === g) {
      hsvH = Math.floor(119 + (60 * (b - r)) / (maxHSV - minHSV));
    } else if (intMax === b) {
      hsvH = Math.floor(239 + (60 * (r - g)) / (maxHSV - minHSV));
    }
  }
  return [hsvH, hsvS, hsvV];
}

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

export function applyFuzzy10(hue: number, sat: number, val: number, out10: Float64Array): void {
  const hueAct = new Float64Array(8);
  const satAct = new Float64Array(2);
  const valAct = new Float64Array(3);

  findMembership(hue, HUE_MEMBERSHIP, hueAct);
  findMembership(sat, SAT_MEMBERSHIP_10, satAct);
  findMembership(val, VAL_MEMBERSHIP_10, valAct);

  out10.fill(0);
  for (let i = 0; i < 48; i++) {
    const rule = FUZZY_10_RULES[i];
    const in1 = hueAct[rule[0]];
    const in2 = satAct[rule[1]];
    const in3 = valAct[rule[2]];
    if (in1 > 0 && in2 > 0 && in3 > 0) {
      out10[rule[3]] += Math.min(in1, Math.min(in2, in3));
    }
  }
}

export function applyFuzzy24(
  hue: number,
  sat: number,
  val: number,
  color10: Float64Array,
  out24: Float64Array,
): void {
  const satAct = new Float64Array(2);
  const valAct = new Float64Array(2);
  const resultsTable = new Float64Array(3);

  findMembership(sat, SAT_MEMBERSHIP_24, satAct);
  findMembership(val, VAL_MEMBERSHIP_24, valAct);

  out24.fill(0);
  let tempSum = 0;
  for (let i = 3; i < 10; i++) {
    tempSum += color10[i];
  }

  if (tempSum > 0) {
    for (let i = 0; i < 4; i++) {
      const rule = FUZZY_24_RULES[i];
      const in1 = satAct[rule[0]];
      const in2 = valAct[rule[1]];
      if (in1 > 0 && in2 > 0) {
        resultsTable[rule[2]] += Math.min(in1, in2);
      }
    }
  }

  for (let i = 0; i < 3; i++) {
    out24[i] += color10[i];
  }

  for (let i = 3; i < 10; i++) {
    const baseIdx = (i - 2) * 3;
    out24[baseIdx] += color10[i] * resultsTable[0];
    out24[baseIdx + 1] += color10[i] * resultsTable[1];
    out24[baseIdx + 2] += color10[i] * resultsTable[2];
  }
}

/**
 * Encodes 144 3-bit CEDD bins into a compact URL-safe base64 string.
 */
export function encodeCEDD(vector: number[]): string {
  return bytesToBase64Url(encodeFixedBits(vector, 3, 54));
}

/**
 * Decodes a compact URL-safe base64 string into a 144-bin CEDD vector.
 */
export function decodeCEDD(hash: string): number[] {
  const bytes = base64UrlToBytes(hash);
  return decodeFixedBits(bytes, 3, 144);
}

function extractCEDDVector(image: PixelData): number[] {
  const width = image.width;
  const height = image.height;
  const channels = image.channels ?? 4;
  const data = image.data;

  let numberOfBlocks = -1;
  const minDim = Math.min(width, height);
  if (minDim >= 80) numberOfBlocks = 1600;
  else if (minDim >= 40) numberOfBlocks = 400;

  let stepX = 2;
  let stepY = 2;
  if (numberOfBlocks > 0) {
    stepX = Math.floor(width / Math.sqrt(numberOfBlocks));
    stepY = Math.floor(height / Math.sqrt(numberOfBlocks));
    if (stepX % 2 !== 0) stepX -= 1;
    if (stepY % 2 !== 0) stepY -= 1;
  }
  if (stepX <= 0) stepX = 2;
  if (stepY <= 0) stepY = 2;

  const imgGridR = new Int32Array(width * height);
  const imgGridG = new Int32Array(width * height);
  const imgGridB = new Int32Array(width * height);
  const imgGridLuma = new Float64Array(width * height);

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
      imgGridLuma[rowOffset + x] = 0.114 * b + 0.587 * g + 0.299 * r;
    }
  }

  let tempMaxX = stepX * Math.floor(width >> 1);
  let tempMaxY = stepY * Math.floor(height >> 1);
  if (numberOfBlocks > 0) {
    tempMaxX = stepX * Math.floor(Math.sqrt(numberOfBlocks));
    tempMaxY = stepY * Math.floor(Math.sqrt(numberOfBlocks));
  }

  const cedd = new Float64Array(144);
  const fuzzy10 = new Float64Array(10);
  const fuzzy24 = new Float64Array(24);
  const edges = new Int32Array(6);

  const halfStepX = stepX / 2;
  const halfStepY = stepY / 2;
  const invBlockArea4 = 4.0 / (stepX * stepY);

  const T0 = 14.0;
  const T1 = 0.68;
  const T2 = 0.98;
  const T3 = 0.98;

  for (let y = 0; y < tempMaxY; y += stepY) {
    for (let x = 0; x < tempMaxX; x += stepX) {
      let area1 = 0;
      let area2 = 0;
      let area3 = 0;
      let area4 = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      for (let i = y; i < y + stepY; i++) {
        const rowOffset = i * width;
        for (let j = x; j < x + stepX; j++) {
          const pIdx = rowOffset + j;
          const luma = imgGridLuma[pIdx];
          sumR += imgGridR[pIdx];
          sumG += imgGridG[pIdx];
          sumB += imgGridB[pIdx];

          const left = j < x + halfStepX;
          const top = i < y + halfStepY;
          if (left && top) area1 += luma;
          else if (!left && top) area2 += luma;
          else if (left && !top) area3 += luma;
          else area4 += luma;
        }
      }

      const a1 = Math.floor(area1 * invBlockArea4);
      const a2 = Math.floor(area2 * invBlockArea4);
      const a3 = Math.floor(area3 * invBlockArea4);
      const a4 = Math.floor(area4 * invBlockArea4);

      let m1 = Math.abs(a1 * 2 + a2 * -2 + a3 * -2 + a4 * 2);
      let m2 = Math.abs(a1 * 1 + a2 * 1 + a3 * -1 + a4 * -1);
      let m3 = Math.abs(a1 * 1 + a2 * -1 + a3 * 1 + a4 * -1);
      let m4 = Math.abs(a1 * Math.SQRT2 - a4 * Math.SQRT2);
      let m5 = Math.abs(a2 * Math.SQRT2 - a3 * Math.SQRT2);

      const maxM = Math.max(m1, Math.max(m2, Math.max(m3, Math.max(m4, m5))));
      let T = -1;

      if (maxM < T0) {
        edges[0] = 0;
        T = 0;
      } else {
        m1 /= maxM;
        m2 /= maxM;
        m3 /= maxM;
        m4 /= maxM;
        m5 /= maxM;

        if (m1 > T1) {
          T++;
          edges[T] = 1;
        }
        if (m2 > T2) {
          T++;
          edges[T] = 2;
        }
        if (m3 > T2) {
          T++;
          edges[T] = 3;
        }
        if (m4 > T3) {
          T++;
          edges[T] = 4;
        }
        if (m5 > T3) {
          T++;
          edges[T] = 5;
        }
      }

      const totalBlockPixels = stepX * stepY;
      const meanR = Math.floor(sumR / totalBlockPixels);
      const meanG = Math.floor(sumG / totalBlockPixels);
      const meanB = Math.floor(sumB / totalBlockPixels);

      const [h, s, v] = rgbToHsv(meanR, meanG, meanB);
      applyFuzzy10(h, s, v, fuzzy10);
      applyFuzzy24(h, s, v, fuzzy10, fuzzy24);

      for (let i = 0; i <= T; i++) {
        const edgeOffset = 24 * edges[i];
        for (let j = 0; j < 24; j++) {
          if (fuzzy24[j] > 0) {
            cedd[edgeOffset + j] += fuzzy24[j];
          }
        }
      }
    }
  }

  let sum = 0;
  for (let i = 0; i < 144; i++) sum += cedd[i];
  if (sum > 0) {
    for (let i = 0; i < 144; i++) cedd[i] /= sum;
  }

  // Quantize 144 bins to 3-bit values [0..7]
  const quantized = new Uint8Array(144);
  for (let section = 0; section < 6; section++) {
    const qTable = QUANT_TABLES[section];
    const start = section * 24;
    for (let i = 0; i < 24; i++) {
      const val = cedd[start + i];
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

export const CEDD: FeatureExtractor = {
  extract(image: PixelData): number[] {
    return extractCEDDVector(image);
  },

  encode: encodeCEDD,
  decode: decodeCEDD,

  distance(a: number[] | string, b: number[] | string): number {
    const toVector = (x: number[] | string): number[] => {
      if (typeof x === "string") {
        return decodeCEDD(x);
      }
      return x;
    };

    const histA = toVector(a);
    const histB = toVector(b);

    let temp1 = 0;
    let temp2 = 0;
    for (let i = 0; i < 144; i++) {
      temp1 += histA[i];
      temp2 += histB[i];
    }

    if (temp1 === 0 && temp2 === 0) return 0;
    if (temp1 === 0 || temp2 === 0) return 100;

    let tempCount1 = 0;
    let tempCount2 = 0;
    let tempCount3 = 0;

    for (let i = 0; i < 144; i++) {
      const iTmp1 = histA[i] / temp1;
      const iTmp2 = histB[i] / temp2;
      tempCount1 += iTmp1 * iTmp2;
      tempCount2 += iTmp2 * iTmp2;
      tempCount3 += iTmp1 * iTmp1;
    }

    return 100 - 100 * (tempCount1 / (tempCount2 + tempCount3 - tempCount1));
  },
};
