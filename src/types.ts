export interface PixelData {
  /** Flat array of pixel values (RGBA or RGB). Length must be width * height * (channels || 4) */
  data: Uint8Array | Uint8ClampedArray;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Number of color channels: 4 (RGBA) or 3 (RGB). Defaults to 4 */
  channels?: 3 | 4;
}

export interface FeatureResult {
  /** The numerical feature vector/histogram (e.g. 33 values for ColorLayout, 80 for EdgeHistogram, 144 for CEDD) */
  featureVector: number[];
  /** Exact binary packed byte array matching Java LIRE serialization */
  byteArray: Uint8Array;
  /** Standard Base64 representation of byteArray for Solr / DB indexing */
  base64: string;
}

export interface FeatureExtractor {
  readonly name: string;
  readonly code: string;
  extract(image: PixelData): FeatureResult;
  distance(a: number[] | Uint8Array, b: number[] | Uint8Array): number;
}
