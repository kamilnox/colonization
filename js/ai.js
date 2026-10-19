// The Royal Expeditionary Force: lands near your colonies after you declare independence.
import { S, tile, isWater, colonyAt, unitsAt, neighbors, notify, dist, rnd, playerColonies } from './state.js';
import { makeUnit, isNaval } from './units.js';
import { attackOdds } from './combat.js';
import { tryMove } from './movement.js';
import { findPath } from './path.js';

export function refSize(colonies) {
  return { regular: 3 + 2 * colonies, cavalry: 1 + colonies, artillery: 1 + Math.floor(colonies / 2) };
}

export const refRemaining = () => Object.values(S.ref.pool).reduce((s, n) => s + n, 0);
export const refOnMap = () => S.units.filter(u => u.owner === 'ref' && u.where === 'map');

function landingSpots(c) {
  const spots = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (x < 0 || y < 0 || x >= S.W || y >= S.H || (dx === 0 && dy === 0)) continue;
      const t = tile(x, y);
      if (isWater(t) || t.village != null || t.colony != null) continue;
      if (unitsAt(x, y).some(u => u.owner !== 'ref')) continue;
      spots.push([x, y]);
    }
  }
  return spots.sort(() => Math.random() - 0.5);
}

function landWave() {
  if (S.turn < S.ref.nextWave || !refRemaining()) return;
  const cols = playerColonies();
  if (!cols.length) return;
  const coastal = cols.filter(c => neighbors(c.x, c.y).some(([x, y]) => isWater(tile(x, y))));
  const target = (coastal.length ? coastal : cols)[rnd((coastal.length ? coastal : cols).length)];
  const spots = landingSpots(target);
  let n = Math.min(4 + rnd(2), refRemaining(), spots.length);
  const landed = n;
  while (n-- > 0) {
    const pool = S.ref.pool;
    const kinds = Object.keys(pool).filter(k => pool[k] > 0);
    const kind = kinds[rnd(kinds.length)];
    pool[kind]--;
    const [x, y] = spots[n];
    makeUnit(kind, { owner: 'ref', x, y }).moves = 0;
  }
  S.ref.nextWave = S.turn + 3;
  if (landed) {
    notify(`The King's army has landed ${landed} units near ${target.name}!`, { kind: 'bad', modal: true, title: 'Invasion' });
  }
}

const isPlayerTarget = (x, y) => {
  const c = colonyAt(x, y);
  return (c && c.owner === 'player') || unitsAt(x, y).some(u => u.owner === 'player' && !isNaval(u));
};

function act(u) {
  for (let guard = 0; guard < 8 && u.moves > 0 && S.units.includes(u); guard++) {
    const targets = neighbors(u.x, u.y).filter(([x, y]) => !isWater(tile(x, y)) && isPlayerTarget(x, y));
    if (targets.length) {
      const [x, y] = targets.reduce((best, t) => (attackOdds(u, ...t) > attackOdds(u, ...best) ? t : best));
      tryMove(u, x, y);
      return;
    }
    const goals = playerColonies().sort((a, b) => dist(a, u) - dist(b, u));
    if (!goals.length) return;
    const path = findPath(u, goals[0].x, goals[0].y);
    if (!path || !path.length) return;
    const r = tryMove(u, path[0][0], path[0][1]);
    if (!r.ok) return;
  }
}

export function refTurn() {
  if (!S.player.declared) return;
  landWave();
  for (const u of refOnMap()) {
    if (!S.units.includes(u)) continue;
    // Keep one unit as a garrison in each captured colony.
    const c = colonyAt(u.x, u.y);
    if (c && c.owner === 'ref' && refOnMap().filter(o => o.x === u.x && o.y === u.y).length === 1) continue;
    act(u);
  }
}
