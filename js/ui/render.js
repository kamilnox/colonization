// Draws the map on a canvas. Everything is procedural shapes plus emoji, no image assets.
import { TILE, TERRAIN, BONUS } from '../data.js';
import { S, tile, isWater, explored, inMap, unitPos } from '../state.js';
import { hash2 } from '../rng.js';
import { unitIcon, unitBadge, isNaval, isMilitary, cargoUnits } from '../units.js';
import { workers } from '../colony.js';
import { needsOrders } from '../game.js';
import { ui } from './ctx.js';

export const camera = { x: 0, y: 0, z: 1 };
export const insets = { top: 0, bottom: 0 };
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const OWNER_COLOR = { player: '#2f6fd6', ref: '#c0392b' };

let canvas, ctx, dpr = 1, vw = 0, vh = 0, queued = false;

export function initRenderer(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  vw = canvas.clientWidth;
  vh = canvas.clientHeight;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  glyphs.clear();
  requestDraw();
}

export function requestDraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    draw();
  });
}

// --- camera ---

export function screenToTile(sx, sy) {
  const r = canvas.getBoundingClientRect();
  const wx = (sx - r.left) / camera.z + camera.x;
  const wy = (sy - r.top) / camera.z + camera.y;
  return [Math.floor(wx / TILE), Math.floor(wy / TILE)];
}

export function clampCamera() {
  if (!S) return;
  const z = camera.z;
  const margin = 2 * TILE;
  camera.x = Math.min(Math.max(camera.x, -margin), S.W * TILE + margin - vw / z);
  camera.y = Math.min(Math.max(camera.y, -margin - insets.top / z), S.H * TILE + margin - (vh - insets.bottom) / z);
}

export function setZoom(z, sx = vw / 2, sy = vh / 2) {
  const nz = Math.min(2.5, Math.max(0.4, z));
  const wx = sx / camera.z + camera.x, wy = sy / camera.z + camera.y;
  camera.z = nz;
  camera.x = wx - sx / nz;
  camera.y = wy - sy / nz;
  clampCamera();
  requestDraw();
}

// Centre the visible area (between the top bar and bottom panel) on a tile.
export function centerOn(x, y, onlyIfHidden = false) {
  const z = camera.z;
  const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
  if (onlyIfHidden) {
    const sx = (cx - camera.x) * z, sy = (cy - camera.y) * z;
    const pad = TILE * z;
    if (sx > pad && sx < vw - pad && sy > insets.top + pad && sy < vh - insets.bottom - pad) return;
  }
  const midY = insets.top + (vh - insets.top - insets.bottom) / 2;
  camera.x = cx - vw / 2 / z;
  camera.y = cy - midY / z;
  clampCamera();
  requestDraw();
}

// --- helpers ---

