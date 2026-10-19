// Procedural New World: one big continent with an ocean on the east side (towards Europe).
import { MAP_W, MAP_H, TERRAIN, TRIBES } from './data.js';
import { mulberry32, fbm, smoothstep, pick } from './rng.js';

export const DIRS8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

// Replaces raw noise values with their rank in [0, 1] so thresholds give predictable shares.
function rankOf(values) {
  const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(values.length);
  order.forEach((i, r) => { ranks[i] = values.length > 1 ? r / (values.length - 1) : 0; });
  return ranks;
}

function climate(lat, m) {
  if (lat > 0.95) return 'arctic';
  if (lat > 0.8) return 'tundra';
  if (lat > 0.45) return m < 0.3 ? 'prairie' : m < 0.55 ? 'plains' : m < 0.85 ? 'grassland' : 'marsh';
  if (lat > 0.2) return m < 0.2 ? 'desert' : m < 0.4 ? 'prairie' : m < 0.65 ? 'plains' : m < 0.88 ? 'grassland' : 'marsh';
  return m < 0.22 ? 'desert' : m < 0.82 ? 'savanna' : 'marsh';
}

function villageSkill(rand, t, coastal) {
  if (coastal && rand() < 0.35) return 'fisherman';
  if (t.forest && rand() < 0.5) return rand() < 0.6 ? 'trapper' : 'lumberjack';
  switch (t.terrain) {
    case 'tundra': return rand() < 0.5 ? 'trapper' : 'miner';
    case 'prairie': return 'cottonplanter';
    case 'grassland': return 'tobaccoplanter';
    case 'savanna': return 'sugarplanter';
    case 'marsh': return 'tobaccoplanter';
    case 'desert': return rand() < 0.5 ? 'cottonplanter' : 'miner';
    case 'hills': return 'miner';
    default: return 'farmer';
  }
}

export function generateMap(seed) {
  const rand = mulberry32(seed);
  const W = MAP_W, H = MAP_H;
  const idx = (x, y) => y * W + x;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  const landN = fbm(rand, W, H, 11, 4);
  const moistN = fbm(rand, W, H, 9, 3);
  const elevN = fbm(rand, W, H, 6, 3);
  const forestN = fbm(rand, W, H, 4, 2);

  // Land mask: noise pushed down towards the edges, the east coast is always open sea.
  const vals = new Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cx = x / (W - 1), cy = y / (H - 1);
      let v = landN(x, y);
      v -= smoothstep(0.17, 0.36, Math.abs(cx - 0.38)) * 0.9;
      v -= smoothstep(0.36, 0.5, Math.abs(cy - 0.5)) * 0.9;
      if (x < 2 || x > W - 10 || y < 1 || y > H - 2) v -= 5;
      vals[idx(x, y)] = v;
    }
  }
  const threshold = [...vals].sort((a, b) => b - a)[Math.floor(W * H * 0.37)];

  const tiles = vals.map(v => ({
    terrain: v > threshold ? 'plains' : 'ocean',
    forest: false, bonus: null, rumor: false, village: null, colony: null,
    road: false, plowed: false, highSeas: false,
  }));
  const isLand = i => tiles[i].terrain !== 'ocean';
  const land = [];
  tiles.forEach((t, i) => { if (isLand(i)) land.push(i); });

  // Climate by latitude and moisture, then hills and mountains by elevation.
  const xy = i => [i % W, Math.floor(i / W)];
  const moist = rankOf(land.map(i => moistN(...xy(i)) + (rand() - 0.5) * 0.05));
  const elev = rankOf(land.map(i => elevN(...xy(i))));
  land.forEach((i, k) => {
    const [, y] = xy(i);
    const lat = Math.min(1, Math.abs(y / (H - 1) - 0.5) / 0.42);
    let terrain = climate(lat, moist[k]);
    if (terrain !== 'arctic') {
      if (elev[k] > 0.94) terrain = 'mountains';
      else if (elev[k] > 0.84) terrain = 'hills';
    }
    tiles[i].terrain = terrain;
  });

  const forestable = land.filter(i => TERRAIN[tiles[i].terrain].forest);
  const fr = rankOf(forestable.map(i => forestN(...xy(i)) + rand() * 0.04));
  forestable.forEach((i, k) => { tiles[i].forest = fr[k] > 0.48; });

  // Distance from land, used for high seas (where ships can sail to Europe).
  const dist = new Array(W * H).fill(Infinity);
  const queue = [];
  land.forEach(i => { dist[i] = 0; queue.push(i); });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const [x, y] = xy(i);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny);
      if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; queue.push(j); }
    }
  }
  tiles.forEach((t, i) => { if (!isLand(i) && dist[i] >= 3) t.highSeas = true; });

  // Resources.
  tiles.forEach((t, i) => {
    const r = rand();
    if (!isLand(i)) { if (dist[i] === 1 && r < 0.08) t.bonus = 'fish'; return; }
    if (t.forest) { if (r < 0.07) t.bonus = 'game'; return; }
    if (t.terrain === 'hills' && r < 0.14) t.bonus = 'ore';
    else if (t.terrain === 'mountains' && r < 0.14) t.bonus = 'silver';
    else if ((TERRAIN[t.terrain].prod.food || 0) >= 3 && r < 0.05) t.bonus = 'wheat';
  });

  // Starting point: open sea just off the east coast, somewhere in the temperate middle.
  const starts = [];
  for (let y = Math.floor(H * 0.3); y < H * 0.7; y++) {
    let ex = -1;
    for (let x = 0; x < W; x++) if (isLand(idx(x, y))) ex = x;
    if (ex < 0) continue;
    for (let x = ex + 3; x < W; x++) {
      if (tiles[idx(x, y)].highSeas) { starts.push({ x, y }); break; }
    }
  }
  const start = starts.length ? pick(rand, starts) : { x: W - 4, y: Math.floor(H / 2) };
  tiles[idx(start.x, start.y)].bonus = null;
  const farFromStart = (i, d) => {
    const [x, y] = xy(i);
    return Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) >= d;
  };

  // Native villages, each tribe owning the region around a random centre.
  const centers = TRIBES.slice(0, 6).map(name => ({ name, x: rand() * W * 0.7, y: rand() * H }));
  const shuffled = land.filter(i => !['arctic', 'mountains'].includes(tiles[i].terrain)).sort(() => rand() - 0.5);
  const villages = [];
  const target = Math.floor(land.length / 32);
  for (const i of shuffled) {
    if (villages.length >= target) break;
    if (!farFromStart(i, 6)) continue;
    const [x, y] = xy(i);
    if (villages.some(v => Math.max(Math.abs(v.x - x), Math.abs(v.y - y)) < 4)) continue;
    const coastal = DIRS8.some(([dx, dy]) => inMap(x + dx, y + dy) && !isLand(idx(x + dx, y + dy)));
    const tribe = centers.reduce((best, c) =>
      Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best).name;
    const v = { id: villages.length, x, y, tribe, skill: villageSkill(rand, tiles[i], coastal), taught: false, spoken: false };
    villages.push(v);
    tiles[i].village = v.id;
    tiles[i].bonus = null;
  }

  // Lost city rumours.
  let rumors = Math.floor(land.length / 38);
  for (const i of shuffled) {
    if (rumors <= 0) break;
    const t = tiles[i];
    if (t.village != null || !farFromStart(i, 3)) continue;
    const [x, y] = xy(i);
    if (villages.some(v => Math.max(Math.abs(v.x - x), Math.abs(v.y - y)) < 2)) continue;
    t.rumor = true;
    rumors--;
  }

  return { W, H, tiles, villages, start };
}
