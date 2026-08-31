import test from "node:test";
import assert from "node:assert/strict";
import {
  extractors,
  extract,
  encodeColorLayout,
  decodeColorLayout,
  encodeEdgeHistogram,
  decodeEdgeHistogram,
  encodeCEDD,
  decodeCEDD,
  encodeFCTH,
  decodeFCTH,
  encodeJCD,
  decodeJCD,
  encodeAutoColorCorrelogram,
  decodeAutoColorCorrelogram,
  encodeOpponentHistogram,
  decodeOpponentHistogram,
} from "../dist/index.js";

test("Standardized Extract, Encode, Decode & Distance on all Extractors", async (t) => {
  const dummyImage = {
    data: new Uint8Array(320 * 240 * 4).fill(100),
    width: 320,
    height: 240,
    channels: 4,
  };

  const configs = [
    {
      code: "cl",
      name: "ColorLayout",
      ext: extractors.cl,
      encodeFn: encodeColorLayout,
      decodeFn: decodeColorLayout,
      expectedLength: 28,
    },
    {
      code: "eh",
      name: "EdgeHistogram",
      ext: extractors.eh,
      encodeFn: encodeEdgeHistogram,
      decodeFn: decodeEdgeHistogram,
      expectedLength: 40,
    },
    {
      code: "ce",
      name: "CEDD",
      ext: extractors.ce,
      encodeFn: encodeCEDD,
      decodeFn: decodeCEDD,
      expectedLength: 72,
    },
    {
      code: "fc",
      name: "FCTH",
      ext: extractors.fc,
      encodeFn: encodeFCTH,
      decodeFn: decodeFCTH,
      expectedLength: 96,
    },
    {
      code: "jc",
      name: "JCD",
      ext: extractors.jc,
      encodeFn: encodeJCD,
      decodeFn: decodeJCD,
      expectedLength: 112,
    },
    {
      code: "oh",
      name: "OpponentHistogram",
      ext: extractors.oh,
      encodeFn: encodeOpponentHistogram,
      decodeFn: decodeOpponentHistogram,
      expectedLength: 75,
    },
    {
      code: "ac",
      name: "AutoColorCorrelogram",
      ext: extractors.ac,
      encodeFn: encodeAutoColorCorrelogram,
      decodeFn: decodeAutoColorCorrelogram,
      expectedLength: 171,
    },
  ];

  for (const cfg of configs) {
    await t.test(`Extractor ${cfg.name} (${cfg.code})`, async () => {
      const vector = cfg.ext.extract(dummyImage);
      assert.equal(Array.isArray(vector), true, `${cfg.name} extract should return number[]`);

      // 1. Encode produces URL-safe string of exact length with no padding
      const hash = cfg.encodeFn(vector);
      assert.equal(typeof hash, "string", `${cfg.name} encode should return string`);
      assert.equal(
        hash.length,
        cfg.expectedLength,
        `${cfg.name} hash length should be ${cfg.expectedLength}`,
      );
      assert.equal(hash.includes("="), false, `${cfg.name} hash should not have padding`);
      assert.equal(hash.includes("+"), false, `${cfg.name} hash should be URL-safe`);
      assert.equal(hash.includes("/"), false, `${cfg.name} hash should be URL-safe`);

      // 2. Decode standalone function roundtrips correctly
      const decoded = cfg.decodeFn(hash);
      assert.deepEqual(decoded, vector, `${cfg.name} standalone decode mismatch`);

      // 3. Extractor object encode and decode methods
      const objHash = cfg.ext.encode(vector);
      assert.equal(objHash, hash);
      const objDecoded = cfg.ext.decode(objHash);
      assert.deepEqual(objDecoded, vector, `${cfg.name} object decode mismatch`);

      // 4. Distance works with both vectors and encoded URL-safe string hashes
      const distVec = cfg.ext.distance(vector, vector);
      const distHash = cfg.ext.distance(hash, hash);
      assert.equal(distVec, 0);
      assert.equal(distHash, 0);
    });
  }

  await t.test("Batch extract returns Record<Code, number[]>", () => {
    const allVectors = extract(dummyImage);
    for (const code of Object.keys(extractors)) {
      assert.deepEqual(allVectors[code], extractors[code].extract(dummyImage));
    }
  });
});
