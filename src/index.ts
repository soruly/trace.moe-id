export * from "./types.js";
export * from "./utils.js";
export { ColorLayout, encodeColorLayout, decodeColorLayout } from "./colorLayout.js";
export { EdgeHistogram, encodeEdgeHistogram, decodeEdgeHistogram } from "./edgeHistogram.js";
export { CEDD, encodeCEDD, decodeCEDD } from "./cedd.js";
export { FCTH, encodeFCTH, decodeFCTH } from "./fcth.js";
export { JCD, encodeJCD, decodeJCD } from "./jcd.js";
export {
  AutoColorCorrelogram,
  encodeAutoColorCorrelogram,
  decodeAutoColorCorrelogram,
} from "./autoColorCorrelogram.js";
export {
  OpponentHistogram,
  encodeOpponentHistogram,
  decodeOpponentHistogram,
} from "./opponentHistogram.js";

import { ColorLayout } from "./colorLayout.js";
import { EdgeHistogram } from "./edgeHistogram.js";
import { CEDD } from "./cedd.js";
import { FCTH } from "./fcth.js";
import { JCD } from "./jcd.js";
import { AutoColorCorrelogram } from "./autoColorCorrelogram.js";
import { OpponentHistogram } from "./opponentHistogram.js";
import { FeatureExtractor, PixelData } from "./types.js";

export const extractors: Record<string, FeatureExtractor> = {
  cl: ColorLayout,
  eh: EdgeHistogram,
  ce: CEDD,
  fc: FCTH,
  jc: JCD,
  ac: AutoColorCorrelogram,
  oh: OpponentHistogram,
};

export type FeatureCode = keyof typeof extractors;

/**
 * Extracts visual feature vectors from an image.
 * When `codes` is omitted, all available descriptors are extracted by default.
 *
 * @example
 * // Extract all descriptor vectors
 * const all = extract(image);
 * console.log(all.cl); // number[]
 *
 * // Extract specific descriptor vectors
 * const { cl, eh } = extract(image, ["cl", "eh"]);
 */
export function extract<K extends FeatureCode = FeatureCode>(
  image: PixelData,
  codes: K[] = Object.keys(extractors) as K[],
): Record<K, number[]> {
  const results = {} as Record<K, number[]>;
  for (const code of codes) {
    const extractor = extractors[code];
    if (extractor) {
      results[code] = extractor.extract(image);
    }
  }
  return results;
}
