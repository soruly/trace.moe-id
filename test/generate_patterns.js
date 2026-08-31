import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { extract, extractors } from "../dist/index.js";

const FIXTURES_DIR = new URL("./fixtures/", import.meta.url).pathname;

/**
 * Helper to create a PixelData buffer from a generator function
 */
function createSyntheticImage(width, height, pixelFn) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a = 255] = pixelFn(x, y, width, height);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return { data, width, height, channels: 4 };
}

// Fixed seed pseudo-random generator for reproducibility
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const PATTERNS = [
  // 1. Pure Solid Colors (Edge Cases)
  {
    name: "solid_black",
    width: 320,
    height: 240,
    fn: () => [0, 0, 0],
  },
  {
    name: "solid_white",
    width: 320,
    height: 240,
    fn: () => [255, 255, 255],
  },
  {
    name: "solid_gray",
    width: 320,
    height: 240,
    fn: () => [128, 128, 128],
  },
  {
    name: "solid_red",
    width: 320,
    height: 240,
    fn: () => [255, 0, 0],
  },
  {
    name: "solid_green",
    width: 320,
    height: 240,
    fn: () => [0, 255, 0],
  },
  {
    name: "solid_blue",
    width: 320,
    height: 240,
    fn: () => [0, 0, 255],
  },

  // 2. Extreme Dimensions (Edge Cases)
  {
    name: "tiny_8x8_white",
    width: 8,
    height: 8,
    fn: () => [255, 255, 255],
  },
  {
    name: "tiny_16x16_black",
    width: 16,
    height: 16,
    fn: () => [0, 0, 0],
  },
  {
    name: "small_40x40_checker",
    width: 40,
    height: 40,
    fn: (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? [255, 255, 255] : [0, 0, 0]),
  },
  {
    name: "wide_panoramic_400x50",
    width: 400,
    height: 50,
    fn: (x, y, w, h) => [Math.floor((x / w) * 255), Math.floor((y / h) * 255), 128],
  },
  {
    name: "tall_portrait_50x400",
    width: 50,
    height: 400,
    fn: (x, y, w, h) => [Math.floor((x / w) * 255), Math.floor((y / h) * 255), 128],
  },

  // 3. Directional & Edge Patterns (Testing Edge Kernels & Gradients)
  {
    name: "vertical_split_bw",
    width: 320,
    height: 240,
    fn: (x, y, w) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]),
  },
  {
    name: "horizontal_split_bw",
    width: 320,
    height: 240,
    fn: (x, y, w, h) => (y < h / 2 ? [0, 0, 0] : [255, 255, 255]),
  },
  {
    name: "diagonal_45_split",
    width: 320,
    height: 240,
    fn: (x, y, w, h) => (y / h > x / w ? [255, 0, 0] : [0, 0, 255]),
  },
  {
    name: "diagonal_135_split",
    width: 320,
    height: 240,
    fn: (x, y, w, h) => (1.0 - y / h > x / w ? [0, 255, 0] : [255, 255, 0]),
  },
  {
    name: "vertical_stripes",
    width: 320,
    height: 240,
    fn: (x) => (Math.floor(x / 16) % 2 === 0 ? [255, 255, 255] : [0, 0, 0]),
  },
  {
    name: "horizontal_stripes",
    width: 320,
    height: 240,
    fn: (x, y) => (Math.floor(y / 16) % 2 === 0 ? [255, 255, 255] : [0, 0, 0]),
  },
  {
    name: "checkerboard_16px",
    width: 320,
    height: 240,
    fn: (x, y) =>
      (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? [255, 255, 255] : [0, 0, 0],
  },

  // 4. Color Spectrum & Gradients
  {
    name: "rainbow_gradient_h",
    width: 320,
    height: 240,
    fn: (x, y, w) => {
      const pos = x / w;
      if (pos < 1 / 3) {
        const t = pos * 3;
        return [Math.floor(255 * (1 - t)), Math.floor(255 * t), 0];
      } else if (pos < 2 / 3) {
        const t = (pos - 1 / 3) * 3;
        return [0, Math.floor(255 * (1 - t)), Math.floor(255 * t)];
      } else {
        const t = (pos - 2 / 3) * 3;
        return [Math.floor(255 * t), 0, Math.floor(255 * (1 - t))];
      }
    },
  },
  {
    name: "radial_gradient",
    width: 320,
    height: 240,
    fn: (x, y, w, h) => {
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h / 2) / (h / 2);
      const dist = Math.min(1.0, Math.sqrt(dx * dx + dy * dy));
      const val = Math.floor(255 * (1.0 - dist));
      return [val, Math.floor(val / 2), 255 - val];
    },
  },

  // 5. High-Frequency Noise
  {
    name: "deterministic_noise",
    width: 320,
    height: 240,
    fn: (() => {
      const rand = seededRandom(42);
      return () => [Math.floor(rand() * 256), Math.floor(rand() * 256), Math.floor(rand() * 256)];
    })(),
  },
];

async function main() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });

  const referenceResults = {};

  console.log(`Generating ${PATTERNS.length} test pattern images in ${FIXTURES_DIR}...`);

  for (const pattern of PATTERNS) {
    const img = createSyntheticImage(pattern.width, pattern.height, pattern.fn);

    // 1. Save as PNG fixture image
    const pngPath = path.join(FIXTURES_DIR, `${pattern.name}.png`);
    await sharp(Buffer.from(img.data), {
      raw: { width: img.width, height: img.height, channels: 4 },
    })
      .png()
      .toFile(pngPath);

    // 2. Extract reference feature results
    const results = extract(img);

    referenceResults[pattern.name] = {
      width: pattern.width,
      height: pattern.height,
      features: {},
    };

    for (const [code, vec] of Object.entries(results)) {
      const ext = extractors[code];
      referenceResults[pattern.name].features[code] = {
        vector: vec,
        hash: ext.encode(vec),
      };
    }

    console.log(`  ✓ ${pattern.name} (${pattern.width}x${pattern.height})`);
  }

  // 3. Save golden reference JSON
  const jsonPath = path.join(FIXTURES_DIR, "reference_results.json");
  await fs.writeFile(jsonPath, JSON.stringify(referenceResults, null, 2), "utf8");
  console.log(`\nSaved reference results JSON to ${jsonPath}`);
}

main().catch(console.error);
