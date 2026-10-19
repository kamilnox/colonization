// The colony screen: fields, buildings, warehouse, construction and ships in port.
import { GOOD_KEYS, BUILDINGS, TERRAIN, FOOD_TO_GROW, iconOf, nameOf } from '../data.js';
import { S, tile, colonyById, unitById, isWater, inMap } from '../state.js';
import { ui, refresh, screens, closeScreen, esc } from './ctx.js';
import { drawTerrain } from './render.js';
import { toast, choose } from './dialogs.js';
import {
  workers, computeColony, canWorkTile, tileYield, tileGoods, bestGoodFor, joinColony, leaveColony,
  equipFromColony, buildOptions, buildCost, buildName, storageCap, sol, colonyUnitsOutside, addGoods,
  buildingWorkers, tileWorker, colonyCoastal,
} from '../colony.js';
import { unitName, unitIcon, unitBadge, isNaval, isPerson, hasHold, cargoUnits, roomFor, addCargo, board, freeSlots } from '../units.js';
import { saveSoon } from '../save.js';
import { selectUnit } from './mapui.js';

const colony = () => colonyById(ui.colonyId);
const selected = () => (ui.colonySel != null ? unitById(ui.colonySel) : null);

function done() {
  saveSoon();
  refresh();
}

const person = (u, extra = '') => `${unitIcon(u)}${unitBadge(u) ? `<i class="badge">${unitBadge(u)}</i>` : ''}${extra}`;

function unitChip(u, sub = '') {
  const sel = u.id === ui.colonySel ? ' sel' : '';
  return `<button class="chip unit${sel}" data-act="unit" data-id="${u.id}">${person(u)}<small>${esc(sub || unitName(u))}</small></button>`;
}

function selectionBar(u, c) {
  const inside = u.where === 'colony';
  const aboard = u.where === 'ship';
  const btns = [];
  if (isPerson(u)) {
    if (!inside) btns.push(['join', 'Join colony', '➕']);
    if (inside && workers(c).length > 1) btns.push(['out', 'Move outside', '🚶']);
    if (u.where === 'map') btns.push(['equip', 'Equip...', '🎒']);
  }
  if (aboard) btns.push(['ashore', 'Go ashore', '⛰️']);
  const ship = ui.colonyShip != null && unitById(ui.colonyShip);
  if (u.where === 'map' && ship && isNaval(ship) && freeSlots(ship) > 0) btns.push(['board', `Board ${unitName(ship)}`, '⛵']);
  if (u.where === 'map') btns.push(['showmap', 'On the map', '🗺️']);
  const job = inside && u.job
    ? (u.job.kind === 'tile' ? `Working a field: ${nameOf(u.job.good)}` : `Working in the ${BUILDINGS[u.job.b].name}`)
    : aboard ? 'Aboard a ship' : 'Outside the colony';
  return `
    <div class="selbar">
      <div class="selbar-head">
        <span class="selbar-icon">${person(u)}</span>
        <span class="selbar-text"><b>${esc(unitName(u))}</b><small>${esc(job)}. Tap a green field or building.</small></span>
        <button class="icon-btn" data-act="unsel" aria-label="Deselect">✕</button>
      </div>
      ${btns.length ? `<div class="actions">${btns.map(([a, l, i]) => `<button class="btn small" data-act="${a}">${i} ${esc(l)}</button>`).join('')}</div>` : ''}
    </div>`;
}

function tilesHtml(c, r, sel) {
  const cells = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (!inMap(x, y)) { cells.push('<div class="cell off"></div>'); continue; }
      const t = tile(x, y);
      let inner = '';
      if (dx === 0 && dy === 0) {
        const sec = r.center.sec ? ` ${iconOf(r.center.sec.good)}${r.center.sec.n}` : '';
        inner = `<span class="cell-main">🏘️</span><span class="out">🌽${r.center.food}${sec}</span>`;
      } else if (t.village != null) {
        inner = '<span class="cell-main">🛖</span>';
      } else {
        const w = tileWorker(x, y);
        if (w && w.colony === c.id) {
          const o = r.out[w.id] || { good: w.job.good, n: 0 };
          inner = `<span class="cell-main${w.id === ui.colonySel ? ' sel' : ''}">${person(w)}</span><span class="out">${iconOf(o.good)}${o.n}</span>`;
        } else if (w) {
          inner = '<span class="cell-note">other colony</span>';
        } else if (isWater(t) && !c.buildings.docks) {
          inner = '<span class="cell-note">needs docks</span>';
        } else if (sel && isPerson(sel) && canWorkTile(c, x, y, sel)) {
          const g = bestGoodFor(t, sel.skill);
          if (g) inner = `<span class="out hint">${iconOf(g)}${tileYield(t, g, sel.skill)}</span>`;
        }
      }
      const can = sel && isPerson(sel) && !(dx === 0 && dy === 0) && canWorkTile(c, x, y, sel) && bestGoodFor(t, sel.skill);
      cells.push(`<button class="cell${can ? ' can' : ''}" data-act="tile" data-x="${x}" data-y="${y}">${inner}</button>`);
    }
  }
  return `<div class="tiles" id="col-tiles"><canvas></canvas>${cells.join('')}</div>`;
}

