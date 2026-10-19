// Units: creation, naming, equipment and ship cargo.
import { UNIT_TYPES, ROLES, SKILLS, skillBadge, PIONEER_TOOLS } from './data.js';
import { S, reveal } from './state.js';

export function makeUnit(type, props = {}) {
  const T = UNIT_TYPES[type];
  const u = {
    id: S.nextId++, type, owner: 'player',
    skill: T.person ? 'free' : null, role: 'none', tools: 0, vet: false, damaged: false,
    where: 'map', x: 0, y: 0, carrier: null, colony: null, job: null,
    moves: 0, state: 'active', work: null, path: null, waited: false,
    goods: T.naval ? {} : null, sail: null, lastSea: null,
    ...props,
  };
  u.moves = maxMoves(u);
  S.units.push(u);
  if (u.where === 'map' && u.owner === 'player') reveal(u.x, u.y, sight(u));
  return u;
}

export function removeUnit(u) {
  for (const c of cargoUnits(u)) removeUnit(c);
  const i = S.units.indexOf(u);
  if (i >= 0) S.units.splice(i, 1);
}

export const isPerson = u => !!UNIT_TYPES[u.type].person;
export const isNaval = u => !!UNIT_TYPES[u.type].naval;
export const isMilitary = u => (isPerson(u) ? u.role === 'soldier' || u.role === 'dragoon' : !isNaval(u));
export const isVet = u => u.vet || (u.skill === 'veteran' && (u.role === 'soldier' || u.role === 'dragoon'));

export function maxMoves(u) {
  const T = UNIT_TYPES[u.type];
  return (T.person ? ROLES[u.role].moves : T.moves) * 3;
}

export function sight(u) {
  if (isPerson(u) && (u.role === 'scout' || u.role === 'dragoon')) return 2;
  return 1;
}

export function unitName(u) {
  const T = UNIT_TYPES[u.type];
  if (!T.person) return (u.damaged ? 'Damaged ' : '') + T.name;
  const skill = SKILLS[u.skill].name;
  if (u.role === 'none') return skill;
  if (u.skill === 'veteran' && u.role === 'soldier') return 'Veteran Soldier';
  if (u.skill === 'veteran' && u.role === 'dragoon') return 'Veteran Dragoon';
  if (u.skill === 'pioneer' && u.role === 'pioneer') return 'Hardy Pioneer';
  if (u.skill === 'scout' && u.role === 'scout') return 'Seasoned Scout';
  return `${ROLES[u.role].name} (${skill})`;
}

export const unitIcon = u => (isPerson(u) ? ROLES[u.role].icon : UNIT_TYPES[u.type].icon);

export function unitBadge(u) {
  if (!isPerson(u)) return '';
  if (u.vet) return '⭐';
  return skillBadge(u.skill);
}

export function movesLabel(u) {
  const whole = Math.floor(u.moves / 3), part = u.moves % 3;
  const frac = part ? `${part}/3` : '';
  const left = whole && frac ? `${whole} ${frac}` : whole ? `${whole}` : frac || '0';
  return `${left}/${maxMoves(u) / 3}`;
}

// --- ship cargo ---

export const cargoUnits = ship => S.units.filter(u => u.where === 'ship' && u.carrier === ship.id);
export const goodsSlots = goods => Object.values(goods || {}).reduce((s, n) => s + Math.ceil(n / 100), 0);
export const usedSlots = ship => cargoUnits(ship).length + goodsSlots(ship.goods);
export const freeSlots = ship => UNIT_TYPES[ship.type].holds - usedSlots(ship);

// How many units of a good still fit (topping up a partly filled hold first).
export function roomFor(ship, g) {
  const a = ship.goods[g] || 0;
  return (Math.ceil(a / 100) * 100 - a) + Math.max(0, freeSlots(ship)) * 100;
}

export function addCargo(ship, g, n) {
  ship.goods[g] = (ship.goods[g] || 0) + n;
  if (ship.goods[g] <= 0) delete ship.goods[g];
}

export function board(u, ship) {
  Object.assign(u, { where: 'ship', carrier: ship.id, colony: null, job: null, path: null, state: 'sentry', moves: 0 });
}

// --- equipment ---

export function equipmentOf(u) {
  const eq = { ...ROLES[u.role].equip };
  if (u.role === 'pioneer') eq.tools = u.tools;
  return eq;
}

// Goods needed (positive) or handed back (negative) to switch a unit to another role.
export function equipDelta(u, role, tools = PIONEER_TOOLS) {
  const cur = equipmentOf(u);
  const next = { ...ROLES[role].equip };
  if (role === 'pioneer') next.tools = tools;
  const delta = {};
  for (const g of new Set([...Object.keys(cur), ...Object.keys(next)])) {
    const d = (next[g] || 0) - (cur[g] || 0);
    if (d) delta[g] = d;
  }
  return delta;
}

export function setRole(u, role, tools = 0) {
  u.role = role;
  u.tools = role === 'pioneer' ? tools : 0;
  u.moves = Math.min(u.moves, maxMoves(u));
}
