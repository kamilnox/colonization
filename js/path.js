// A* route finding on the 8-connected tile grid.
import { S, unitPos } from './state.js';
import { pathCost } from './movement.js';
import { maxMoves } from './units.js';
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
