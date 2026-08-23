import { FeatureExtractor, FeatureResult, PixelData } from "./types.js";
import { bytesToBase64 } from "./utils.js";
import { CEDD } from "./cedd.js";
import { FCTH } from "./fcth.js";

export const JCD: FeatureExtractor = {
  name: "JCD",
  code: "jc",

  extract(image: PixelData): FeatureResult {
    const ceddResult = CEDD.extract(image);
    const fcthResult = FCTH.extract(image);

    const cedd = ceddResult.featureVector;
    const fcth = fcthResult.featureVector;

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

    // Byte serialization matching LIRE JCD
    const buf = new Uint8Array(168);
    let len = 0;
    let tmpVal = 0;

    for (let i = 0; i < 168; i++) {
      if (joint[i] > 0) {
        if (tmpVal < 0) {
          buf[len++] = tmpVal & 0xff;
          tmpVal = 0;
        }
        buf[len++] = Math.floor(2 * joint[i]) & 0xff;
      } else {
        tmpVal--;
      }
    }
    if (tmpVal < 0) {
      buf[len++] = tmpVal & 0xff;
    }

    const byteArray = buf.slice(0, len);

    return {
      featureVector: joint,
      byteArray,
      base64: bytesToBase64(byteArray),
    };
  },

  distance(a: number[] | Uint8Array, b: number[] | Uint8Array): number {
    let histA: number[];
    let histB: number[];

    if (a instanceof Uint8Array || a.length < 168) {
      histA = new Array(168).fill(0);
      let idx = 0;
      for (let i = 0; i < a.length; i++) {
        const signedByte = (a[i] << 24) >> 24;
        if (signedByte > 0) {
          histA[idx++] = signedByte / 2.0;
        } else {
          idx += Math.abs(signedByte);
        }
      }
    } else {
      histA = a as number[];
    }

    if (b instanceof Uint8Array || b.length < 168) {
      histB = new Array(168).fill(0);
      let idx = 0;
      for (let i = 0; i < b.length; i++) {
        const signedByte = (b[i] << 24) >> 24;
        if (signedByte > 0) {
          histB[idx++] = signedByte / 2.0;
        } else {
          idx += Math.abs(signedByte);
        }
      }
    } else {
      histB = b as number[];
    }

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