function productionHtml(c, r) {
  const keys = [...GOOD_KEYS, 'hammers', 'bells', 'crosses'].filter(g => r.prod[g] || r.cons[g]);
  const chips = keys.map(g => {
    const n = r.net[g] || 0;
    const cls = n > 0 ? 'pos' : n < 0 ? 'neg' : '';
    const extra = g === 'food' ? ` <small>${c.goods.food || 0}/${FOOD_TO_GROW}</small>` : '';
    return `<span class="prod ${cls}">${iconOf(g)} ${n > 0 ? '+' : ''}${n}${extra}</span>`;
  });
  return `<div class="prods">${chips.join('')}</div>`;
}

function buildingsHtml(c, r, sel) {
  const cards = [], small = [];
  for (const [b, B] of Object.entries(BUILDINGS)) {
    if (!c.buildings[b]) continue;
    if (!B.out) { small.push(`<span class="tag" data-act="bldg" data-b="${b}">${B.icon} ${esc(B.name)}</span>`); continue; }
    const ws = buildingWorkers(c, b);
    const made = ws.reduce((s, w) => s + ((r.out[w.id] || {}).n || 0), 0) + (b === 'townhall' ? 1 : 0);
    const slots = [0, 1, 2].map(i => (ws[i]
      ? `<button class="slot${ws[i].id === ui.colonySel ? ' sel' : ''}" data-act="unit" data-id="${ws[i].id}">${person(ws[i])}</button>`
      : '<span class="slot empty"></span>')).join('');
    const flow = B.in ? `${iconOf(B.in)} → ${iconOf(B.out)} ${made}` : `${iconOf(B.out)} ${made}`;
    const can = sel && isPerson(sel) && ws.filter(w => w !== sel).length < 3 && !(sel.job && sel.job.kind === 'bldg' && sel.job.b === b);
    cards.push(`
      <div class="bldg${can ? ' can' : ''}" data-act="bldg" data-b="${b}">
        <div class="bldg-name">${B.icon} ${esc(B.name)}</div>
        <div class="bldg-row"><div class="slots">${slots}</div><div class="flow">${flow}</div></div>
      </div>`);
  }
  return `<div class="bldgs">${cards.join('')}</div><div class="tags">${small.join('')}</div>`;
}

// The colony's situation in plain sentences.
function summaryHtml(c, r, ships, people) {
  const lines = [];
  const food = r.net.food || 0;
  const stock = c.goods.food || 0;
  if (food > 0) lines.push(['', `🌽 Food +${food} a turn: a new colonist in ${Math.ceil((FOOD_TO_GROW - stock) / food)} turns.`]);
  else if (food === 0) lines.push(['', '🌽 Food is balanced, so the colony will not grow.']);
  else lines.push(['bad', `⚠️ Food ${food} a turn: colonists will starve${stock ? ` in ${Math.ceil(stock / -food)} turns` : ' next turn'}. Put someone on a food field.`]);
  if (c.build) {
    const cost = buildCost(c.build);
    const rate = r.prod.hammers || 0;
    const left = Math.max(0, cost.hammers - c.hammers);
    if (rate) lines.push(['', `🔨 Building ${buildName(c.build)}: ${left ? `${Math.ceil(left / rate)} turns` : 'done next turn'}.`]);
    else if (buildingWorkers(c, 'carpenter').length) lines.push(['warn', `🔨 ${buildName(c.build)} is stuck: the carpenter has no lumber. Put someone on a forest tile.`]);
    else lines.push(['warn', `🔨 ${buildName(c.build)} is waiting for hammers: put a colonist in the Carpenter's House.`]);
  }
  if (people.length) lines.push(['', `🚶 ${people.length} waiting outside. Tap one, then a field or building to put it to work.`]);
  if (ships.length) lines.push(['', `⛵ ${ships.map(unitName).join(', ')} in port. Tap warehouse goods to load them.`]);
  return `<div class="summary">${lines.map(([cls, l]) => `<p class="${cls}">${esc(l)}</p>`).join('')}</div>`;
}

