// Map interaction: selecting units, moving them, and the bottom panel with their orders.
import { TERRAIN, BONUS, SKILLS, iconOf } from '../data.js';
import {
  S, tile, unitsAt, colonyAt, unitPos, inMap, explored, dist, isWater, unitById, neighbors,
} from '../state.js';
import { ui, refresh, openScreen, esc } from './ctx.js';
import { centerOn } from './render.js';
import { toast, modal, choose } from './dialogs.js';
import { tryMove, workOptions, startWork, enemyAt, runPath, pathCost } from '../movement.js';
import { findPath, pathTurns } from '../path.js';
import { canFound, foundColony, joinColony, tileYield, tileGoods } from '../colony.js';
import {
  unitName, unitIcon, unitBadge, isNaval, isPerson, isMilitary, cargoUnits, movesLabel, freeSlots,
} from '../units.js';
import { nextUnit, endTurn, needsOrders } from '../game.js';
import { sailToEurope } from '../europe.js';
import { attackOdds } from '../combat.js';
import { saveSoon, saveGame } from '../save.js';

export const selectedUnit = () => (ui.selected != null ? unitById(ui.selected) : null);

export function selectUnit(u, center = true) {
  ui.selected = u ? u.id : null;
  ui.preview = null;
  ui.info = null;
  if (u && center) {
    const p = unitPos(u);
    if (p) centerOn(p.x, p.y, true);
  }
  refresh();
}

// After an action: keep the unit selected while it can still act, otherwise move on.
function afterAction(u, keep = false) {
  saveSoon();
  const alive = u && S.units.includes(u);
  if (alive && (u.moves > 0 || keep) && (u.where === 'map' || u.where === 'ship') && !u.work && u.state === 'active') {
    refresh();
    return;
  }
  selectUnit(nextUnit(alive ? u : null));
}

export function selectNext() {
  const u = selectedUnit();
  if (u && needsOrders(u)) u.waited = true;
  selectUnit(nextUnit(u));
  if (!selectedUnit()) toast('No more units waiting for orders.');
}

export function doEndTurn() {
  ui.preview = null;
  ui.info = null;
  endTurn();
  saveGame();
  selectUnit(nextUnit());
}

function pickUnit(x, y) {
  const list = [];
  for (const u of unitsAt(x, y).filter(u => u.owner === 'player')) {
    list.push(u);
    if (isNaval(u)) list.push(...cargoUnits(u));
  }
  const c = colonyAt(x, y);
  const items = list.map(u => ({
    value: String(u.id), icon: unitIcon(u), label: unitName(u),
    sub: u.where === 'ship' ? 'aboard ship' : u.work ? 'working' : u.state !== 'active' ? u.state : `moves ${movesLabel(u)}`,
  }));
  if (c && c.owner === 'player') items.unshift({ value: 'colony', icon: '🏘️', label: `Open ${c.name}` });
  choose('Select', items).then(v => {
    if (v === 'colony') openScreen('colony', { colonyId: c.id, colonySel: null });
    else if (v) selectUnit(unitById(Number(v)), false);
  });
}

export function onTap(x, y) {
  if (!S || !inMap(x, y)) return;
  const sel = selectedUnit();
  const own = unitsAt(x, y).filter(u => u.owner === 'player');
  const c = colonyAt(x, y);
  const ownColony = c && c.owner === 'player';

  if (ui.preview && ui.preview.x === x && ui.preview.y === y && sel) return go();
  ui.preview = null;
  ui.info = null;

  if (sel && !S.over) {
    const pos = unitPos(sel);
    if (!pos) { selectUnit(null); return; }
    if (pos.x === x && pos.y === y) {
      const count = own.length + own.reduce((s, u) => s + (isNaval(u) ? cargoUnits(u).length : 0), 0);
      if (count > 1 || ownColony) return pickUnit(x, y);
      ui.info = { x, y };
      refresh();
      return;
    }
    if (dist(pos, { x, y }) === 1) return moveSelected(sel, x, y);
    if (own.length && !ownColony) {
      if (own.length > 1) return pickUnit(x, y);
      return selectUnit(own[0], false);
    }
    const path = explored(x, y) ? findPath(sel, x, y) : null;
    if (path) ui.preview = { x, y, path, turns: pathTurns(sel, path) };
    else ui.info = { x, y };
    refresh();
    return;
  }
  if (ownColony) return openScreen('colony', { colonyId: c.id, colonySel: null });
  if (own.length > 1 || (own.length === 1 && isNaval(own[0]) && cargoUnits(own[0]).length)) return pickUnit(x, y);
  if (own.length === 1) return selectUnit(own[0], false);
  ui.info = { x, y };
  refresh();
}

