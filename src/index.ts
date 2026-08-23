export * from "./types.js";
export * from "./utils.js";
export { ColorLayout } from "./colorLayout.js";
export { EdgeHistogram } from "./edgeHistogram.js";
export { CEDD } from "./cedd.js";
export { FCTH } from "./fcth.js";
export { JCD } from "./jcd.js";
export { AutoColorCorrelogram } from "./autoColorCorrelogram.js";
export { OpponentHistogram } from "./opponentHistogram.js";

import { ColorLayout } from "./colorLayout.js";
import { EdgeHistogram } from "./edgeHistogram.js";
import { CEDD } from "./cedd.js";
import { FCTH } from "./fcth.js";
import { JCD } from "./jcd.js";
import { AutoColorCorrelogram } from "./autoColorCorrelogram.js";
import { OpponentHistogram } from "./opponentHistogram.js";
import { FeatureExtractor, FeatureResult, PixelData } from "./types.js";

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
 * Extracts visual feature descriptors from an image.
 * When `codes` is omitted, all available descriptors are extracted by default.
 *
 * @example
 * // Extract all descriptors
 * const all = extract(image);
 *
 * // Extract specific descriptors
 * const some = extract(image, ["cl", "eh"]);
 */
export function extract<K extends FeatureCode = FeatureCode>(
  image: PixelData,
  codes: K[] = Object.keys(extractors) as K[],
): Record<K, FeatureResult> {
  const results = {} as Record<K, FeatureResult>;
  for (const code of codes) {
    const extractor = extractors[code];
    if (extractor) {
      results[code] = extractor.extract(image);
    }
  }
  return results;
}
