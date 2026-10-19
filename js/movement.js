// Moving units around the map, plus everything that can happen when they arrive somewhere.
import { TERRAIN, SKILLS } from './data.js';
import {
  S, tile, inMap, isWater, explored, colonyAt, unitsAt, unitPos, reveal, notify, between, dist,
} from './state.js';
import {
  isPerson, isNaval, maxMoves, sight, unitName, freeSlots, board, makeUnit, removeUnit, setRole,
} from './units.js';
import { attack, attackStrength } from './combat.js';
import { addGoods } from './colony.js';
import { sailToEurope, takeRecruit } from './europe.js';
import { weighted } from './rng.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (msg, wait = false) => ({ ok: false, msg, wait });
const article = name => (/^[AEIOU]/.test(name) ? 'an' : 'a');

export const enemyAt = (u, x, y) => unitsAt(x, y).some(o => o.owner !== u.owner);

export function moveCost(u, fx, fy, tx, ty) {
  if (isNaval(u)) return 3;
  const t = tile(tx, ty), f = tile(fx, fy);
  if ((t.road || t.colony != null) && (f.road || f.colony != null)) return 1;
  return (t.forest ? 2 : TERRAIN[t.terrain].move) * 3;
}

// Cost of stepping onto (x, y) when planning a route, or Infinity when not allowed.
export function pathCost(u, fx, fy, x, y, isTarget) {
  if (!inMap(x, y)) return Infinity;
  if (u.owner === 'player' && !explored(x, y)) return Infinity;
  const t = tile(x, y);
  const c = colonyAt(x, y);
  const hostile = enemyAt(u, x, y) || (c && c.owner !== u.owner);
  if (isNaval(u)) {
    if (c) return c.owner === u.owner ? 3 : Infinity;
    if (!isWater(t) || hostile) return Infinity;
    return 3;
  }
  if (isWater(t)) return Infinity;
  if (t.village != null || hostile) return isTarget ? 3 : Infinity;
  const cost = moveCost(u, fx, fy, x, y);
  return t.rumor && !isTarget ? cost + 12 : cost;
}

export function tryMove(u, x, y) {
  const from = unitPos(u);
  if (!from || !inMap(x, y) || dist(from, { x, y }) !== 1) return fail('That is too far away.');
  if (u.work) return fail('This unit is busy working.');
  if (u.moves <= 0) return fail('No moves left this turn.', true);
  const t = tile(x, y);
  const c = colonyAt(x, y);
  const enemies = enemyAt(u, x, y);

  if (enemies || (c && c.owner !== u.owner)) {
    if (isNaval(u)) return fail("Ships can't attack.");
    if (u.where === 'ship') return fail('Land the unit first, then attack.');
    if (isWater(t)) return fail("Land units can't attack ships.");
    if (enemies && attackStrength(u) <= 0) return fail('This unit cannot attack.');
    if (!enemies && c.owner === 'player' && attackStrength(u) <= 0) return fail('This unit cannot attack.');
    attack(u, x, y);
    return ok({ stop: true });
  }

  if (isNaval(u)) {
    if (!isWater(t) && !c) return fail("Ships can't sail onto land.");
    return step(u, x, y);
  }
  if (isWater(t)) {
    const ship = unitsAt(x, y).find(s => s.owner === u.owner && isNaval(s) && freeSlots(s) > 0);
    if (!ship) return fail('There is no ship with free space there.');
    board(u, ship);
    return ok({ stop: true });
  }
  if (t.village != null) return visitVillage(u, S.villages[t.village]);
  return step(u, x, y);
}

function step(u, x, y) {
  const from = unitPos(u);
  const cost = moveCost(u, from.x, from.y, x, y);
  if (u.moves < cost && u.moves < maxMoves(u)) return fail('Not enough moves left this turn.', true);
  u.moves = Math.max(0, u.moves - cost);
  if (u.where === 'ship') { u.where = 'map'; u.carrier = null; }
  u.x = x;
  u.y = y;
  u.state = 'active';
  if (u.owner !== 'player') return ok();
  reveal(x, y, sight(u));
  const t = tile(x, y);
  if (t.rumor && !isNaval(u)) {
    t.rumor = false;
    exploreRumor(u);
    return ok({ stop: true });
  }
  return ok();
}

// Follow a planned route as far as this turn's moves allow.
export function runPath(u) {
  while (u.path && u.path.length && u.moves > 0 && S.units.includes(u)) {
    const [x, y] = u.path[0];
    const c = colonyAt(x, y);
    if (enemyAt(u, x, y) || (c && c.owner !== u.owner)) {
      if (u.owner === 'player') notify(`${unitName(u)}: the way is blocked.`, { kind: 'bad' });
      u.path = null;
      break;
    }
    const r = tryMove(u, x, y);
    if (!r.ok) {
      if (!r.wait) u.path = null;
      break;
    }
    if (u.path) u.path.shift();
    if (r.stop) u.path = null;
  }
  if (u.path && !u.path.length) {
    u.path = null;
    if (u.goEurope && u.where === 'map' && tile(u.x, u.y).highSeas) sailToEurope(u);
  }
  if (!u.path) u.goEurope = false;
}

// --- discoveries ---