async function moveSelected(u, x, y) {
  const c = colonyAt(x, y);
  const hostile = enemyAt(u, x, y) || (c && c.owner !== u.owner);
  if (hostile && !isNaval(u) && u.where === 'map' && !isWater(tile(x, y)) && enemyAt(u, x, y)) {
    const odds = Math.round(attackOdds(u, x, y) * 100);
    const yes = await modal({
      title: 'Attack?', text: `${unitName(u)} attacks. Chance of victory: ${odds}%.`,
      buttons: [{ label: 'Cancel', value: false }, { label: 'Attack', value: true, primary: true }],
    });
    if (!yes) return;
  }
  const wasAboard = u.where === 'ship';
  const r = tryMove(u, x, y);
  if (!r.ok) {
    toast(r.msg, 'bad');
    return;
  }
  // Just went ashore: stay selected so the unit can found a colony straight away.
  afterAction(u, wasAboard && u.where === 'map' && canFound(u));
}

function go() {
  const u = selectedUnit();
  if (!u || !ui.preview) return;
  u.path = ui.preview.path;
  ui.preview = null;
  runPath(u);
  afterAction(u);
}

// Route a ship to the nearest high seas tile and sail on arrival.
function toEurope(ship) {
  const start = unitPos(ship);
  const seen = new Set([start.y * S.W + start.x]);
  const queue = [[start.x, start.y]];
  let goal = null;
  for (let i = 0; i < queue.length && !goal; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of neighbors(x, y)) {
      const k = ny * S.W + nx;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!Number.isFinite(pathCost(ship, x, y, nx, ny, false))) continue;
      if (tile(nx, ny).highSeas) { goal = [nx, ny]; break; }
      queue.push([nx, ny]);
    }
  }
  const path = goal && findPath(ship, ...goal);
  if (!path) { toast('No route to the high seas found.', 'bad'); return; }
  ship.path = path;
  ship.goEurope = true;
  runPath(ship);
  afterAction(ship);
}

// --- bottom panel ---

function tileText(x, y) {
  if (!explored(x, y)) return { title: 'Unexplored', lines: ['Nobody knows what lies here.'] };
  const t = tile(x, y);
  const T = TERRAIN[t.terrain];
  const title = t.forest && T.forest ? T.forest.name : T.name;
  const yields = tileGoods(t).filter(g => tileYield(t, g) > 0).map(g => `${iconOf(g)}${tileYield(t, g)}`).join(' ');
  const lines = [];
  if (yields) lines.push(`Yields: ${yields}`);
  const extras = [];
  if (t.bonus) extras.push(`${BONUS[t.bonus].icon} ${BONUS[t.bonus].name}`);
  if (t.highSeas) extras.push('High seas: ships can sail to Europe from here');
  if (t.road) extras.push('Road');
  if (t.plowed) extras.push('Plowed');
  if (t.rumor) extras.push('❓ Rumours of a lost city');
  if (extras.length) lines.push(extras.join(' · '));
  if (t.village != null) {
    const v = S.villages[t.village];
    lines.push(`🛖 ${v.tribe} village. Teaches: ${SKILLS[v.skill].name}${v.taught ? ' (already taught)' : ''}`);
  }
  const c = colonyAt(x, y);
  if (c) lines.push(`🏘️ ${c.name}${c.owner === 'player' ? '' : ' (held by the King)'}`);
  return { title, lines };
}

