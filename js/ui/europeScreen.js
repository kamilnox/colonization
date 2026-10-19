// Europe: sell cargo, buy goods, recruit colonists and send ships back to the New World.
import { GOOD_KEYS, GOODS, SKILLS, UNIT_TYPES, skillBadge } from '../data.js';
import { S, unitById } from '../state.js';
import { ui, refresh, screens, closeScreen, esc } from './ctx.js';
import { toast, confirm } from './dialogs.js';
import { unitName, unitIcon, unitBadge, isNaval, cargoUnits, freeSlots, board } from '../units.js';
import {
  sellPrice, buyPrice, sellGoods, buyGoods, recruitPrice, recruit, trainable, train, purchasable, purchase,
  equipCost, equipInEurope, sailToAmerica,
} from '../europe.js';
import { saveSoon } from '../save.js';

const done = () => { saveSoon(); refresh(); };
const ROLE_BTNS = [['soldier', 'Soldier', '💂'], ['dragoon', 'Dragoon', '🏇'], ['scout', 'Scout', '🤠'], ['pioneer', 'Pioneer', '👷']];

function chip(u) {
  const sel = u.id === ui.europeSel ? ' sel' : '';
  const badge = unitBadge(u) ? `<i class="badge">${unitBadge(u)}</i>` : '';
  return `<button class="chip unit${sel}" data-act="unit" data-id="${u.id}">${unitIcon(u)}${badge}<small>${esc(unitName(u))}</small></button>`;
}

function selectionBar(u, ship) {
  const btns = [];
  if (u.where === 'europe' && ship && freeSlots(ship) > 0) btns.push(['board', `Board ${unitName(ship)}`, '⛵']);
  if (u.where === 'ship') btns.push(['docks', 'Back to the docks', '⚓']);
  if (u.type === 'colonist') {
    for (const [role, label, icon] of ROLE_BTNS) {
      if (u.role !== role) btns.push([`equip:${role}`, `${label} (${equipCost(u, role)})`, icon]);
    }
    if (u.role !== 'none') btns.push(['equip:none', `Unequip (+${-equipCost(u, 'none')})`, '🧑']);
  }
  return `
    <div class="selbar">
      <div class="selbar-head">
        <span class="selbar-icon">${unitIcon(u)}</span>
        <span class="selbar-text"><b>${esc(unitName(u))}</b><small>${u.where === 'ship' ? 'Aboard a ship' : 'Waiting on the docks'}. Prices in gold.</small></span>
        <button class="icon-btn" data-act="unsel" aria-label="Deselect">✕</button>
      </div>
      <div class="actions">${btns.map(([a, l, i]) => `<button class="btn small" data-act="${a}">${i} ${esc(l)}</button>`).join('')}</div>
    </div>`;
}

function shipCard(s) {
  const units = cargoUnits(s).map(chip);
  const goods = Object.entries(s.goods).map(([g, n]) =>
    `<button class="chip good" data-act="sell" data-g="${g}" data-ship="${s.id}">${GOODS[g].icon}<small>${n}</small></button>`);
  const free = Array.from({ length: Math.max(0, freeSlots(s)) }, () => '<span class="chip empty">·</span>');
  return `
    <div class="ship${s.id === ui.europeShip ? ' sel' : ''}" data-act="ship" data-id="${s.id}">
      <div class="ship-head"><span>${unitIcon(s)} <b>${esc(unitName(s))}</b></span>
        <button class="btn small primary" data-act="sail" data-ship="${s.id}">Sail west ⛵</button></div>
      <div class="cargo">${[...units, ...goods, ...free].join('')}</div>
      ${goods.length ? '<small class="muted">Tap goods to sell them.</small>' : ''}
    </div>`;
}

function marketHtml(ship) {
  const rows = GOOD_KEYS.map(g => {
    const have = ship ? ship.goods[g] || 0 : 0;
    return `
      <div class="mrow">
        <span class="mname">${GOODS[g].icon} ${GOODS[g].name}</span>
        <span class="mprice">${sellPrice(g)}/${buyPrice(g)}</span>
        <span class="mbtns">
          ${have ? `<button class="btn small" data-act="sell" data-g="${g}" data-ship="${ship.id}">Sell ${have}</button>` : ''}
          ${ship ? `<button class="btn small" data-act="buy" data-g="${g}">Buy 100</button>` : ''}
        </span>
      </div>`;
  });
  return `<p class="muted">Prices: sell/buy per unit. Tax ${S.player.tax}% on sales.${ship ? '' : ' A ship must be in port to trade.'}</p><div class="market">${rows.join('')}</div>`;
}

