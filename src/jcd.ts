import { FeatureExtractor, PixelData } from "./types.js";
import { encodeFixedBits, decodeFixedBits, bytesToBase64Url, base64UrlToBytes } from "./utils.js";
import { CEDD } from "./cedd.js";
import { FCTH } from "./fcth.js";

/**
 * Encodes 168 JCD bins (each scaled by 2, fitting in 4 bits [0..14]) into a compact URL-safe base64 string.
 */
export function encodeJCD(vector: number[]): string {
  const scaled = new Uint8Array(168);
  for (let i = 0; i < 168; i++) {
    scaled[i] = Math.round(vector[i] * 2) & 0x0f;
  }
  return bytesToBase64Url(encodeFixedBits(scaled, 4, 84));
}

/**
 * Decodes a compact URL-safe base64 string into a 168-bin JCD vector.
 */
export function decodeJCD(hash: string): number[] {
  const bytes = base64UrlToBytes(hash);
  const raw = decodeFixedBits(bytes, 4, 168);
  return raw.map((x) => x / 2.0);
}

function extractJCDVector(image: PixelData): number[] {
  const cedd = CEDD.extract(image);
  const fcth = FCTH.extract(image);

  const joint = new Array<number>(168);

  for (let i = 0; i < 24; i++) {
    const t1 = fcth[i] + fcth[96 + i];
    const t2 = fcth[24 + i] + fcth[120 + i];
    const t3 = fcth[48 + i] + fcth[144 + i];
    const t4 = fcth[72 + i] + fcth[168 + i];

    joint[i] = (t1 + cedd[i]) / 2;
    joint[24 + i] = (t2 + cedd[48 + i]) / 2;
    joint[48 + i] = cedd[96 + i];
    joint[72 + i] = (t3 + cedd[72 + i]) / 2;
    joint[96 + i] = cedd[120 + i];
    joint[120 + i] = t4;
    joint[144 + i] = cedd[24 + i];
  }

  return joint;
}

export const JCD: FeatureExtractor = {
  extract(image: PixelData): number[] {
    return extractJCDVector(image);
  },

  encode: encodeJCD,
  decode: decodeJCD,

  distance(a: number[] | string, b: number[] | string): number {
    const toVector = (x: number[] | string): number[] => {
      if (typeof x === "string") {
        return decodeJCD(x);
      }
      return x;
    };

    const histA = toVector(a);
    const histB = toVector(b);

    let temp1 = 0;
    let temp2 = 0;
    for (let i = 0; i < 168; i++) {
      temp1 += histA[i];
      temp2 += histB[i];
    }

    if (temp1 === 0 && temp2 === 0) return 0;
    if (temp1 === 0 || temp2 === 0) return 100;

    let tempCount1 = 0;
    let tempCount2 = 0;
    let tempCount3 = 0;

    for (let i = 0; i < 168; i++) {
      const aNorm = histA[i] / temp1;
      const bNorm = histB[i] / temp2;
      tempCount1 += bNorm * aNorm;
      tempCount2 += aNorm * aNorm;
      tempCount3 += bNorm * bNorm;
    }

    return 100.0 - 100.0 * (tempCount1 / (tempCount2 + tempCount3 - tempCount1));
  },
};
