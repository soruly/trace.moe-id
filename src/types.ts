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

export interface FeatureExtractor {
  /** Extracts the numerical feature vector from an image */
  extract(image: PixelData): number[];
  /** Encodes a numerical feature vector into a compact URL-safe base64 string */
  encode(vector: number[]): string;
  /** Decodes a compact URL-safe base64 string back into the standardized numerical feature vector */
  decode(hash: string): number[];
  /** Calculates visual distance between two descriptors (supports number[] or URL-safe base64 string) */
  distance(a: number[] | string, b: number[] | string): number;
}
