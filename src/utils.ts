import { PixelData } from "./types.js";

/**
 * Converts a Uint8Array to a Base64 string without external dependencies
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string to a Uint8Array without external dependencies
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Extracts RGB components for a pixel at (x, y)
 */
export function getPixelRGB(image: PixelData, x: number, y: number): [number, number, number] {
  const channels = image.channels ?? 4;
  const idx = (y * image.width + x) * channels;
  return [image.data[idx], image.data[idx + 1], image.data[idx + 2]];
}
