// The Units screen: every person and ship you own, grouped by where they are.
import { S, unitById, playerColonies } from '../state.js';
import { screens, closeScreen, openScreen, esc } from './ctx.js';
import { toast } from './dialogs.js';
import { unitName, unitIcon, unitBadge, isNaval, cargoUnits } from '../units.js';
import { workers } from '../colony.js';
import { needsOrders } from '../game.js';
import { whereText, stateText, jobText, cargoText } from './describe.js';
import { selectUnit } from './mapui.js';

function row(u, sub, extra = '') {
  const badge = unitBadge(u) ? `<i class="badge">${unitBadge(u)}</i>` : '';
  return `
    <button class="row${extra}" data-act="unit" data-id="${u.id}">
      <span class="row-icon">${unitIcon(u)}${badge}</span>
      <span class="row-text"><b>${esc(unitName(u))}</b><small>${esc(sub)}</small></span>
      <span class="row-go">›</span>
    </button>`;
}

function section(title, hint, rows) {
  if (!rows.length) return '';
  return `<section><h3>${title}</h3>${hint ? `<p class="muted">${hint}</p>` : ''}<div class="rows">${rows.join('')}</div></section>`;
}

function render(el) {
  const mine = S.units.filter(u => u.owner === 'player');
  const waiting = mine.filter(u => needsOrders(u, true));
  const onMap = mine.filter(u => u.where === 'map' && !isNaval(u) && !waiting.includes(u));
  const ships = mine.filter(isNaval);

  const shipRows = [];
  for (const s of ships) {
    shipRows.push(row(s, `${whereText(s)} · ${cargoText(s)}`));
    for (const p of cargoUnits(s)) shipRows.push(row(p, waiting.includes(p) ? 'Can go ashore now' : 'Passenger', ' sub'));
  }

  const colonyBlocks = playerColonies().map(c => {
    const ws = workers(c);
    return `
      <section>
        <h3>🏘️ ${esc(c.name)} <small>${ws.length} working inside</small></h3>
        <div class="rows">
          ${ws.map(w => row(w, jobText(w))).join('')}
          <button class="row open" data-act="colony" data-id="${c.id}"><span class="row-icon">🏘️</span>
            <span class="row-text"><b>Open ${esc(c.name)}</b><small>Change jobs, build, load ships</small></span><span class="row-go">›</span></button>
        </div>
      </section>`;
  });

  const docks = mine.filter(u => u.where === 'europe' && !isNaval(u));
  el.innerHTML = `
    <div class="scr-head">
      <button class="btn" data-act="close">‹ Map</button>
      <div class="scr-title"><b>Your people</b><span>${mine.length} units · tap one to find it</span></div>
    </div>
    ${section('Waiting for orders', 'These can still act this turn.', waiting.map(u => row(u, whereText(u))))}
    ${section('Out on the map', '', onMap.map(u => row(u, [stateText(u), whereText(u)].filter(Boolean).join(' · '))))}
    ${section('Ships and passengers', '', shipRows)}
    ${colonyBlocks.join('')}
    ${section('In Europe', 'Bring them over by ship.', docks.map(u => row(u, whereText(u))))}
    ${mine.length ? '' : '<p class="muted">You have no units left.</p>'}`;
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'close') return closeScreen();
  if (act === 'colony') return openScreen('colony', { colonyId: Number(b.dataset.id), colonySel: null });
  if (act !== 'unit') return;
  const u = unitById(Number(b.dataset.id));
  if (!u) return;
  const carrier = u.where === 'ship' ? unitById(u.carrier) : null;
  if (u.where === 'colony') return openScreen('colony', { colonyId: u.colony, colonySel: u.id });
  if (u.where === 'europe' || (carrier && carrier.where === 'europe')) return openScreen('europe', { europeSel: isNaval(u) ? null : u.id });
  if (u.where === 'sailing' || (carrier && carrier.where === 'sailing')) {
    toast(whereText(carrier || u));
    return;
  }
  closeScreen();
  selectUnit(u);
}

screens.units = { render, onClick };
