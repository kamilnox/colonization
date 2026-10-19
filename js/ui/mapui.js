// Map interaction: who is selected, where it can go, and the bottom panel with its orders.
import { TERRAIN, BONUS, SKILLS, iconOf } from '../data.js';
import { S, hooks, tile, unitsAt, colonyAt, unitPos, inMap, explored, unitById, neighbors, dateLabel, isCoastal } from '../state.js';
import { ui, refresh, openScreen, esc } from './ctx.js';
import { centerOn } from './render.js';
import { toast, modal, choose, confirm } from './dialogs.js';
import { tryMove, workOptions, startWork, runPath, pathCost, enemyAt } from '../movement.js';
import { findPath, pathTurns, reachable, routeTo } from '../path.js';
import { canFound, foundColony, joinColony, tileYield, tileGoods } from '../colony.js';
import { unitName, unitIcon, unitBadge, isNaval, isPerson, isMilitary, hasHold, cargoUnits, freeSlots } from '../units.js';
import { nextUnit, endTurn, needsOrders, waitingUnits } from '../game.js';
import { sailToEurope } from '../europe.js';
import { attackOdds } from '../combat.js';
import { saveSoon, saveGame } from '../save.js';
import { whereText, stateText, terrainName, jobText } from './describe.js';

export const selectedUnit = () => (ui.selected != null ? unitById(ui.selected) : null);

const badgeHtml = u => (unitBadge(u) ? `<i>${unitBadge(u)}</i>` : '');

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

// After an action: keep the unit while it can still act, otherwise hand over to the next one.
function afterAction(u, keep = false) {
  saveSoon();
  const alive = u && S.units.includes(u);
  if (alive && (keep || needsOrders(u))) {
    refresh();
    return;
  }
  selectUnit(nextUnit(alive ? u : null));
}

// Ends the turn and shows everything that happened in one report.
export function doEndTurn() {
  ui.preview = null;
  ui.info = null;
  const events = [];
  const show = hooks.message;
  hooks.message = (text, opts) => events.push({ text, ...opts });
  try {
    endTurn();
  } finally {
    hooks.message = show;
  }
  saveGame();
  selectUnit(nextUnit());
  if (events.length) {
    const mark = { good: '✅', bad: '⚠️', info: '•' };
    modal({
      title: `${dateLabel()}`,
      html: `<div class="report">${events.map(e => `
        <p class="${e.kind}${e.modal ? ' big' : ''}"><span>${mark[e.kind] || '•'}</span>
        <span>${e.title ? `<b>${esc(e.title)}.</b> ` : ''}${esc(e.text)}</span></p>`).join('')}</div>`,
      buttons: [{ label: 'Continue', value: true, primary: true }],
    });
  }
}

function stackAt(x, y) {
  const list = [];
  for (const u of unitsAt(x, y).filter(k => k.owner === 'player')) {
    list.push(u);
    if (isNaval(u)) list.push(...cargoUnits(u));
  }
  return list;
}