const glyphs = new Map();
function glyph(ch, size) {
  size = Math.max(6, Math.round(size));
  const key = ch + '|' + size;
  let c = glyphs.get(key);
  if (!c) {
    if (glyphs.size > 800) glyphs.clear();
    c = document.createElement('canvas');
    const s = Math.ceil(size * 1.3);
    c.width = c.height = Math.ceil(s * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.font = `${size}px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, s / 2, s / 2 + size * 0.05);
    glyphs.set(key, c);
  }
  return c;
}

function drawGlyph(g, ch, cx, cy, size) {
  const c = glyph(ch, size);
  const s = c.width / dpr;
  g.drawImage(c, cx - s / 2, cy - s / 2, s, s);
}

const shades = new Map();
function shade(hex, k) {
  const key = hex + k;
  let v = shades.get(key);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    const f = 1 + (k - 1.5) * 0.035;
    const ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    v = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    shades.set(key, v);
  }
  return v;
}

const landAt = (x, y) => inMap(x, y) && !isWater(tile(x, y));
const nearLand = (x, y) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (landAt(x + dx, y + dy)) return true;
  return false;
};

function drawTree(g, x, y, s, kind) {
  if (kind === 'conifer') {
    g.fillStyle = '#23472a';
    g.beginPath();
    g.moveTo(x, y - s);
    g.lineTo(x + s * 0.6, y + s * 0.5);
    g.lineTo(x - s * 0.6, y + s * 0.5);
    g.closePath();
    g.fill();
  } else {
    g.fillStyle = kind === 'tropical' ? '#2a6a35' : '#355f27';
    g.beginPath();
    g.arc(x, y, s * 0.55, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(x - s * 0.15, y - s * 0.15, s * 0.25, 0, Math.PI * 2);
    g.fill();
  }
}

// Draws one terrain tile; also used by the colony screen.
export function drawTerrain(g, x, y, px, py, ts) {
  if (!explored(x, y)) {
    g.fillStyle = '#0b1016';
    g.fillRect(px, py, ts + 0.6, ts + 0.6);
    return;
  }
  const t = tile(x, y);
  const T = TERRAIN[t.terrain];
  const h = hash2(x, y);
  if (isWater(t)) {
    const base = t.highSeas ? '#1f4a72' : nearLand(x, y) ? '#3672a2' : '#2a5b86';
    g.fillStyle = shade(base, Math.floor(h * 4));
    g.fillRect(px, py, ts + 0.6, ts + 0.6);
    if (ts > 24) {
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = Math.max(1, ts * 0.03);
      const wx = px + ts * (0.2 + hash2(x, y, 1) * 0.5), wy = py + ts * (0.25 + hash2(x, y, 2) * 0.5);
      g.beginPath();
      g.arc(wx, wy, ts * 0.08, Math.PI * 1.1, Math.PI * 1.9);
      g.arc(wx + ts * 0.15, wy, ts * 0.08, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  } else {
    g.fillStyle = shade(T.color, Math.floor(h * 4));
    g.fillRect(px, py, ts + 0.6, ts + 0.6);
    // Sandy shore on edges that face the sea.
    g.fillStyle = 'rgba(236,220,160,0.55)';
    const e = Math.max(1, ts * 0.06);
    if (!landAt(x, y - 1) && inMap(x, y - 1)) g.fillRect(px, py, ts, e);
    if (!landAt(x, y + 1) && inMap(x, y + 1)) g.fillRect(px, py + ts - e, ts, e);
    if (!landAt(x - 1, y) && inMap(x - 1, y)) g.fillRect(px, py, e, ts);
    if (!landAt(x + 1, y) && inMap(x + 1, y)) g.fillRect(px + ts - e, py, e, ts);

    if (t.plowed && !t.forest) {
      g.strokeStyle = 'rgba(90,60,20,0.35)';
      g.lineWidth = Math.max(1, ts * 0.04);
      g.beginPath();
      for (let i = 1; i <= 3; i++) {
        g.moveTo(px + ts * 0.15, py + ts * (i * 0.25));
        g.lineTo(px + ts * 0.85, py + ts * (i * 0.25 - 0.1));
      }
      g.stroke();
    }
    if (t.terrain === 'hills') {
      g.fillStyle = 'rgba(70,52,25,0.45)';
      for (const [ox, oy, r] of [[0.32, 0.68, 0.24], [0.68, 0.58, 0.2]]) {
        g.beginPath();
        g.arc(px + ts * ox, py + ts * oy, ts * r, Math.PI, 0);
        g.fill();
      }
    } else if (t.terrain === 'mountains') {
      for (const [ox, w, hh] of [[0.33, 0.3, 0.55], [0.66, 0.26, 0.45]]) {
        const bx = px + ts * ox, by = py + ts * 0.82, top = by - ts * hh;
        g.fillStyle = '#5d554c';
        g.beginPath();
        g.moveTo(bx - ts * w, by);
        g.lineTo(bx, top);
        g.lineTo(bx + ts * w, by);
        g.fill();
        g.fillStyle = '#f3f3f0';
        g.beginPath();
        g.moveTo(bx - ts * w * 0.3, top + ts * hh * 0.3);
        g.lineTo(bx, top);
        g.lineTo(bx + ts * w * 0.3, top + ts * hh * 0.3);
        g.fill();
      }
    }
    if (t.forest) {
      const kind = ['tundra', 'grassland'].includes(t.terrain) ? 'conifer' : t.terrain === 'savanna' ? 'tropical' : 'broad';
      const s = ts * 0.2;
      for (let i = 0; i < 4; i++) {
        const ox = (i % 2 ? 0.68 : 0.3) + (hash2(x, y, 10 + i) - 0.5) * 0.14;
        const oy = (i < 2 ? 0.32 : 0.7) + (hash2(x, y, 20 + i) - 0.5) * 0.12;
        drawTree(g, px + ts * ox, py + ts * oy, s, kind);
      }
    }
  }
  if (t.bonus && ts > 20) drawGlyph(g, BONUS[t.bonus].icon, px + ts * 0.2, py + ts * 0.2, ts * 0.26);
}

function drawRoads(x0, y0, x1, y1, ox, oy, ts) {
  ctx.strokeStyle = 'rgba(110,78,40,0.9)';
  ctx.lineWidth = Math.max(1.5, ts * 0.07);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const isRoad = (x, y) => inMap(x, y) && explored(x, y) && (tile(x, y).road || tile(x, y).colony != null);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!isRoad(x, y)) continue;
      const cx = ox + (x + 0.5) * ts, cy = oy + (y + 0.5) * ts;
      let any = false;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        if (!isRoad(x + dx, y + dy)) continue;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * ts, cy + dy * ts);
        any = true;
      }
      if (!any && tile(x, y).colony == null) {
        ctx.moveTo(cx - ts * 0.2, cy);
        ctx.lineTo(cx + ts * 0.2, cy);
      }
    }
  }
  ctx.stroke();
}

function label(text, cx, y, size, bg) {
  ctx.font = `600 ${size}px -apple-system, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 0.8;
  const h = size * 1.35;
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - w / 2, y, w, h, h / 2);
  else ctx.rect(cx - w / 2, y, w, h);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + h / 2 + 0.5);
}