function actionsFor(u) {
  const a = [];
  const t = u.where === 'map' ? tile(u.x, u.y) : null;
  const c = t && colonyAt(u.x, u.y);
  if (u.where === 'ship') {
    a.push({ act: 'select-carrier', label: 'Select ship', icon: unitIcon(unitById(u.carrier)) });
    return a;
  }
  if (u.work) {
    a.push({ act: 'cancel-work', label: 'Stop working', icon: '✋' });
    return a;
  }
  if (isNaval(u)) {
    if (c && c.owner === 'player') a.push({ act: 'colony', label: c.name, icon: '🏘️', primary: true });
    if (!S.player.declared && t) {
      if (t.highSeas) a.push({ act: 'sail', label: 'Sail to Europe', icon: '⚓', primary: true });
      else a.push({ act: 'to-europe', label: 'To Europe', icon: '🧭' });
    }
  } else {
    if (canFound(u)) a.push({ act: 'found', label: 'Found colony', icon: '🏠', primary: true });
    if (c && c.owner === 'player' && isPerson(u)) {
      a.push({ act: 'join', label: 'Join colony', icon: '➕', primary: true });
      a.push({ act: 'colony', label: c.name, icon: '🏘️' });
    }
    for (const w of workOptions(u)) a.push({ act: 'work', arg: w.kind, label: `${w.label} (${w.turns}t)`, icon: w.icon });
  }
  if (u.state !== 'active') a.push({ act: 'wake', label: 'Wake up', icon: '⏰' });
  else if (isMilitary(u)) a.push({ act: 'fortify', label: 'Fortify', icon: '🛡️' });
  else a.push({ act: 'sentry', label: 'Sleep', icon: '💤' });
  if (u.path) a.push({ act: 'cancel-path', label: 'Cancel route', icon: '✋' });
  return a;
}

function statusOf(u) {
  if (u.where === 'ship') return `Aboard the ${unitName(unitById(u.carrier))}. Tap a land tile next to the ship to go ashore.`;
  if (u.work) return `Working: ${u.work.kind === 'clear' ? 'clearing forest' : u.work.kind === 'plow' ? 'plowing' : 'building a road'}, ${u.work.turns} turn(s) left.`;
  if (u.state === 'fortified') return 'Fortified (+50% defence).';
  if (u.state === 'sentry') return 'Sleeping.';
  if (u.path) return 'Following a route.';
  if (u.role === 'pioneer') return `Carries ${u.tools} tools.`;
  return '';
}

function cargoHtml(u) {
  if (!isNaval(u)) return '';
  const chips = cargoUnits(u).map(c =>
    `<button class="chip" data-act="select" data-arg="${c.id}">${unitIcon(c)}<small>${esc(unitName(c))}</small></button>`);
  for (const [g, n] of Object.entries(u.goods)) chips.push(`<span class="chip">${iconOf(g)}<small>${n}</small></span>`);
  const free = freeSlots(u);
  for (let i = 0; i < free; i++) chips.push('<span class="chip empty">·</span>');
  return `<div class="cargo">${chips.join('')}</div>`;
}