function pickUnit(x, y) {
  const c = colonyAt(x, y);
  const items = stackAt(x, y).map(u => ({
    value: String(u.id), icon: unitIcon(u), label: unitName(u),
    sub: [whereText(u), stateText(u)].filter(Boolean).join(' · '),
  }));
  if (c && c.owner === 'player') items.unshift({ value: 'colony', icon: '🏘️', label: `Open ${c.name}`, sub: 'Manage the colony and its workers' });
  choose('Who?', items).then(v => {
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
    if (pos && pos.x === x && pos.y === y) {
      if (stackAt(x, y).length > 1 || ownColony) return pickUnit(x, y);
      ui.info = { x, y };
      return refresh();
    }
    const r = ui.reach && ui.reach.get(y * S.W + x);
    // Tapping another of your units selects it, unless the selected unit is boarding it or entering a colony.
    const otherHere = own.length > 0 && !ownColony && !(r && r.kind === 'board');
    if (r && !otherHere) return act(sel, r);
    if (otherHere) return own.length > 1 || stackAt(x, y).length > 1 ? pickUnit(x, y) : selectUnit(own[0], false);
    if (ownColony) return openScreen('colony', { colonyId: c.id, colonySel: null });
    const path = explored(x, y) ? findPath(sel, x, y) : null;
    if (path) ui.preview = { x, y, path, turns: pathTurns(sel, path) };
    else ui.info = { x, y };
    return refresh();
  }
  if (ownColony) return openScreen('colony', { colonyId: c.id, colonySel: null });
  if (stackAt(x, y).length > 1) return pickUnit(x, y);
  if (own.length === 1) return selectUnit(own[0], false);
  ui.info = { x, y };
  refresh();
}

// Carry out a tap on a bright tile.
async function act(u, r) {
  if (r.kind === 'attack' && enemyAt(u, r.x, r.y)) {
    const odds = Math.round(attackOdds(u, r.x, r.y) * 100);
    const yes = await modal({
      title: 'Attack?', text: `${unitName(u)} attacks. Chance of victory: ${odds}%.`,
      buttons: [{ label: 'Cancel', value: false }, { label: 'Attack', value: true, primary: true }],
    });
    if (!yes) return;
  }
  const wasAboard = u.where === 'ship';
  const pos = unitPos(u);
  if (Math.max(Math.abs(r.x - pos.x), Math.abs(r.y - pos.y)) === 1) {
    const res = tryMove(u, r.x, r.y);
    if (!res.ok) { toast(res.msg, 'bad'); return; }
  } else {
    u.path = routeTo(ui.reach, r.x, r.y);
    runPath(u);
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

async function foundHere(u) {
  if (!isCoastal(u.x, u.y)) {
    const yes = await confirm('Found an inland colony?',
      'This spot is not next to the sea, so ships will never be able to dock here. Goods would have to go to a coastal colony by wagon train. Found it anyway?',
      'Found it here');
    if (!yes) return;
  }
  const col = foundColony(u);
  afterAction(u);
  openScreen('colony', { colonyId: col.id, colonySel: null });
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

function tileInfo(x, y) {
  if (!explored(x, y)) return { title: 'Unexplored', lines: ['Nobody knows what lies here yet.'] };
  const t = tile(x, y);
  const yields = tileGoods(t).filter(g => tileYield(t, g) > 0).map(g => `${iconOf(g)}${tileYield(t, g)}`).join(' ');
  const lines = [];
  if (yields) lines.push(`A colonist working here makes: ${yields}`);
  const extras = [];
  if (t.bonus) extras.push(`${BONUS[t.bonus].icon} ${BONUS[t.bonus].name}`);
  if (t.highSeas) extras.push('High seas: ships can sail to Europe from here');
  if (t.road) extras.push('Road');
  if (t.plowed) extras.push('Plowed');
  if (t.rumor) extras.push('❓ Rumours of a lost city: send a unit to explore');
  if (extras.length) lines.push(extras.join(' · '));
  if (t.village != null) {
    const v = S.villages[t.village];
    lines.push(`🛖 ${v.tribe} village. Teaches ${SKILLS[v.skill].name}${v.taught ? ' (already taught)' : ''} to a free colonist. Scouts can talk to the chief.`);
  }
  const c = colonyAt(x, y);
  if (c) lines.push(`🏘️ ${c.name}${c.owner === 'player' ? '' : ' (held by the King)'}`);
  return { title: terrainName(x, y) + (TERRAIN[t.terrain].move > 1 || t.forest ? ' (slow to cross)' : ''), lines };
}

function hintFor(u) {
  if (u.work) return 'Working on its own. It will be free again when the job is done.';
  if (u.state !== 'active') return 'Tap ⏰ Wake up to give it new orders.';
  if (u.moves <= 0) return canFound(u) ? 'No moves left, but it can still found a colony right here.' : 'No moves left. It can act again next turn.';
  const parts = [];
  const any = ui.reach && ui.reach.size > 0;
  if (u.where === 'ship') parts.push(any ? 'Tap a bright land tile to go ashore.' : 'The ship has to be next to land before you can go ashore.');
  else if (any) parts.push('Tap a bright tile to move. Tap further away for a longer trip.');
  if (isNaval(u) && tile(u.x, u.y).highSeas && !S.player.declared) parts.push('From these dark high seas you can also sail to Europe.');
  if (hasHold(u) && !isNaval(u)) parts.push('Drive into a colony to load or unload goods.');
  if (canFound(u)) parts.push(isCoastal(u.x, u.y) ? 'Or found a colony here: on the coast, so ships can dock.' : 'Or found a colony here, but it is inland: ships can not reach it.');
  return parts.join(' ');
}

function actionsFor(u) {
  if (u.work) return [{ act: 'cancel-work', label: 'Stop working', icon: '✋' }];
  if (u.state !== 'active') return [{ act: 'wake', label: 'Wake up', icon: '⏰', primary: true }];
  const a = [];
  const pos = unitPos(u);
  const c = colonyAt(pos.x, pos.y);
  const own = c && c.owner === 'player';
  if (u.where === 'ship') {
    if (own) a.push({ act: 'ashore', label: `Go ashore in ${c.name}`, icon: '⛰️', primary: true });
    a.push({ act: 'select-carrier', label: 'Select the ship', icon: unitIcon(unitById(u.carrier)) });
    if (!u.waited) a.push({ act: 'skip', label: 'Stay aboard', icon: '⏭' });
    return a;
  }
  if (isNaval(u)) {
    if (own) a.push({ act: 'colony', label: `Open ${c.name}`, icon: '🏘️', primary: true });
    if (!S.player.declared) {
      if (tile(u.x, u.y).highSeas) a.push({ act: 'sail', label: 'Sail to Europe', icon: '⚓' });
      else a.push({ act: 'to-europe', label: 'To Europe', icon: '🧭' });
    }
  } else {
    if (canFound(u)) a.push({ act: 'found', label: 'Found colony', icon: '🏠', primary: true });
    if (own && isPerson(u)) a.push({ act: 'join', label: `Work in ${c.name}`, icon: '➕', primary: true });
    if (own) a.push({ act: 'colony', label: `Open ${c.name}`, icon: '🏘️' });
    for (const w of workOptions(u)) a.push({ act: 'work', arg: w.kind, label: `${w.label} (${w.turns} turns)`, icon: w.icon });
    a.push(isMilitary(u) ? { act: 'fortify', label: 'Fortify', icon: '🛡️' } : { act: 'sentry', label: 'Sleep', icon: '💤' });
  }
  if (u.path) a.push({ act: 'cancel-path', label: 'Cancel route', icon: '✋' });
  if (u.moves > 0 && !u.waited) a.push({ act: 'skip', label: 'Skip this turn', icon: '⏭' });
  return a;
}

function cargoHtml(u) {
  if (!hasHold(u)) return '';
  const chips = cargoUnits(u).map(c =>
    `<button class="chip" data-act="select" data-arg="${c.id}">${unitIcon(c)}<small>${esc(unitName(c))}</small></button>`);
  for (const [g, n] of Object.entries(u.goods)) chips.push(`<span class="chip">${iconOf(g)}<small>${n}</small></span>`);
  for (let i = 0; i < freeSlots(u); i++) chips.push('<span class="chip empty"><small>empty</small></span>');
  return `<div class="cargo">${chips.join('')}</div>`;
}

// Top row of the panel: units still waiting for orders, and the End turn button.
function queueHtml(sel) {
  const list = waitingUnits();
  const end = `<button class="btn end ${list.length ? '' : 'primary pulse'}" data-act="end">End turn ⏩</button>`;
  if (!list.length) return `<div class="queue"><span class="queue-done">✓ Everyone has orders</span>${end}</div>`;
  return `
    <div class="queue">
      <span class="queue-label">Waiting<b>${list.length}</b></span>
      <div class="queue-list">${list.map(u => `
        <button class="qu${sel && u.id === sel.id ? ' sel' : ''}" data-act="select" data-arg="${u.id}" aria-label="${esc(unitName(u))}">${unitIcon(u)}${badgeHtml(u)}</button>`).join('')}
      </div>
      ${end}
    </div>`;
}

function unitCard(u) {
  const st = stateText(u);
  const hint = hintFor(u);
  return `
    <div class="pnl-head">
      <div class="pnl-icon">${unitIcon(u)}${badgeHtml(u)}</div>
      <div class="pnl-title"><b>${esc(unitName(u))}</b><span>📍 ${esc(whereText(u))}</span>${st ? `<span class="st">${esc(st)}</span>` : ''}</div>
      <button class="icon-btn" data-act="deselect" aria-label="Close">✕</button>
    </div>
    ${cargoHtml(u)}
    ${hint ? `<div class="hint-line">${esc(hint)}</div>` : ''}
    <div class="actions">${actionsFor(u).map(b =>
      `<button class="btn ${b.primary ? 'primary' : ''}" data-act="${b.act}" data-arg="${b.arg || ''}">${b.icon} ${esc(b.label)}</button>`).join('')}</div>`;
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
  ui.reach = u && !S.over ? reachable(u) : null;

  let body = '';
  if (S.over) {
    body = `<div class="pnl-msg"><b>${S.over === 'won' ? '🎉 Independence won!' : '💀 The rebellion has failed.'}</b><br>Start a new game from the ☰ menu.</div>`;
  } else if (u && ui.preview) {
    const turns = ui.preview.turns;
    const c = colonyAt(ui.preview.x, ui.preview.y);
    body = `
      <div class="pnl-head"><div class="pnl-icon">${unitIcon(u)}</div>
        <div class="pnl-title"><b>Trip to ${esc(tileInfo(ui.preview.x, ui.preview.y).title)}</b>
        <span>${turns === 0 ? 'Arrives this turn' : `Takes ${turns + 1} turns`}. It keeps going on its own each turn.</span></div></div>
      <div class="actions">
        <button class="btn primary" data-act="go">▶ Go</button>
        <button class="btn" data-act="cancel-preview">Cancel</button>
        ${c && c.owner === 'player' ? `<button class="btn" data-act="open-colony" data-arg="${c.id}">🏘️ Open ${esc(c.name)}</button>` : ''}
      </div>`;
  } else if (u) {
    body = unitCard(u);
  } else if (ui.info) {
    const info = tileInfo(ui.info.x, ui.info.y);
    body = `
      <div class="pnl-head"><div class="pnl-title"><b>${esc(info.title)}</b>${info.lines.map(l => `<span>${esc(l)}</span>`).join('')}</div>
      <button class="icon-btn" data-act="deselect" aria-label="Close">✕</button></div>`;
  }
  el.innerHTML = `
    ${S.over ? '' : queueHtml(u)}
    ${body ? `<div class="card">${body}</div>` : ''}`;
}

export function initPanel() {
  document.getElementById('panel').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const u = selectedUnit();
    const arg = b.dataset.arg;
    switch (b.dataset.act) {
      case 'end': return doEndTurn();
      case 'deselect': ui.info = null; return selectUnit(null);
      case 'go': return go();
      case 'cancel-preview': ui.preview = null; return refresh();
      case 'open-colony': ui.preview = null; return openScreen('colony', { colonyId: Number(arg), colonySel: null });
      case 'select': return selectUnit(unitById(Number(arg)));
    }
    if (!u) return;
    const pos = unitPos(u);
    const c = pos && colonyAt(pos.x, pos.y);
    switch (b.dataset.act) {
      case 'select-carrier': return selectUnit(unitById(u.carrier), false);
      case 'found': return foundHere(u);
      case 'join':
        joinColony(u, c);
        toast(`${unitName(u)} now works in ${c.name}: ${jobText(u)}.`, 'good');
        return afterAction(u);
      case 'ashore':
        Object.assign(u, { where: 'map', x: c.x, y: c.y, carrier: null });
        return afterAction(u, true);
      case 'colony': return openScreen('colony', { colonyId: c.id, colonySel: null });
      case 'work': startWork(u, arg); return afterAction(u);
      case 'cancel-work': u.work = null; return refresh();
      case 'fortify': u.state = 'fortified'; return afterAction(u);
      case 'sentry': u.state = 'sentry'; return afterAction(u);
      case 'wake': u.state = 'active'; return refresh();
      case 'skip': u.waited = true; return afterAction(u);
      case 'cancel-path': u.path = null; u.goEurope = false; return refresh();
      case 'sail': sailToEurope(u); toast(`${unitName(u)} sets sail for Europe. It arrives in 3 turns.`); return afterAction(u);
      case 'to-europe': return toEurope(u);
    }
  });
}
