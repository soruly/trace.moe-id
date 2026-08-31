import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { extract, extractors } from "../dist/index.js";

const FIXTURES_DIR = new URL("./fixtures/", import.meta.url).pathname;
const REFERENCE_JSON_PATH = path.join(FIXTURES_DIR, "reference_results.json");

async function loadFixtureImage(filename) {
  const filePath = path.join(FIXTURES_DIR, filename);
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: 4,
  };
}

test("Pattern Reference Regression Tests", async (t) => {
  const referenceData = JSON.parse(await fs.readFile(REFERENCE_JSON_PATH, "utf8"));
  const patternNames = Object.keys(referenceData);

  for (const patternName of patternNames) {
    await t.test(`Pattern: ${patternName}`, async (pt) => {
      const ref = referenceData[patternName];
      const image = await loadFixtureImage(`${patternName}.png`);

      assert.equal(image.width, ref.width);
      assert.equal(image.height, ref.height);

      const results = extract(image);

      for (const [code, ext] of Object.entries(extractors)) {
        await pt.test(`Extractor: ${code}`, () => {
          const vector = results[code];
          const expected = ref.features[code];

          assert.ok(vector, `Missing result for ${code}`);
          assert.deepEqual(
            vector,
            expected.vector,
            `Vector mismatch for ${code} on ${patternName}`,
          );

          const encoded = ext.encode(vector);
          assert.equal(
            encoded,
            expected.hash,
            `Hash string mismatch for ${code} on ${patternName}`,
          );

          // Self distance invariant: d(x, x) === 0
          const distSelf = ext.distance(vector, vector);
          assert.equal(distSelf, 0, `Self-distance should be 0 for ${code}`);
        });
      }
    });
  }
});

test("Distance Metric Symmetry and Triangle Properties", async () => {
  const blackImg = await loadFixtureImage("solid_black.png");
  const whiteImg = await loadFixtureImage("solid_white.png");
  const redImg = await loadFixtureImage("solid_red.png");

  for (const [code, ext] of Object.entries(extractors)) {
    const vBlack = ext.extract(blackImg);
    const vWhite = ext.extract(whiteImg);
    const vRed = ext.extract(redImg);

    const dBlackWhite = ext.distance(vBlack, vWhite);
    const dWhiteBlack = ext.distance(vWhite, vBlack);
    const dBlackRed = ext.distance(vBlack, vRed);
    const dWhiteRed = ext.distance(vWhite, vRed);

    // Non-negativity
    assert.ok(dBlackWhite >= 0);
    assert.ok(dBlackRed >= 0);
    assert.ok(dWhiteRed >= 0);

    // Symmetry: d(A, B) === d(B, A)
    assert.equal(dBlackWhite, dWhiteBlack, `Distance should be symmetric for ${code}`);

    // Packed distance matches vector distance
    const dPacked = ext.distance(ext.encode(vBlack), ext.encode(vWhite));
    assert.equal(dBlackWhite, dPacked);
  }
});