function constructionHtml(c, r) {
  if (!c.build) {
    return `<div class="build"><span>Nothing is being built. Hammers saved: ${c.hammers}</span><button class="btn small" data-act="change-build">Choose</button></div>`;
  }
  const cost = buildCost(c.build);
  const rate = r.prod.hammers || 0;
  const left = Math.max(0, cost.hammers - c.hammers);
  const turns = left === 0 ? 0 : rate ? Math.ceil(left / rate) : Infinity;
  const pct = Math.min(100, Math.floor((c.hammers / cost.hammers) * 100));
  const stalled = buildingWorkers(c, 'carpenter').length
    ? 'no lumber: have someone cut wood in a forest'
    : "needs hammers: put a colonist in the Carpenter's House";
  const tools = cost.tools ? ` · 🛠️ ${c.goods.tools || 0}/${cost.tools}` : '';
  return `
    <div class="build">
      <div class="build-info">
        <b>${esc(buildName(c.build))}</b>
        <div class="bar"><div style="width:${pct}%"></div></div>
        <small>🔨 ${c.hammers}/${cost.hammers}${tools} · ${turns === Infinity ? stalled : turns === 0 ? 'done next turn' : `${turns} turns`}</small>
      </div>
      <button class="btn small" data-act="change-build">Change</button>
    </div>`;
}

function warehouseHtml(c, r) {
  const cap = storageCap(c);
  const chips = GOOD_KEYS.filter(g => (c.goods[g] || 0) > 0 || r.net[g]).map(g => {
    const n = c.goods[g] || 0;
    const full = g !== 'food' && n > cap ? ' full' : '';
    return `<button class="chip good${full}" data-act="load" data-g="${g}">${iconOf(g)}<small>${n}</small></button>`;
  });
  return chips.length ? `<div class="cargo">${chips.join('')}</div>` : '<p class="muted">Empty.</p>';
}

function shipsHtml(ships, c) {
  if (!ships.length) {
    return colonyCoastal(c)
      ? '<p class="muted">Nothing here yet. Sail a ship (or drive a wagon train) onto the colony to load and unload goods.</p>'
      : `<p class="muted">${esc(c.name)} is inland, so ships can't reach it. Build a 🐂 Wagon Train (Construction, then Change) to carry goods to a colony on the coast.</p>`;
  }
  return ships.map(s => {
    const units = cargoUnits(s).map(u => unitChip(u));
    const goods = Object.entries(s.goods).map(([g, n]) => `<button class="chip good" data-act="unload" data-g="${g}" data-ship="${s.id}">${iconOf(g)}<small>${n}</small></button>`);
    const free = Array.from({ length: Math.max(0, freeSlots(s)) }, () => '<span class="chip empty">·</span>');
    return `
      <div class="ship${s.id === ui.colonyShip ? ' sel' : ''}" data-act="ship" data-id="${s.id}">
        <div class="ship-head"><span>${unitIcon(s)} <b>${esc(unitName(s))}</b></span>
          <span>
            <button class="btn small" data-act="unload-all" data-ship="${s.id}">Unload all</button>
            <button class="btn small" data-act="ship-map" data-ship="${s.id}">🗺️</button>
          </span></div>
        <div class="cargo">${[...units, ...goods, ...free].join('')}</div>
      </div>`;
  }).join('');
}

