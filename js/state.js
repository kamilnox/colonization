// The current game state and small helpers shared by all rule modules.
import { TERRAIN } from './data.js';
import { DIRS8 } from './mapgen.js';

export let S = null;
export function setState(state) { S = state; }

// The UI plugs in here to show messages coming from the rules.
export const hooks = {
  message: (text, opts) => {},
};

// kind: 'info' | 'good' | 'bad'. modal: show as a dialog instead of a toast.
export function notify(text, { kind = 'info', modal = false, title = '' } = {}) {
  S.log.push({ turn: S.turn, text });
  if (S.log.length > 200) S.log.splice(0, S.log.length - 200);
  hooks.message(text, { kind, modal, title });
}

export const rnd = n => Math.floor(Math.random() * n);
export const chance = p => Math.random() < p;
export const between = (a, b) => a + rnd(b - a + 1);

export const inMap = (x, y) => x >= 0 && y >= 0 && x < S.W && y < S.H;
export const tile = (x, y) => S.tiles[y * S.W + x];
export const isWater = t => !!TERRAIN[t.terrain].water;
export const explored = (x, y) => S.explored[y * S.W + x] === 1;
export const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function neighbors(x, y) {
  const out = [];
  for (const [dx, dy] of DIRS8) if (inMap(x + dx, y + dy)) out.push([x + dx, y + dy]);
  return out;
}

export function reveal(x, y, r) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (inMap(x + dx, y + dy)) S.explored[(y + dy) * S.W + x + dx] = 1;
    }
  }
}

export const unitById = id => S.units.find(u => u.id === id) || null;
export const colonyById = id => S.colonies.find(c => c.id === id) || null;

export function colonyAt(x, y) {
  const t = tile(x, y);
  return t.colony != null ? colonyById(t.colony) : null;
}

export const unitsAt = (x, y) => S.units.filter(u => u.where === 'map' && u.x === x && u.y === y);

// Map position of a unit, also for units carried by ships or working in colonies.
export function unitPos(u) {
  if (u.where === 'ship') {
    const ship = unitById(u.carrier);
    return ship ? unitPos(ship) : null;
  }
  if (u.where === 'colony') {
    const c = colonyById(u.colony);
    return c ? { x: c.x, y: c.y } : null;
  }
  if (u.where === 'map') return { x: u.x, y: u.y };
  return null;
}

export function isCoastal(x, y) {
  return neighbors(x, y).some(([nx, ny]) => isWater(tile(nx, ny)));
}

export const playerColonies = () => S.colonies.filter(c => c.owner === 'player');

export function yearOf(turn) {
  if (turn < 108) return { year: 1492 + turn, season: '' };
  const k = turn - 108;
  return { year: 1600 + Math.floor(k / 2), season: k % 2 ? 'Autumn' : 'Spring' };
}

export function dateLabel(turn = S.turn) {
  const { year, season } = yearOf(turn);
  return season ? `${season} ${year}` : `${year}`;
}