export function renderPanel() {
  const el = document.getElementById('panel');
  if (!S) { el.innerHTML = ''; return; }
  let u = selectedUnit();
  if (u && (!['map', 'ship'].includes(u.where) || !unitPos(u))) {
    // The unit died, sailed off to Europe or joined a colony.
    ui.selected = null;
    ui.preview = null;
    u = null;
  }
  let body = '';
  if (S.over) {
    body = `<div class="pnl-msg"><b>${S.over === 'won' ? '🎉 Independence won!' : '💀 The rebellion has failed.'}</b><br>Start a new game from the ☰ menu.</div>`;
  } else if (u && ui.preview) {
    const info = tileText(ui.preview.x, ui.preview.y);
    const turns = ui.preview.turns;
    const c = colonyAt(ui.preview.x, ui.preview.y);
    body = `
      <div class="pnl-head"><div class="pnl-icon">${unitIcon(u)}</div>
        <div class="pnl-title"><b>Move to ${esc(info.title)}</b><span>${turns === 0 ? 'Arrives this turn' : `Arrives in ${turns} turn${turns > 1 ? 's' : ''}`}. Tap the tile again to go.</span></div></div>
      <div class="actions">
        <button class="btn primary" data-act="go">▶ Go</button>
        <button class="btn" data-act="cancel-preview">Cancel</button>
        ${c && c.owner === 'player' ? `<button class="btn" data-act="open-colony" data-arg="${c.id}">🏘️ ${esc(c.name)}</button>` : ''}
      </div>`;
  } else if (u) {
    const pos = unitPos(u);
    const where = pos ? tileText(pos.x, pos.y).title : '';
    const status = statusOf(u);
    body = `
      <div class="pnl-head">
        <div class="pnl-icon">${unitIcon(u)}${unitBadge(u) ? `<i>${unitBadge(u)}</i>` : ''}</div>
        <div class="pnl-title"><b>${esc(unitName(u))}</b><span>Moves ${movesLabel(u)} · ${esc(where)}</span></div>
        <button class="icon-btn" data-act="deselect" aria-label="Close">✕</button>
      </div>
      ${status ? `<div class="pnl-status">${esc(status)}</div>` : ''}
      ${cargoHtml(u)}
      <div class="actions">${actionsFor(u).map(b =>
        `<button class="btn ${b.primary ? 'primary' : ''}" data-act="${b.act}" data-arg="${b.arg || ''}">${b.icon} ${esc(b.label)}</button>`).join('')}</div>`;
  } else if (ui.info) {
    const info = tileText(ui.info.x, ui.info.y);
    body = `
      <div class="pnl-head"><div class="pnl-title"><b>${esc(info.title)}</b>${info.lines.map(l => `<span>${esc(l)}</span>`).join('')}</div>
      <button class="icon-btn" data-act="deselect" aria-label="Close">✕</button></div>`;
  } else {
    const waiting = S.units.some(x => needsOrders(x, true));
    body = `<div class="pnl-msg">${waiting ? 'Tap a unit to give it orders, or use Next.' : 'All units have their orders. End the turn when ready.'}</div>`;
  }
  const waiting = S.units.some(x => needsOrders(x, true));
  el.innerHTML = `${body}
    <div class="pnl-foot">
      <button class="btn" data-act="next" ${waiting ? '' : 'disabled'}>⏭ Next unit</button>
      <button class="btn ${waiting ? '' : 'primary pulse'}" data-act="end" ${S.over ? 'disabled' : ''}>End turn ⏩</button>
    </div>`;
}

export function initPanel() {
  document.getElementById('panel').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const u = selectedUnit();
    const arg = b.dataset.arg;
    switch (b.dataset.act) {
      case 'next': return selectNext();
      case 'end': return doEndTurn();
      case 'deselect': ui.info = null; return selectUnit(null);
      case 'go': return go();
      case 'cancel-preview': ui.preview = null; return refresh();
      case 'open-colony': ui.preview = null; return openScreen('colony', { colonyId: Number(arg), colonySel: null });
      case 'select': return selectUnit(unitById(Number(arg)), false);
    }
    if (!u) return;
    switch (b.dataset.act) {
      case 'select-carrier': return selectUnit(unitById(u.carrier), false);
      case 'found': {
        const c = foundColony(u);
        afterAction(u);
        return openScreen('colony', { colonyId: c.id, colonySel: null });
      }
      case 'join': {
        const c = colonyAt(u.x, u.y);
        joinColony(u, c);
        afterAction(u);
        return;
      }
      case 'colony': {
        const p = unitPos(u);
        return openScreen('colony', { colonyId: colonyAt(p.x, p.y).id, colonySel: null });
      }
      case 'work': startWork(u, arg); return afterAction(u);
      case 'cancel-work': u.work = null; return refresh();
      case 'fortify': u.state = 'fortified'; return afterAction(u);
      case 'sentry': u.state = 'sentry'; return afterAction(u);
      case 'wake': u.state = 'active'; return refresh();
      case 'cancel-path': u.path = null; u.goEurope = false; return refresh();
      case 'sail': sailToEurope(u); toast(`${unitName(u)} sets sail for Europe.`); return afterAction(u);
      case 'to-europe': return toEurope(u);
    }
  });
}
