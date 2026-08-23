import { FeatureExtractor, FeatureResult, PixelData } from "./types.js";
import { bytesToBase64 } from "./utils.js";

const DISTANCE_SET = [1, 2, 3, 4];
const NUM_COLORS = 64;

const QUANT_H = 360.0 / 8.0; // 45.0
const QUANT_S = 256.0 / 4.0; // 64.0
const QUANT_V = 256.0 / 2.0; // 128.0

function convertRgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, Math.max(g, b));
  const min = Math.min(r, Math.min(g, b));

  let sat = 0;
  if (max !== 0) {
    sat = Math.floor(((max - min) / max) * 255.0);
  }

  let hue = 0.0;
  if (max !== min) {
    const diff = max - min;
    if (r === max) {
      hue = (g - b) / diff;
    } else if (g === max) {
      hue = 2.0 + (b - r) / diff;
    } else {
      hue = 4.0 + (r - g) / diff;
    }
    hue *= 60.0;
    if (hue < 0.0) hue += 360.0;
  }

  return [Math.floor(hue), sat, max];
}

function quantizeHsv(h: number, s: number, v: number): number {
  const binH = Math.min(Math.floor(h / QUANT_H), 7);
  const binS = Math.min(Math.floor(s / QUANT_S), 3);
  const binV = Math.min(Math.floor(v / QUANT_V), 1);
  return binH * 8 + binS * 2 + binV;
}

export const AutoColorCorrelogram: FeatureExtractor = {
  name: "AutoColorCorrelogram",
  code: "ac",

  extract(image: PixelData): FeatureResult {
    const width = image.width;
    const height = image.height;
    const channels = image.channels ?? 4;
    const data = image.data;

    const img = new Int32Array(width * height);
    const histogram = new Int32Array(NUM_COLORS);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const idx = (rowOffset + x) * channels;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const [h, s, v] = convertRgbToHsv(r, g, b);
        const c = quantizeHsv(h, s, v);
        img[rowOffset + x] = c;
        histogram[c]++;
      }
    }

    const numDists = DISTANCE_SET.length;
    // 64 colors x 4 distances = 256 entries
    const correlogram = new Float32Array(NUM_COLORS * numDists);

    for (let di = 0; di < numDists; di++) {
      const d = DISTANCE_SET[di];
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const c = img[y * width + x];

          // Horizontal bounds
          for (let dx = -d; dx <= d; dx++) {
            const X = x + dx;
            const Y1 = y - d;
            if (X >= 0 && X < width && Y1 >= 0 && Y1 < height && img[Y1 * width + X] === c) {
              correlogram[c * numDists + di]++;
            }
            const Y2 = y + d;
            if (X >= 0 && X < width && Y2 >= 0 && Y2 < height && img[Y2 * width + X] === c) {
              correlogram[c * numDists + di]++;
            }
          }

          // Vertical bounds
          for (let dy = -d + 1; dy <= d - 1; dy++) {
            const X1 = x - d;
            const Y = y + dy;
            if (X1 >= 0 && X1 < width && Y >= 0 && Y < height && img[Y * width + X1] === c) {
              correlogram[c * numDists + di]++;
            }
            const X2 = x + d;
            if (X2 >= 0 && X2 < width && Y >= 0 && Y < height && img[Y * width + X2] === c) {
              correlogram[c * numDists + di]++;
            }
          }
        }
      }

      // Normalization matching LIRE NaiveAutoCorrelogramExtraction
      for (let c = 0; c < NUM_COLORS; c++) {
        if (histogram[c] > 0) {
          const rawCount = correlogram[c * numDists + di];
          correlogram[c * numDists + di] = Math.floor(16.0 * (rawCount / (histogram[c] * 8.0 * d)));
        }
      }
    }

    const featureVector = Array.from(correlogram);

    // Pack into 128 bytes (256 4-bit nibbles)
    const byteArray = new Uint8Array((NUM_COLORS * numDists) / 2);
    let pos = 0;
    for (let i = 0; i < NUM_COLORS; i++) {
      for (let j = 0; j < numDists; j += 2) {
        const val0 = Math.floor(correlogram[i * numDists + j]) & 0x0f;
        const val1 = Math.floor(correlogram[i * numDists + j + 1]) & 0x0f;
        const tmp = (val0 << 4) | val1;
        byteArray[pos++] = (tmp - 128) & 0xff;
      }
    }

    return {
      featureVector,
      byteArray,
      base64: bytesToBase64(byteArray),
    };
  },

  distance(a: number[] | Uint8Array, b: number[] | Uint8Array): number {
    let vecA: number[];
    let vecB: number[];

    if (a instanceof Uint8Array || a.length === 128) {
      vecA = new Array(256);
      let count = 0;
      for (let i = 0; i < a.length; i++) {
        const tmp = (a[i] + 128) & 0xff;
        vecA[count++] = (tmp >> 4) & 0x0f;
        vecA[count++] = tmp & 0x0f;
      }
    } else {
      vecA = a as number[];
    }

    if (b instanceof Uint8Array || b.length === 128) {
      vecB = new Array(256);
      let count = 0;
      for (let i = 0; i < b.length; i++) {
        const tmp = (b[i] + 128) & 0xff;
        vecB[count++] = (tmp >> 4) & 0x0f;
        vecB[count++] = tmp & 0x0f;
      }
    } else {
      vecB = b as number[];
    }

    // Jensen-Shannon Divergence matching LIRE
    let sum = 0.0;
    for (let i = 0; i < 256; i++) {
      const vA = vecA[i];
      const vB = vecB[i];
      const denom = vA + vB;
      if (denom > 0) {
        if (vA > 0) {
          sum += (vA / 2.0) * Math.log((2.0 * vA) / denom);
        }
        if (vB > 0) {
          sum += (vB / 2.0) * Math.log((2.0 * vB) / denom);
        }
      }
    }

    return sum;
  },
};