function drawUnit(u, cx, cy, ts, { small = false, count = 1, selected = false, ready = false } = {}) {
  const r = ts * (small ? 0.26 : 0.36);
  ctx.globalAlpha = u.owner === 'player' && u.moves <= 0 && !selected ? 0.6 : 1;
  ctx.fillStyle = OWNER_COLOR[u.owner] || '#777';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1, ts * 0.03);
  ctx.stroke();
  drawGlyph(ctx, unitIcon(u), cx, cy, r * 1.25);
  const badge = unitBadge(u);
  if (badge && ts > 28) drawGlyph(ctx, badge, cx + r * 0.85, cy - r * 0.8, r * 0.7);
  if (u.state === 'fortified' && ts > 28) drawGlyph(ctx, '🛡️', cx - r * 0.85, cy + r * 0.75, r * 0.6);
  if (u.work && ts > 28) drawGlyph(ctx, '🔧', cx - r * 0.85, cy + r * 0.75, r * 0.6);
  ctx.globalAlpha = 1;
  if (count > 1) {
    const bx = cx + r * 0.85, by = cy + r * 0.8, br = Math.max(6, r * 0.42);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(br * 1.25)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), bx, by + 0.5);
  }
  const passengers = isNaval(u) ? cargoUnits(u).length : 0;
  if (passengers && ts > 28) {
    label(`👥${passengers}`, cx, cy + r * 0.75, Math.max(9, Math.round(ts * 0.17)), 'rgba(0,0,0,0.75)');
  }
  // Green dot: this unit (or one in the stack) still needs orders this turn.
  if (ready) {
    ctx.fillStyle = '#4ade80';
    ctx.strokeStyle = '#0b2e17';
    ctx.lineWidth = Math.max(1, ts * 0.03);
    ctx.beginPath();
    ctx.arc(cx - r * 0.8, cy - r * 0.8, Math.max(3.5, r * 0.26), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (selected) {
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = Math.max(2.5, ts * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, r + ts * 0.07, 0, Math.PI * 2);
    ctx.stroke();
  }
}

const RING = { attack: '#ff5a4a', visit: '#ffd34d', explore: '#ffd34d', board: '#5ab0ff' };
const RING_ICON = { attack: '⚔️', visit: '💬', explore: '🔍', board: '⛵' };

// Bright tiles: where the selected unit can go this turn.
function drawReach(ox, oy, ts, visible) {
  if (!ui.reach) return;
  const pad = Math.max(1.5, ts * 0.05);
  for (const r of ui.reach.values()) {
    if (!visible(r.x, r.y) || RING[r.kind]) continue;
    const px = ox + r.x * ts, py = oy + r.y * ts;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(px + pad, py + pad, ts - 2 * pad, ts - 2 * pad);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, ts * 0.025);
    ctx.strokeRect(px + pad, py + pad, ts - 2 * pad, ts - 2 * pad);
  }
}

