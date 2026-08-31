import test from "node:test";
import assert from "node:assert/strict";
import { ColorLayout, encodeColorLayout, decodeColorLayout } from "../dist/index.js";

test("ColorLayout Extract, Encode, Decode & Distance", async (t) => {
  const dummyImage = {
    data: new Uint8Array(320 * 240 * 4).fill(128),
    width: 320,
    height: 240,
    channels: 4,
  };

  await t.test("extract returns 33-number vector", () => {
    const vector = ColorLayout.extract(dummyImage);
    assert.equal(Array.isArray(vector), true);
    assert.equal(vector.length, 33);
  });

  await t.test("encode produces 28-character URL-safe string and decodes to exact vector", () => {
    const vector = ColorLayout.extract(dummyImage);
    const hash = ColorLayout.encode(vector);
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 28);
    assert.equal(hash.includes("="), false);

    const decoded = ColorLayout.decode(hash);
    assert.deepEqual(decoded, vector);

    const standaloneHash = encodeColorLayout(vector);
    const standaloneDecoded = decodeColorLayout(standaloneHash);
    assert.deepEqual(standaloneDecoded, vector);
  });
});

test("ColorLayout Distance with vectors and encoded hashes", async () => {
  const dummy1 = {
    data: new Uint8Array(100 * 100 * 4).fill(50),
    width: 100,
    height: 100,
    channels: 4,
  };
  const dummy2 = {
    data: new Uint8Array(100 * 100 * 4).fill(180),
    width: 100,
    height: 100,
    channels: 4,
  };

  const vec1 = ColorLayout.extract(dummy1);
  const vec2 = ColorLayout.extract(dummy2);

  const hash1 = ColorLayout.encode(vec1);
  const hash2 = ColorLayout.encode(vec2);

  const distVectors = ColorLayout.distance(vec1, vec2);
  const distHashes = ColorLayout.distance(hash1, hash2);

  assert.equal(distVectors, distHashes);
  assert.equal(ColorLayout.distance(vec1, vec1), 0);
  assert.equal(ColorLayout.distance(hash1, hash1), 0);
});