function render(el) {
  const c = colony();
  if (!c) { closeScreen(); return; }
  if (c.owner !== 'player') {
    el.innerHTML = `<div class="scr-head"><button class="btn" data-act="close">‹ Map</button><div class="scr-title"><b>${esc(c.name)}</b><span>Occupied by the King's army</span></div></div>
      <p class="muted">Defeat the soldiers in the colony to liberate it.</p>`;
    return;
  }
  const r = computeColony(c);
  let sel = selected();
  if (sel && !S.units.includes(sel)) { ui.colonySel = null; sel = null; }
  const outside = colonyUnitsOutside(c);
  const ships = outside.filter(hasHold);
  const people = outside.filter(u => !hasHold(u));
  if (!ships.some(s => s.id === ui.colonyShip)) ui.colonyShip = ships.length ? ships[0].id : null;

  el.innerHTML = `
    <div class="scr-head">
      <button class="btn" data-act="close">‹ Map</button>
      <div class="scr-title"><b>${esc(c.name)}</b><span>👥 ${workers(c).length} working here · ${colonyCoastal(c) ? '⚓ coast' : '🌲 inland'} · 🔔 ${sol(c)}%</span></div>
    </div>
    ${sel ? selectionBar(sel, c) : summaryHtml(c, r, ships, people)}
    <section><h3>Fields <small>${sel ? 'green = can work here' : 'tap a colonist to move them'}</small></h3>${tilesHtml(c, r, sel)}</section>
    <section><h3>Production <small>per turn</small></h3>${productionHtml(c, r)}</section>
    <section><h3>Buildings <small>${sel ? 'green = room for one more' : 'colonists inside make goods'}</small></h3>${buildingsHtml(c, r, sel)}</section>
    <section><h3>Construction</h3>${constructionHtml(c, r)}</section>
    <section><h3>Warehouse <small>holds ${storageCap(c)} of each${ships.length ? ` · tap goods to load the ${esc(unitName(unitById(ui.colonyShip)))}` : ''}</small></h3>${warehouseHtml(c, r)}</section>
    <section><h3>Outside the colony <small>not working</small></h3>${people.length ? `<div class="cargo">${people.map(u => unitChip(u)).join('')}</div>` : '<p class="muted">Nobody.</p>'}</section>
    <section><h3>${colonyCoastal(c) ? 'Ships and wagons here' : 'Wagons here'} <small>tap goods to unload</small></h3>${shipsHtml(ships, c)}</section>`;
  drawTiles(el, c);
}

function drawTiles(el, c) {
  const box = el.querySelector('#col-tiles');
  const canvas = box.querySelector('canvas');
  const size = box.clientWidth;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = canvas.height = Math.round(size * dpr);
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const ts = size / 3;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (inMap(x, y)) drawTerrain(g, x, y, (dx + 1) * ts, (dy + 1) * ts, ts);
    }
  }
}

// Joins the colony if needed so the unit can take a job.
function ensureInside(u, c) {
  if (u.where !== 'colony') joinColony(u, c);
}

function tapTile(c, x, y) {
  const sel = selected();
  const t = tile(x, y);
  if (x === c.x && y === c.y) {
    toast('The colony tile produces food and one extra good for free.');
    return;
  }
  const w = tileWorker(x, y);
  if (sel && isPerson(sel)) {
    if (w === sel) {
      const goods = tileGoods(t).filter(g => tileYield(t, g, sel.skill) > 0);
      if (goods.length > 1) sel.job.good = goods[(goods.indexOf(sel.job.good) + 1) % goods.length];
      return done();
    }
    if (w && w.colony === c.id && sel.where === 'colony') {
      [w.job, sel.job] = [sel.job, w.job];
      if (w.job.kind === 'tile') w.job.good = bestGoodFor(tile(w.job.x, w.job.y), w.skill) || w.job.good;
      if (sel.job.kind === 'tile') sel.job.good = bestGoodFor(t, sel.skill) || sel.job.good;
      ui.colonySel = null;
      return done();
    }
    if (!canWorkTile(c, x, y, sel)) {
      toast(t.village != null ? 'That is native land.' : isWater(t) && !c.buildings.docks ? 'Build docks to fish here.' : "That tile can't be worked.", 'bad');
      return;
    }
    const good = bestGoodFor(t, sel.skill, (computeColony(c).net.food || 0) < 0);
    if (!good) { toast('Nothing can be produced there.', 'bad'); return; }
    ensureInside(sel, c);
    sel.job = { kind: 'tile', x, y, good };
    ui.colonySel = null;
    return done();
  }
  if (w && w.colony === c.id) {
    ui.colonySel = w.id;
    return refresh();
  }
  const T = TERRAIN[t.terrain];
  const yields = tileGoods(t).filter(g => tileYield(t, g) > 0).map(g => `${iconOf(g)}${tileYield(t, g)}`).join(' ');
  toast(`${t.forest && T.forest ? T.forest.name : T.name}: ${yields || 'nothing'}`);
}

function tapBuilding(c, b) {
  const B = BUILDINGS[b];
  const sel = selected();
  if (!sel || !isPerson(sel)) {
    toast(B.desc || (B.out ? `${B.name}: ${B.in ? `turns ${nameOf(B.in).toLowerCase()} into ` : 'produces '}${nameOf(B.out).toLowerCase()}.` : B.name));
    return;
  }
  if (!B.out) { toast('Nobody can work there.', 'bad'); return; }
  if (buildingWorkers(c, b).filter(w => w !== sel).length >= 3) { toast('That building is full.', 'bad'); return; }
  ensureInside(sel, c);
  sel.job = { kind: 'bldg', b };
  ui.colonySel = null;
  done();
}