// Rings for things the selected unit can act on: attack, talk, explore, board.
function drawTargets(ox, oy, ts, visible) {
  if (!ui.reach) return;
  for (const r of ui.reach.values()) {
    if (!visible(r.x, r.y) || !RING[r.kind]) continue;
    const cx = ox + (r.x + 0.5) * ts, cy = oy + (r.y + 0.5) * ts;
    ctx.strokeStyle = RING[r.kind];
    ctx.lineWidth = Math.max(2.5, ts * 0.07);
    ctx.setLineDash([ts * 0.12, ts * 0.08]);
    ctx.beginPath();
    ctx.arc(cx, cy, ts * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (ts > 28) drawGlyph(ctx, RING_ICON[r.kind], cx + ts * 0.32, cy - ts * 0.32, ts * 0.26);
  }
}

function unitPriority(u, selId) {
  if (u.id === selId) return 100;
  if (u.owner !== 'player') return 50;
  if (isMilitary(u)) return 20;
  if (isNaval(u)) return 10;
  return u.moves > 0 ? 5 : 1;
}

function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05080c';
  ctx.fillRect(0, 0, vw, vh);
  if (!S) return;
  const z = camera.z, ts = TILE * z;
  const ox = -camera.x * z, oy = -camera.y * z;
  const x0 = Math.max(0, Math.floor(camera.x / TILE));
  const y0 = Math.max(0, Math.floor(camera.y / TILE));
  const x1 = Math.min(S.W - 1, Math.floor((camera.x + vw / z) / TILE));
  const y1 = Math.min(S.H - 1, Math.floor((camera.y + vh / z) / TILE));

  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) drawTerrain(ctx, x, y, ox + x * ts, oy + y * ts, ts);
  drawRoads(x0, y0, x1, y1, ox, oy, ts);

  if (ts >= 40) {
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) { ctx.moveTo(ox + x * ts, oy + y0 * ts); ctx.lineTo(ox + x * ts, oy + (y1 + 1) * ts); }
    for (let y = y0; y <= y1 + 1; y++) { ctx.moveTo(ox + x0 * ts, oy + y * ts); ctx.lineTo(ox + (x1 + 1) * ts, oy + y * ts); }
    ctx.stroke();
  }

  const visible = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && explored(x, y);

  // Rumours and villages.
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!explored(x, y)) continue;
      const t = tile(x, y);
      const cx = ox + (x + 0.5) * ts, cy = oy + (y + 0.5) * ts;
      if (t.rumor) {
        ctx.fillStyle = '#f4d35e';
        ctx.strokeStyle = '#5b4510';
        ctx.lineWidth = Math.max(1, ts * 0.03);
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#5b4510';
        ctx.font = `800 ${Math.round(ts * 0.24)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', cx, cy + 1);
      }
      if (t.village != null) {
        drawGlyph(ctx, '🛖', cx, cy - ts * 0.04, ts * 0.6);
        if (ts >= 44) label(S.villages[t.village].tribe, cx, oy + (y + 0.78) * ts, Math.round(ts * 0.17), 'rgba(110,70,30,0.85)');
      }
    }
  }

  drawReach(ox, oy, ts, visible);

  // Colonies.
  for (const c of S.colonies) {
    if (!visible(c.x, c.y)) continue;
    const cx = ox + (c.x + 0.5) * ts, cy = oy + (c.y + 0.5) * ts;
    drawGlyph(ctx, c.owner === 'player' ? '🏘️' : '🏚️', cx, cy - ts * 0.06, ts * 0.72);
    const size = Math.max(9, Math.round(ts * 0.2));
    label(`${c.name} 👥${workers(c).length}`, cx, oy + (c.y + 0.8) * ts, size, c.owner === 'player' ? 'rgba(30,70,150,0.92)' : 'rgba(170,40,30,0.92)');
  }

  // Units, one stack per tile.
  const stacks = new Map();
  for (const u of S.units) {
    if (u.where !== 'map' || !visible(u.x, u.y)) continue;
    const k = u.y * S.W + u.x;
    if (!stacks.has(k)) stacks.set(k, []);
    stacks.get(k).push(u);
  }
  for (const list of stacks.values()) {
    const top = list.reduce((a, b) => (unitPriority(b, ui.selected) > unitPriority(a, ui.selected) ? b : a));
    const inColony = tile(top.x, top.y).colony != null;
    const cx = ox + (top.x + 0.5) * ts, cy = oy + (top.y + 0.5) * ts;
    const ready = list.some(u => needsOrders(u) || (isNaval(u) && cargoUnits(u).some(p => needsOrders(p))));
    const opts = { count: list.length, selected: top.id === ui.selected, ready };
    if (inColony) drawUnit(top, cx + ts * 0.3, cy - ts * 0.28, ts, { ...opts, small: true });
    else drawUnit(top, cx, cy, ts, opts);
  }
  drawTargets(ox, oy, ts, visible);

  // Selected unit that is not drawn on its own (aboard a ship or behind another unit).
  const sel = ui.selected != null && S.units.find(u => u.id === ui.selected);
  if (sel) {
    const p = unitPos(sel);
    if (p) {
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = Math.max(2, ts * 0.05);
      ctx.strokeRect(ox + p.x * ts + 2, oy + p.y * ts + 2, ts - 4, ts - 4);
    }
    const path = ui.preview ? ui.preview.path : sel.path;
    if (path && path.length) drawPath(path, ox, oy, ts, ui.preview ? ui.preview.turns : null);
  }
  if (ui.info && !ui.preview) {
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + ui.info.x * ts + 2, oy + ui.info.y * ts + 2, ts - 4, ts - 4);
    ctx.setLineDash([]);
  }
}

function drawPath(path, ox, oy, ts, turns) {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  path.forEach(([x, y], i) => {
    const cx = ox + (x + 0.5) * ts, cy = oy + (y + 0.5) * ts;
    const last = i === path.length - 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ts * (last ? 0.13 : 0.07), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (last && turns != null) label(turns === 0 ? 'now' : `${turns}t`, cx, cy - ts * 0.45, Math.max(10, Math.round(ts * 0.22)), 'rgba(0,0,0,0.75)');
  });
}

