// Europe: the market, recruiting colonists, buying ships and the Atlantic crossing.
import {
  GOODS, GOOD_KEYS, SKILLS, UNIT_TYPES, RECRUIT_WEIGHTS, SAIL_TURNS, PRICE_RISE, PIONEER_TOOLS,
} from './data.js';
import { S, notify, reveal, rnd } from './state.js';
import { makeUnit, roomFor, addCargo, equipDelta, setRole, maxMoves, unitName, isNaval } from './units.js';
import { weighted } from './rng.js';

const article = name => (/^[AEIOU]/.test(name) ? 'an' : 'a');

export function initMarket() {
  const m = {};
  for (const g of GOOD_KEYS) m[g] = { sell: GOODS[g].price, sold: 0, bought: 0 };
  return m;
}

export const sellPrice = g => S.market[g].sell;
export const buyPrice = g => S.market[g].sell + GOODS[g].spread;
export const afterTax = gross => gross - Math.floor((gross * S.player.tax) / 100);

function soldToEurope(g, n) {
  const m = S.market[g];
  m.sold += n;
  S.player.sales += n * m.sell;
  while (m.sold >= GOODS[g].drop) {
    m.sold -= GOODS[g].drop;
    if (m.sell > 1) m.sell--;
  }
}

function boughtFromEurope(g, n) {
  const m = S.market[g];
  m.bought += n;
  while (m.bought >= PRICE_RISE) {
    m.bought -= PRICE_RISE;
    m.sell++;
  }
}

export function sellGoods(ship, g, n = Infinity) {
  n = Math.min(n, ship.goods[g] || 0);
  if (n <= 0) return 0;
  const net = afterTax(n * sellPrice(g));
  S.player.gold += net;
  addCargo(ship, g, -n);
  soldToEurope(g, n);
  return net;
}

export function buyGoods(ship, g, n = 100) {
  const price = buyPrice(g);
  n = Math.min(n, roomFor(ship, g), Math.floor(S.player.gold / price));
  if (n <= 0) return 0;
  S.player.gold -= n * price;
  addCargo(ship, g, n);
  boughtFromEurope(g, n);
  return n;
}

// --- people and ships for sale ---

export const randomRecruit = () => weighted(Math.random, RECRUIT_WEIGHTS);

export function recruitPrice() {
  const p = S.player;
  const progress = Math.min(1, p.crosses / p.crossesNeeded);
  return Math.max(60, Math.round(p.recruitBase * (1 - 0.6 * progress)));
}

// Takes a colonist type out of the recruit pool and refills the slot.
export function takeRecruit(i = rnd(3)) {
  const p = S.player;
  const skill = p.pool[i];
  p.pool[i] = randomRecruit();
  return skill;
}

export function recruit(i) {
  const price = recruitPrice();
  if (S.player.gold < price) return 'Not enough gold.';
  S.player.gold -= price;
  S.player.crosses = 0;
  S.player.recruitBase += 40;
  makeUnit('colonist', { where: 'europe', skill: takeRecruit(i) });
  return null;
}

export const trainable = () => Object.entries(SKILLS).filter(([, s]) => s.price).map(([k]) => k);

export function train(skill) {
  const price = SKILLS[skill].price;
  if (S.player.gold < price) return 'Not enough gold.';
  S.player.gold -= price;
  makeUnit('colonist', { where: 'europe', skill });
  return null;
}

export const purchasable = () => ['caravel', 'merchantman', 'galleon', 'artillery'];

export function purchase(type) {
  const price = UNIT_TYPES[type].price;
  if (S.player.gold < price) return 'Not enough gold.';
  S.player.gold -= price;
  makeUnit(type, { where: 'europe' });
  return null;
}

// Positive = costs gold, negative = gold back from selling the old equipment.
export function equipCost(u, role) {
  let cost = 0;
  for (const [g, n] of Object.entries(equipDelta(u, role))) {
    cost += n > 0 ? n * buyPrice(g) : -afterTax(-n * sellPrice(g));
  }
  return cost;
}

export function equipInEurope(u, role) {
  const cost = equipCost(u, role);
  if (cost > S.player.gold) return 'Not enough gold.';
  for (const [g, n] of Object.entries(equipDelta(u, role))) {
    if (n > 0) boughtFromEurope(g, n);
    else soldToEurope(g, -n);
  }
  S.player.gold -= cost;
  setRole(u, role, role === 'pioneer' ? PIONEER_TOOLS : 0);
  return null;
}

// --- crossing the Atlantic ---

export function sailToEurope(ship) {
  ship.lastSea = { x: ship.x, y: ship.y };
  Object.assign(ship, { where: 'sailing', sail: { to: 'europe', turns: SAIL_TURNS }, path: null, goEurope: false });
}

export function sailToAmerica(ship) {
  Object.assign(ship, { where: 'sailing', sail: { to: 'america', turns: SAIL_TURNS } });
}

export function progressSailing() {
  for (const s of S.units.filter(u => u.where === 'sailing' && isNaval(u))) {
    if (--s.sail.turns > 0) continue;
    if (s.sail.to === 'europe') {
      Object.assign(s, { where: 'europe', sail: null });
      notify(`${unitName(s)} has arrived in Europe.`);
    } else {
      const p = s.lastSea || S.player.entry;
      Object.assign(s, { where: 'map', x: p.x, y: p.y, sail: null, state: 'active' });
      s.moves = maxMoves(s);
      reveal(p.x, p.y, 1);
      notify(`${unitName(s)} has arrived in the New World.`);
    }
  }
}

// --- each turn ---

export function immigration() {
  const p = S.player;
  p.crosses += 1;
  if (p.declared || p.crosses < p.crossesNeeded) return;
  p.crosses -= p.crossesNeeded;
  p.crossesNeeded += 8;
  const skill = takeRecruit();
  makeUnit('colonist', { where: 'europe', skill });
  const name = SKILLS[skill].name;
  notify(`New immigrant: ${article(name)} ${name} is waiting on the docks in Europe.`, { kind: 'good' });
}

export function marketTurn() {
  for (const g of GOOD_KEYS) {
    const m = S.market[g], base = GOODS[g].price;
    if (m.sell < base && Math.random() < 0.06) m.sell++;
    else if (m.sell > base && Math.random() < 0.06) m.sell--;
  }
  const p = S.player;
  if (!p.declared && p.sales >= 2500 && p.tax < 70 && Math.random() < 0.2) {
    p.tax = Math.min(70, p.tax + 1 + rnd(4));
    p.sales = 0;
    notify(`The King raises the tax on all sales to ${p.tax}%.`, { kind: 'bad', modal: true, title: 'New taxes' });
  }
}
