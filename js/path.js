// A* route finding on the 8-connected tile grid.
import { S, unitPos, inMap, tile, isWater, explored, colonyAt, unitsAt } from './state.js';
import { pathCost, moveCost, enemyAt } from './movement.js';
import { maxMoves, isNaval, isPerson, freeSlots } from './units.js';
import { attackStrength } from './combat.js';
import { DIRS8 } from './mapgen.js';

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// Returns a list of [x, y] steps (start excluded), or null when there is no route.
export function findPath(u, tx, ty) {
  const start = unitPos(u);
  if (!start || (start.x === tx && start.y === ty)) return null;
  const W = S.W, N = S.W * S.H;
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const s = start.y * W + start.x, goal = ty * W + tx;
  g[s] = 0;
  const heap = new Heap();
  heap.push([0, s]);
  while (heap.size) {
    const [, i] = heap.pop();
    if (i === goal) break;
    if (closed[i]) continue;
    closed[i] = 1;
    const x = i % W, y = (i - x) / W;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= S.H) continue;
      const j = ny * W + nx;
      if (closed[j]) continue;
      const c = pathCost(u, x, y, nx, ny, j === goal);
      if (!Number.isFinite(c)) continue;
      const ng = g[i] + c;
      if (ng < g[j]) {
        g[j] = ng;
        came[j] = i;
        heap.push([ng + Math.max(Math.abs(tx - nx), Math.abs(ty - ny)), j]);
      }
    }
  }
  if (!Number.isFinite(g[goal])) return null;
  const path = [];
  for (let i = goal; i !== s; i = came[i]) path.push([i % W, Math.floor(i / W)]);
  return path.reverse();
}

// Number of extra turns a route needs (0 = arrives this turn).
export function pathTurns(u, path) {
  const max = maxMoves(u);
  let left = u.moves, turns = 0;
  let prev = unitPos(u);
  for (const [x, y] of path) {
    const c = Math.min(pathCost(u, prev.x, prev.y, x, y, true), max);
    if (left < c && left < max) { turns++; left = max; }
    left = Math.max(0, left - c);
    prev = { x, y };
  }
  return turns;
}

// What stepping from (fx, fy) onto (x, y) would mean for this unit, or null if it can't.
// 'move' and 'enter' (own colony) let the unit continue; the others end its move.
function stepKind(u, x, y, fromStart) {
  if (!explored(x, y)) return null;
  const t = tile(x, y);
  const c = colonyAt(x, y);
  const enemy = enemyAt(u, x, y);
  if (enemy || (c && c.owner !== u.owner)) {
    if (!fromStart || isNaval(u) || u.where !== 'map' || isWater(t)) return null;
    return !enemy || attackStrength(u) > 0 ? 'attack' : null;
  }
  if (isNaval(u)) {
    if (c) return 'enter';
    return isWater(t) ? 'move' : null;
  }
  if (isWater(t)) {
    if (!fromStart || u.where !== 'map') return null;
    return unitsAt(x, y).some(s => s.owner === u.owner && isNaval(s) && freeSlots(s) > 0) ? 'board' : null;
  }
  if (t.village != null) return isPerson(u) && (u.role === 'scout' || u.role === 'none') ? 'visit' : null;
  if (c) return 'enter';
  if (t.rumor) return 'explore';
  return 'move';
}

// Everything the unit can reach or act on with the moves it has left this turn.
// Map of tile index -> { x, y, kind, prev }, where prev is the tile it is reached from.
export function reachable(u) {
  const out = new Map();
  const start = unitPos(u);
  if (!start || u.owner !== 'player' || u.moves <= 0 || u.work) return out;
  if (u.where !== 'map' && u.where !== 'ship') return out;
  const W = S.W, max = maxMoves(u);
  const s = start.y * W + start.x;
  const left = new Map([[s, u.moves]]);
  const open = [s];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (left.get(open[k]) > left.get(open[bi])) bi = k;
    const i = open.splice(bi, 1)[0];
    const x = i % W, y = (i - x) / W, have = left.get(i);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const j = ny * W + nx;
      if (j === s) continue;
      const kind = stepKind(u, nx, ny, i === s);
      if (!kind) continue;
      if (kind === 'attack' || kind === 'board' || kind === 'visit') {
        if (!out.has(j)) out.set(j, { x: nx, y: ny, kind, prev: i });
        continue;
      }
      const cost = moveCost(u, x, y, nx, ny);
      if (have < cost && have < max) continue;
      const rest = Math.max(0, have - cost);
      if (left.has(j) && left.get(j) >= rest) continue;
      left.set(j, rest);
      out.set(j, { x: nx, y: ny, kind, prev: i });
      if (rest > 0 && kind !== 'explore') open.push(j);
    }
  }
  return out;
}

// Steps from the unit to a tile found by reachable().
export function routeTo(reach, x, y) {
  const path = [];
  for (let k = y * S.W + x; reach.has(k); k = reach.get(k).prev) {
    const r = reach.get(k);
    path.push([r.x, r.y]);
  }
  return path.reverse();
}
