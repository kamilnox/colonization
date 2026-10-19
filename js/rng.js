// Seeded random numbers and value noise for map generation.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable pseudo-random number in [0, 1) for a tile, used for cosmetic variation.
export function hash2(x, y, salt = 0) {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + salt * 1013, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return smooth(t);
}

function valueNoise(rand, w, h, scale) {
  scale = Math.max(1, scale);
  const gw = Math.ceil(w / scale) + 2;
  const gh = Math.ceil(h / scale) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const fx = x / scale, fy = y / scale;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = smooth(fx - ix), ty = smooth(fy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1];
    const c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  };
}

// Fractal noise in [0, 1].
export function fbm(rand, w, h, scale, octaves = 3) {
  const layers = [];
  for (let i = 0; i < octaves; i++) layers.push(valueNoise(rand, w, h, scale / 2 ** i));
  return (x, y) => {
    let sum = 0, amp = 1, total = 0;
    for (const n of layers) {
      sum += n(x, y) * amp;
      total += amp;
      amp *= 0.5;
    }
    return sum / total;
  };
}

export const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

export function weighted(rand, weights) {
  const entries = Object.entries(weights);
  let r = rand() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    r -= w;
    if (r < 0) return k;
  }
  return entries[entries.length - 1][0];
}
