import { PixelData } from "./types.js";

/**
 * Extracts RGB components for a pixel at (x, y)
 */
export function getPixelRGB(image: PixelData, x: number, y: number): [number, number, number] {
  const channels = image.channels ?? 4;
  const idx = (y * image.width + x) * channels;
  return [image.data[idx], image.data[idx + 1], image.data[idx + 2]];
}

/**
 * Encodes an array of integers (each fitting in `bitsPerVal` bits) into a compact Uint8Array.
 */
export function encodeFixedBits(
  values: ArrayLike<number>,
  bitsPerVal: number,
  outByteLen: number,
): Uint8Array {
  const bytes = new Uint8Array(outByteLen);
  let bitOffset = 0;
  const mask = (1 << bitsPerVal) - 1;
  const count = values.length;

  for (let i = 0; i < count; i++) {
    const val = values[i] & mask;
    for (let b = bitsPerVal - 1; b >= 0; b--) {
      const bit = (val >> b) & 1;
      const byteIdx = bitOffset >> 3;
      const bitIdx = 7 - (bitOffset & 7);
      bytes[byteIdx] |= bit << bitIdx;
      bitOffset++;
    }
  }
  return bytes;
}

/**
 * Decodes a compact Uint8Array into an array of integers (each `bitsPerVal` bits).
 */
export function decodeFixedBits(bytes: Uint8Array, bitsPerVal: number, count: number): number[] {
  const result = new Array<number>(count);
  let bitOffset = 0;

  for (let i = 0; i < count; i++) {
    let val = 0;
    for (let b = 0; b < bitsPerVal; b++) {
      const byteIdx = bitOffset >> 3;
      const bitIdx = 7 - (bitOffset & 7);
      const bit = (bytes[byteIdx] >> bitIdx) & 1;
      val = (val << 1) | bit;
      bitOffset++;
    }
    result[i] = val;
  }
  return result;
}

/**
 * Converts a Uint8Array into an unpadded URL-safe base64 string.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Converts an unpadded URL-safe base64 string back into a Uint8Array.
 */
export function base64UrlToBytes(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
