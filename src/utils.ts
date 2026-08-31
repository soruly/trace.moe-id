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
export function decodeFixedBits(
  bytes: Uint8Array,
  bitsPerVal: number,
  count: number,
): number[] {
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

const BASE64_URL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64_URL_LOOKUP = new Uint8Array(256);
for (let i = 0; i < BASE64_URL_CHARS.length; i++) {
  BASE64_URL_LOOKUP[BASE64_URL_CHARS.charCodeAt(i)] = i;
}

/**
 * Converts a Uint8Array into an unpadded URL-safe base64 string.
 */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;
  let i = 0;

  for (; i + 2 < len; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result +=
      BASE64_URL_CHARS[b0 >> 2] +
      BASE64_URL_CHARS[((b0 & 3) << 4) | (b1 >> 4)] +
      BASE64_URL_CHARS[((b1 & 15) << 2) | (b2 >> 6)] +
      BASE64_URL_CHARS[b2 & 63];
  }

  if (i < len) {
    const b0 = bytes[i];
    if (i + 1 < len) {
      const b1 = bytes[i + 1];
      result +=
        BASE64_URL_CHARS[b0 >> 2] +
        BASE64_URL_CHARS[((b0 & 3) << 4) | (b1 >> 4)] +
        BASE64_URL_CHARS[(b1 & 15) << 2];
    } else {
      result += BASE64_URL_CHARS[b0 >> 2] + BASE64_URL_CHARS[(b0 & 3) << 4];
    }
  }

  return result;
}

/**
 * Converts an unpadded URL-safe base64 string back into a Uint8Array.
 */
export function base64UrlToBytes(str: string): Uint8Array {
  const len = str.length;
  if (len === 0) return new Uint8Array(0);

  const mod = len % 4;
  const numFullChunks = Math.floor(len / 4);
  let byteLen = numFullChunks * 3;
  if (mod === 2) byteLen += 1;
  else if (mod === 3) byteLen += 2;

  const bytes = new Uint8Array(byteLen);
  let byteIdx = 0;
  let i = 0;

  for (let c = 0; c < numFullChunks; c++, i += 4) {
    const c0 = BASE64_URL_LOOKUP[str.charCodeAt(i)];
    const c1 = BASE64_URL_LOOKUP[str.charCodeAt(i + 1)];
    const c2 = BASE64_URL_LOOKUP[str.charCodeAt(i + 2)];
    const c3 = BASE64_URL_LOOKUP[str.charCodeAt(i + 3)];

    bytes[byteIdx++] = (c0 << 2) | (c1 >> 4);
    bytes[byteIdx++] = ((c1 & 15) << 4) | (c2 >> 2);
    bytes[byteIdx++] = ((c2 & 3) << 6) | c3;
  }

  if (mod === 2) {
    const c0 = BASE64_URL_LOOKUP[str.charCodeAt(i)];
    const c1 = BASE64_URL_LOOKUP[str.charCodeAt(i + 1)];
    bytes[byteIdx++] = (c0 << 2) | (c1 >> 4);
  } else if (mod === 3) {
    const c0 = BASE64_URL_LOOKUP[str.charCodeAt(i)];
    const c1 = BASE64_URL_LOOKUP[str.charCodeAt(i + 1)];
    const c2 = BASE64_URL_LOOKUP[str.charCodeAt(i + 2)];
    bytes[byteIdx++] = (c0 << 2) | (c1 >> 4);
    bytes[byteIdx++] = ((c1 & 15) << 4) | (c2 >> 2);
  }

  return bytes;
}