async function changeBuild(c) {
  const opts = buildOptions(c);
  const v = await choose('What should we build?', opts.map(o => ({
    value: o.id, icon: o.icon, label: o.name,
    sub: `${o.desc} 🔨${o.cost.hammers}${o.cost.tools ? ` 🛠️${o.cost.tools}` : ''}`.trim(),
    right: o.reason, disabled: !!o.reason,
  })), { text: opts.length ? '' : 'Everything has been built.' });
  if (v) { c.build = v; done(); }
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const c = colony();
  const act = b.dataset.act;
  if (act === 'close') { ui.colonySel = null; return closeScreen(); }
  if (!c || c.owner !== 'player') return;
  const sel = selected();
  const ship = ui.colonyShip != null ? unitById(ui.colonyShip) : null;
  switch (act) {
    case 'unit': {
      const id = Number(b.dataset.id);
      ui.colonySel = ui.colonySel === id ? null : id;
      const u = unitById(id);
      if (u && u.where === 'ship') ui.colonyShip = u.carrier;
      refresh();
      // Back to the top so the fields with the green targets are in view.
      if (ui.colonySel != null) document.getElementById('screen').scrollTop = 0;
      return;
    }
    case 'unsel': ui.colonySel = null; return refresh();
    case 'tile': return tapTile(c, Number(b.dataset.x), Number(b.dataset.y));
    case 'bldg': return tapBuilding(c, b.dataset.b);
    case 'change-build': return changeBuild(c);
    case 'ship': ui.colonyShip = Number(b.dataset.id); return refresh();
    case 'load': {
      if (!ship) { toast('No ship in port to load.', 'bad'); return; }
      const g = b.dataset.g;
      const n = Math.min(100, c.goods[g] || 0, roomFor(ship, g));
      if (n <= 0) { toast(`The ${unitName(ship)} is full.`, 'bad'); return; }
      addGoods(c, g, -n);
      addCargo(ship, g, n);
      return done();
    }
    case 'unload': {
      const s = unitById(Number(b.dataset.ship));
      const g = b.dataset.g;
      addGoods(c, g, s.goods[g]);
      addCargo(s, g, -s.goods[g]);
      return done();
    }
    case 'unload-all': {
      const s = unitById(Number(b.dataset.ship));
      for (const [g, n] of Object.entries(s.goods)) { addGoods(c, g, n); addCargo(s, g, -n); }
      for (const u of cargoUnits(s)) Object.assign(u, { where: 'map', x: c.x, y: c.y, carrier: null, state: 'active' });
      return done();
    }
    case 'ship-map': {
      const s = unitById(Number(b.dataset.ship));
      closeScreen();
      return selectUnit(s);
    }
  }
  if (!sel) return;
  switch (act) {
    case 'join':
      ensureInside(sel, c);
      ui.colonySel = null;
      return done();
    case 'out':
      leaveColony(sel);
      return done();
    case 'ashore':
      Object.assign(sel, { where: 'map', x: c.x, y: c.y, carrier: null, state: 'active' });
      return done();
    case 'board':
      if (ship && freeSlots(ship) > 0) board(sel, ship);
      ui.colonySel = null;
      return done();
    case 'showmap':
      ui.colonySel = null;
      closeScreen();
      return selectUnit(sel);
  }
  if (act === 'equip') return equipMenu(sel, c);
}

const EQUIP = [
  ['soldier', 'Soldier', '💂', '50 ⚔️ muskets. Defends and attacks.'],
  ['dragoon', 'Dragoon', '🏇', '50 ⚔️ muskets and 50 🐎 horses. Strong and fast.'],
  ['scout', 'Scout', '🤠', '50 🐎 horses. Explores, talks to chiefs.'],
  ['pioneer', 'Pioneer', '👷', '20 to 100 🛠️ tools. Clears forest, plows, builds roads.'],
  ['none', 'Plain colonist', '🧑', 'Put the equipment back in the warehouse.'],
];

async function equipMenu(u, c) {
  const v = await choose(`Equip ${unitName(u)}`, EQUIP.filter(([role]) => role !== u.role).map(([role, label, icon, sub]) => ({
    value: role, icon, label, sub,
  })), { text: 'Equipment comes from this colony\'s warehouse.' });
  if (!v) return;
  const err = equipFromColony(u, c, v);
  if (err) toast(err, 'bad');
  done();
}

screens.colony = { render, onClick };