function exploreRumor(u) {
  const scout = u.role === 'scout';
  const seasoned = scout && u.skill === 'scout';
  const name = unitName(u);
  const w = {
    nothing: scout ? 22 : 32, trinkets: 25, treasure: scout ? 14 : 7, colonist: 12, map: 12,
    fountain: S.player.declared ? 0 : scout ? 5 : 2, death: seasoned ? 1 : scout ? 3 : 8,
  };
  if (!isPerson(u)) { w.colonist = 0; w.death = 0; }
  switch (weighted(Math.random, w)) {
    case 'nothing':
      notify('The rumours prove to be nothing but tall tales.');
      break;
    case 'trinkets': {
      const n = between(40, 140) * (seasoned ? 2 : 1);
      S.player.gold += n;
      notify(`${name} finds a small cache of trinkets worth ${n} gold.`, { kind: 'good' });
      break;
    }
    case 'treasure': {
      const n = between(300, 900) * (seasoned ? 2 : 1);
      S.player.gold += n;
      notify(`${name} discovers the ruins of a lost city, full of treasure worth ${n} gold!`,
        { kind: 'good', modal: true, title: 'Lost city!' });
      break;
    }
    case 'colonist':
      makeUnit('colonist', { x: u.x, y: u.y });
      notify('You meet the survivors of a lost colony. A free colonist joins you.', { kind: 'good' });
      break;
    case 'map':
      reveal(u.x, u.y, 5);
      notify('Friendly natives share tales of the lands around you.', { kind: 'good' });
      break;
    case 'fountain':
      for (let i = 0; i < 4; i++) makeUnit('colonist', { where: 'europe', skill: takeRecruit() });
      notify('You found the Fountain of Youth! Four new colonists wait on the docks in Europe.',
        { kind: 'good', modal: true, title: 'Fountain of Youth' });
      break;
    case 'death':
      removeUnit(u);
      notify(`${name} vanished without a trace...`, { kind: 'bad', modal: true, title: 'Lost' });
      break;
  }
}

function visitVillage(u, v) {
  if (!isPerson(u) || u.owner !== 'player') return fail('Only colonists can visit native villages.');
  if (u.where === 'ship') return fail('Land the unit first.');
  if (u.role === 'scout') {
    u.moves = 0;
    speakToChief(u, v);
    return ok({ stop: true });
  }
  if (u.role !== 'none') return fail('Only scouts and unarmed colonists can visit villages.');
  const sk = SKILLS[u.skill];
  if (sk.expert || ['pioneer', 'scout', 'veteran'].includes(u.skill)) return fail(`Your ${sk.name} has nothing to learn here.`);
  if (u.skill === 'criminal') return fail('The natives refuse to teach a petty criminal.');
  if (v.taught) return fail(`The ${v.tribe} have already taught everything they can.`);
  u.skill = v.skill;
  v.taught = true;
  u.moves = 0;
  const skill = SKILLS[v.skill].name;
  notify(`Your colonist lived among the ${v.tribe} and is now ${article(skill)} ${skill}!`, { kind: 'good' });
  return ok({ stop: true });
}

function speakToChief(u, v) {
  if (v.spoken) {
    notify(`The ${v.tribe} chief greets you, but has nothing new to say.`);
    return;
  }
  v.spoken = true;
  const seasoned = u.skill === 'scout';
  const r = Math.random();
  if (r < (seasoned ? 0.01 : 0.04)) {
    removeUnit(u);
    notify(`The ${v.tribe} have executed your scout for trespassing!`, { kind: 'bad', modal: true, title: 'Scout lost' });
  } else if (r < 0.45) {
    reveal(v.x, v.y, 6);
    notify(`The ${v.tribe} chief shares tales of the nearby lands.`, { kind: 'good' });
  } else if (r < 0.85 || u.skill !== 'free') {
    const n = Math.floor(between(50, 150) * (seasoned ? 1.5 : 1));
    S.player.gold += n;
    notify(`The ${v.tribe} chief offers a gift of ${n} gold.`, { kind: 'good' });
  } else {
    u.skill = 'scout';
    notify(`Your scout learned the ways of the land from the ${v.tribe}. Now a Seasoned Scout!`, { kind: 'good' });
  }
}

// --- standing orders ---

export function workOptions(u) {
  if (u.role !== 'pioneer' || u.where !== 'map' || u.tools < 20 || u.owner !== 'player') return [];
  const t = tile(u.x, u.y);
  if (isWater(t)) return [];
  const hardy = u.skill === 'pioneer';
  const opts = [];
  if (t.forest) opts.push({ kind: 'clear', label: 'Clear forest', icon: '🪓', turns: hardy ? 2 : 4 });
  else if (!t.plowed && !['mountains', 'arctic'].includes(t.terrain)) opts.push({ kind: 'plow', label: 'Plow', icon: '🌾', turns: hardy ? 2 : 4 });
  if (!t.road && t.colony == null) opts.push({ kind: 'road', label: 'Road', icon: '🛤️', turns: hardy ? 1 : 2 });
  return opts;
}

export function startWork(u, kind) {
  const opt = workOptions(u).find(o => o.kind === kind);
  if (!opt) return;
  u.work = { kind, turns: opt.turns };
  u.moves = 0;
  u.path = null;
}

export function progressWork(u) {
  if (--u.work.turns > 0) return;
  const t = tile(u.x, u.y);
  const kind = u.work.kind;
  u.work = null;
  if (kind === 'clear') {
    t.forest = false;
    if (t.bonus === 'game') t.bonus = null;
    const c = S.colonies.find(k => k.owner === 'player' && dist(k, u) <= 1);
    if (c) {
      const n = u.skill === 'pioneer' ? 40 : 20;
      addGoods(c, 'lumber', n);
      notify(`Forest cleared. ${c.name} receives ${n} lumber.`, { kind: 'good' });
    }
  } else if (kind === 'plow') {
    t.plowed = true;
  } else {
    t.road = true;
  }
  u.tools -= 20;
  if (u.tools < 20) {
    setRole(u, 'none');
    notify(`${unitName(u)} has used up all tools.`);
  }
}
