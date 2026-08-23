import { FeatureExtractor, FeatureResult, PixelData } from "./types.js";
import { bytesToBase64 } from "./utils.js";

const SQ2 = Math.SQRT2;
const SQ3 = Math.sqrt(6.0); // Note: in Java LIRE code sq6 is sqrt(3), sq3 is sqrt(6)
const SQ6 = Math.sqrt(3.0);

export const OpponentHistogram: FeatureExtractor = {
  name: "OpponentHistogram",
  code: "oh",

  extract(image: PixelData): FeatureResult {
    const width = image.width;
    const height = image.height;
    const channels = image.channels ?? 4;
    const data = image.data;

    const rawHistogram = new Float64Array(64);

    for (let x = 1; x < width - 1; x++) {
      for (let y = 1; y < height - 1; y++) {
        const idx = (y * width + x) * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        let o1 = (r - g) / SQ2;
        let o2 = (r + g - 2 * b) / SQ6;
        let o3 = (r + g + b) / SQ3;

        o1 = (o1 + 255.0 / SQ2) / (510.0 / SQ2);
        o2 = (o2 + 510.0 / SQ6) / (1020.0 / SQ6);
        o3 = o3 / ((3.0 * 255.0) / SQ3);

        const bin1 = Math.min(Math.floor(o1 * 4.0), 3);
        const bin2 = Math.min(Math.floor(o2 * 4.0), 3);
        const bin3 = Math.min(Math.floor(o3 * 4.0), 3);

        const colorPos = bin1 + bin2 * 4 + bin3 * 16;
        rawHistogram[colorPos]++;
      }
    }

    let maxVal = 0;
    for (let i = 0; i < 64; i++) {
      if (rawHistogram[i] > maxVal) maxVal = rawHistogram[i];
    }

    const featureVector = new Array<number>(64);
    const byteArray = new Uint8Array(64);

    for (let i = 0; i < 64; i++) {
      const qVal = maxVal > 0 ? Math.floor(127.0 * (rawHistogram[i] / maxVal)) : 0;
      featureVector[i] = qVal;
      byteArray[i] = qVal & 0xff;
    }

    return {
      featureVector,
      byteArray,
      base64: bytesToBase64(byteArray),
    };
  },

  distance(a: number[] | Uint8Array, b: number[] | Uint8Array): number {
    const vecA = Array.isArray(a) ? a : Array.from(a);
    const vecB = Array.isArray(b) ? b : Array.from(b);

    let sum = 0.0;
    for (let i = 0; i < 64; i++) {
      const vA = vecA[i];
      const vB = vecB[i];
      const tmpVal = vA + vB;
      if (tmpVal > 0) {
        if (vA > 0) {
          sum += (vA / 2.0) * Math.log((2.0 * vA) / tmpVal);
        }
        if (vB > 0) {
          sum += (vB / 2.0) * Math.log((2.0 * vB) / tmpVal);
        }
      }
    }
    return sum;
  },
};