function render(el) {
  const p = S.player;
  const head = `
    <div class="scr-head">
      <button class="btn" data-act="close">‹ Map</button>
      <div class="scr-title"><b>Europe</b><span>💰 ${p.gold} gold · Tax ${p.tax}%</span></div>
    </div>`;
  if (p.declared) {
    el.innerHTML = `${head}<p class="muted">You declared independence. The ports of Europe are closed to you.</p>`;
    return;
  }
  const inPort = S.units.filter(u => isNaval(u) && u.where === 'europe');
  const atSea = S.units.filter(u => isNaval(u) && u.where === 'sailing');
  const docks = S.units.filter(u => !isNaval(u) && u.where === 'europe');
  if (!inPort.some(s => s.id === ui.europeShip)) ui.europeShip = inPort.length ? inPort[0].id : null;
  const ship = ui.europeShip != null ? unitById(ui.europeShip) : null;
  let sel = ui.europeSel != null ? unitById(ui.europeSel) : null;
  if (sel && !(sel.where === 'europe' || (sel.where === 'ship' && unitById(sel.carrier).where === 'europe'))) {
    ui.europeSel = null;
    sel = null;
  }
  const price = recruitPrice();
  el.innerHTML = `${head}
    ${sel ? selectionBar(sel, ship) : ''}
    <section><h3>Ships in port</h3>${inPort.length ? inPort.map(shipCard).join('') : '<p class="muted">No ships here. Sail one from the high seas (dark blue water) in the New World.</p>'}</section>
    ${atSea.length ? `<section><h3>At sea</h3>${atSea.map(s => `<p>${unitIcon(s)} ${esc(unitName(s))} → ${s.sail.to === 'europe' ? 'Europe' : 'New World'}, ${s.sail.turns} turn(s)</p>`).join('')}</section>` : ''}
    <section><h3>Docks</h3>${docks.length ? `<div class="cargo">${docks.map(chip).join('')}</div><small class="muted">Tap a colonist to board a ship or buy equipment.</small>` : '<p class="muted">Nobody is waiting.</p>'}</section>
    <section><h3>Market</h3>${marketHtml(ship)}</section>
    <section><h3>Recruit colonists <small>${price} gold each</small></h3>
      <div class="choice-list">${p.pool.map((s, i) => `
        <button class="choice" data-act="recruit" data-i="${i}">
          <span class="choice-icon">🧑${skillBadge(s) ? `<i class="badge">${skillBadge(s)}</i>` : ''}</span>
          <span class="choice-text"><b>${esc(SKILLS[s].name)}</b></span><span class="choice-right">${price}</span>
        </button>`).join('')}</div>
      <small class="muted">The price drops as crosses ✝️ accumulate (${p.crosses}/${p.crossesNeeded}). At the full amount, a colonist comes for free.</small>
    </section>
    <section><details><summary><h3>Train experts</h3></summary>
      <div class="choice-list">${trainable().map(s => `
        <button class="choice" data-act="train" data-skill="${s}">
          <span class="choice-icon">🧑<i class="badge">${skillBadge(s)}</i></span>
          <span class="choice-text"><b>${esc(SKILLS[s].name)}</b></span><span class="choice-right">${SKILLS[s].price}</span>
        </button>`).join('')}</div></details>
    </section>
    <section><details><summary><h3>Shipyard and artillery</h3></summary>
      <div class="choice-list">${purchasable().map(t => `
        <button class="choice" data-act="purchase" data-type="${t}">
          <span class="choice-icon">${UNIT_TYPES[t].icon}</span>
          <span class="choice-text"><b>${esc(UNIT_TYPES[t].name)}</b><small>${UNIT_TYPES[t].holds ? `${UNIT_TYPES[t].holds} holds, ${UNIT_TYPES[t].moves} moves` : 'attack 5, defence 3'}</small></span>
          <span class="choice-right">${UNIT_TYPES[t].price}</span>
        </button>`).join('')}</div></details>
    </section>`;
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'close') { ui.europeSel = null; return closeScreen(); }
  if (S.player.declared) return;
  const ship = ui.europeShip != null ? unitById(ui.europeShip) : null;
  const sel = ui.europeSel != null ? unitById(ui.europeSel) : null;
  switch (act) {
    case 'unit': {
      const id = Number(b.dataset.id);
      ui.europeSel = ui.europeSel === id ? null : id;
      return refresh();
    }
    case 'unsel': ui.europeSel = null; return refresh();
    case 'ship': ui.europeShip = Number(b.dataset.id); return refresh();
    case 'sail': {
      const s = unitById(Number(b.dataset.ship));
      sailToAmerica(s);
      toast(`${unitName(s)} sets sail for the New World.`);
      return done();
    }
    case 'sell': {
      const s = unitById(Number(b.dataset.ship));
      const g = b.dataset.g;
      const n = s.goods[g];
      const got = sellGoods(s, g);
      toast(`Sold ${n} ${GOODS[g].name.toLowerCase()} for ${got} gold.`, 'good');
      return done();
    }
    case 'buy': {
      if (!ship) return;
      const n = buyGoods(ship, b.dataset.g, 100);
      if (!n) toast('Not enough gold or no room on the ship.', 'bad');
      return done();
    }
    case 'recruit': {
      const err = recruit(Number(b.dataset.i));
      if (err) toast(err, 'bad');
      else toast('A new colonist waits on the docks.', 'good');
      return done();
    }
    case 'train': {
      const s = b.dataset.skill;
      if (!(await confirm('Train expert', `Pay ${SKILLS[s].price} gold for ${SKILLS[s].name}?`, 'Pay'))) return;
      const err = train(s);
      if (err) toast(err, 'bad');
      return done();
    }
    case 'purchase': {
      const t = b.dataset.type;
      if (!(await confirm('Purchase', `Pay ${UNIT_TYPES[t].price} gold for ${UNIT_TYPES[t].name}?`, 'Pay'))) return;
      const err = purchase(t);
      if (err) toast(err, 'bad');
      return done();
    }
  }
  if (!sel) return;
  if (act === 'board' && ship) {
    board(sel, ship);
    ui.europeSel = null;
    return done();
  }
  if (act === 'docks') {
    Object.assign(sel, { where: 'europe', carrier: null });
    return done();
  }
  if (act.startsWith('equip:')) {
    const err = equipInEurope(sel, act.slice(6));
    if (err) toast(err, 'bad');
    return done();
  }
}

screens.europe = { render, onClick };
