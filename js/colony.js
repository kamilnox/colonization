// Colonies: founding, jobs, production and what gets built.
import {
  TERRAIN, BONUS, SKILLS, BUILDINGS, BUILDABLE_UNITS, BUILD_PRIORITY, GOOD_KEYS, GOODS, UNIT_TYPES,
  LIBERTY_PER_REBEL, FOOD_TO_GROW, BASE_STORAGE, COLONY_NAMES, PIONEER_TOOLS, iconOf, nameOf,
} from './data.js';
import {
  S, tile, isWater, inMap, neighbors, unitsAt, reveal, notify, isCoastal, playerColonies, rnd,
} from './state.js';
import { makeUnit, removeUnit, equipmentOf, equipDelta, setRole, isPerson } from './units.js';

export const workers = c => S.units.filter(u => u.where === 'colony' && u.colony === c.id);
export const colonyCoastal = c => isCoastal(c.x, c.y);
export const storageCap = c => BASE_STORAGE + (c.buildings.warehouse ? BUILDINGS.warehouse.storage : 0);

export function sol(c) {
  const pop = workers(c).length;
  return pop ? Math.min(100, Math.floor((c.liberty * 100) / (pop * LIBERTY_PER_REBEL))) : 0;
}
const solBonus = c => { const s = sol(c); return s >= 100 ? 2 : s >= 50 ? 1 : 0; };

export function fortification(c) {
  if (c.buildings.fort) return BUILDINGS.fort.defense;
  if (c.buildings.stockade) return BUILDINGS.stockade.defense;
  return 0;
}

// Share of all colonists who support independence.
export function rebelPercent() {
  let pop = 0, rebels = 0;
  for (const c of playerColonies()) {
    const p = workers(c).length;
    pop += p;
    rebels += Math.min(p, c.liberty / LIBERTY_PER_REBEL);
  }
  return pop ? Math.floor((rebels * 100) / pop) : 0;
}

// --- tiles ---

export function tileYield(t, good, skill = null) {
  const terrain = TERRAIN[t.terrain];
  const base = t.forest && terrain.forest ? terrain.forest.prod : terrain.prod;
  let n = base[good] || 0;
  if (!n) return 0;
  const bonus = t.bonus && BONUS[t.bonus];
  if (bonus && bonus.good === good && (t.bonus !== 'game' || t.forest)) n += bonus.amount;
  if (good === 'food' && t.plowed && !t.forest && !isWater(t)) n += 1;
  const sk = skill && SKILLS[skill];
  if (sk && sk.expert === good && !(sk.land && isWater(t)) && !(sk.sea && !isWater(t))) n *= 2;
  return n;
}

export const tileGoods = t => {
  const terrain = TERRAIN[t.terrain];
  return Object.keys(t.forest && terrain.forest ? terrain.forest.prod : terrain.prod);
};

// The colony tile itself gives food plus one cash crop (or furs/ore) for free.
function centerSecondary(t) {
  let best = null;
  for (const g of tileGoods(t)) {
    if (g === 'food' || g === 'lumber' || g === 'silver') continue;
    const n = tileYield(t, g);
    if (n > 0 && (!best || (g !== 'ore' && best.good === 'ore') || n > best.n)) best = { good: g, n };
  }
  return best;
}

export function tileWorker(x, y) {
  return S.units.find(u => u.where === 'colony' && u.job && u.job.kind === 'tile' && u.job.x === x && u.job.y === y) || null;
}

export function canWorkTile(c, x, y, who = null) {
  if (!inMap(x, y) || Math.max(Math.abs(x - c.x), Math.abs(y - c.y)) !== 1) return false;
  const t = tile(x, y);
  if (t.village != null || t.colony != null) return false;
  if (isWater(t) && !c.buildings.docks) return false;
  const w = tileWorker(x, y);
  if (w && w !== who) return false;
  return !unitsAt(x, y).some(u => u.owner !== c.owner);
}

function goodWeight(g, foodNeeded) {
  if (g === 'food') return foodNeeded ? 2.5 : 1;
  if (g === 'lumber') return 0.8;
  if (g === 'ore') return 0.7;
  return GOODS[g] ? 1 : 0;
}

export function bestGoodFor(t, skill, foodNeeded = false) {
  let best = null, score = 0;
  for (const g of tileGoods(t)) {
    const s = tileYield(t, g, skill) * goodWeight(g, foodNeeded);
    if (s > score) { score = s; best = g; }
  }
  return best;
}

// Pick a sensible job for a colonist who just joined.
export function autoJob(c, u) {
  const r = computeColony(c);
  const foodNeeded = (r.net.food || 0) < 2;
  const sk = SKILLS[u.skill];
  const bldgFor = g => Object.keys(BUILDINGS).find(b => BUILDINGS[b].out === g && c.buildings[b]);
  if (sk.expert && !foodNeeded) {
    const b = bldgFor(sk.expert);
    if (b && buildingWorkers(c, b).length < 3) return { kind: 'bldg', b };
  }
  let best = null, bestScore = 0;
  for (const [x, y] of neighbors(c.x, c.y)) {
    if (!canWorkTile(c, x, y, u)) continue;
    const t = tile(x, y);
    const g = sk.expert && !foodNeeded && tileYield(t, sk.expert, u.skill) > 0 ? sk.expert : bestGoodFor(t, u.skill, foodNeeded);
    if (!g) continue;
    const score = tileYield(t, g, u.skill) * goodWeight(g, foodNeeded) * (g === sk.expert ? 2 : 1);
    if (score > bestScore) { bestScore = score; best = { kind: 'tile', x, y, good: g }; }
  }
  if (best) return best;
  const lumber = (c.goods.lumber || 0) + (r.net.lumber || 0);
  if (lumber > 0 && buildingWorkers(c, 'carpenter').length < 3) return { kind: 'bldg', b: 'carpenter' };
  return { kind: 'bldg', b: 'townhall' };
}

export const buildingWorkers = (c, b) => workers(c).filter(w => w.job && w.job.kind === 'bldg' && w.job.b === b);

function buildingRate(skill, out) {
  const sk = SKILLS[skill];
  if (sk.expert === out) return 6;
  return sk.factory || 3;
}

// Full production report for a colony; used both by the turn and by the colony screen.
export function computeColony(c) {
  const ws = workers(c);
  const bonus = solBonus(c);
  const prod = {}, cons = {}, out = {};
  const add = (o, g, n) => { if (n) o[g] = (o[g] || 0) + n; };

  const ct = tile(c.x, c.y);
  const food = tileYield(ct, 'food');
  add(prod, 'food', food ? food + bonus : 0);
  const sec = centerSecondary(ct);
  if (sec) add(prod, sec.good, sec.n + bonus);
  const center = { food: food ? food + bonus : 0, sec: sec ? { good: sec.good, n: sec.n + bonus } : null };

  for (const w of ws) {
    if (!w.job || w.job.kind !== 'tile') continue;
    let n = tileYield(tile(w.job.x, w.job.y), w.job.good, w.skill);
    if (n > 0) n += bonus;
    add(prod, w.job.good, n);
    out[w.id] = { good: w.job.good, n };
  }
  add(cons, 'food', ws.length * 2);

  for (const [b, B] of Object.entries(BUILDINGS)) {
    if (!c.buildings[b] || !B.out) continue;
    const inside = ws.filter(w => w.job && w.job.kind === 'bldg' && w.job.b === b);
    const boost = Object.entries(BUILDINGS).some(([k, o]) => o.boost === b && c.buildings[k]) ? 1.5 : 1;
    const rates = inside.map(w => Math.floor((buildingRate(w.skill, B.out) + bonus) * boost));
    let desired = rates.reduce((s, n) => s + n, 0);
    if (b === 'townhall') desired += 1;
    let actual = desired;
    if (B.in) {
      const avail = (c.goods[B.in] || 0) + (prod[B.in] || 0) - (cons[B.in] || 0);
      actual = Math.max(0, Math.min(desired, avail));
      add(cons, B.in, actual);
    }
    add(prod, B.out, actual);
    inside.forEach((w, i) => {
      out[w.id] = { good: B.out, n: desired ? Math.floor((rates[i] * actual) / desired) : 0 };
    });
  }
  for (const [b, B] of Object.entries(BUILDINGS)) if (B.crosses && c.buildings[b]) add(prod, 'crosses', B.crosses);

  const net = {};
  for (const g of new Set([...Object.keys(prod), ...Object.keys(cons)])) net[g] = (prod[g] || 0) - (cons[g] || 0);
  return { prod, cons, net, out, center, pop: ws.length, bonus };
}

// --- founding and joining ---

export function canFound(u) {
  if (!isPerson(u) || u.where !== 'map' || u.owner !== 'player' || u.work) return false;
  const t = tile(u.x, u.y);
  if (isWater(t) || t.colony != null || t.village != null) return false;
  return !neighbors(u.x, u.y).some(([x, y]) => tile(x, y).colony != null);
}

function nextColonyName() {
  const used = new Set(S.colonies.map(c => c.name));
  return COLONY_NAMES.find(n => !used.has(n)) || `Colony ${S.colonies.length + 1}`;
}

export function foundColony(u) {
  const t = tile(u.x, u.y);
  const buildings = {};
  for (const [b, B] of Object.entries(BUILDINGS)) if (B.start) buildings[b] = true;
  const c = {
    id: S.nextColonyId++, name: nextColonyName(), x: u.x, y: u.y, owner: 'player',
    goods: {}, hammers: 0, liberty: 0, buildings, build: null, founded: S.turn, warned: {},
  };
  S.colonies.push(c);
  t.colony = c.id;
  t.road = true;
  t.rumor = false;
  joinColony(u, c);
  c.build = defaultBuild(c);
  reveal(c.x, c.y, 2);
  notify(`${c.name} has been founded!`, { kind: 'good' });
  return c;
}

export function addGoods(c, g, n) {
  c.goods[g] = (c.goods[g] || 0) + n;
  if (c.goods[g] <= 0) delete c.goods[g];
}

export function joinColony(u, c) {
  for (const [g, n] of Object.entries(equipmentOf(u))) if (n) addGoods(c, g, n);
  setRole(u, 'none');
  Object.assign(u, { where: 'colony', colony: c.id, carrier: null, path: null, work: null, state: 'active', moves: 0 });
  u.job = null;
  u.job = autoJob(c, u);
}

// Moves a worker out of the colony onto the colony tile as a normal unit.
export function leaveColony(u) {
  const c = S.colonies.find(k => k.id === u.colony);
  Object.assign(u, { where: 'map', x: c.x, y: c.y, colony: null, job: null, state: 'active', moves: 0 });
}

// Equip a unit standing in (or next to) the colony from the colony warehouse.
export function equipFromColony(u, c, role) {
  let tools = PIONEER_TOOLS;
  if (role === 'pioneer') {
    const have = (c.goods.tools || 0) + (u.role === 'pioneer' ? u.tools : 0);
    tools = Math.min(PIONEER_TOOLS, Math.floor(have / 20) * 20);
    if (tools < 20) return 'Not enough tools (need 20).';
  }
  const delta = equipDelta(u, role, tools);
  for (const [g, n] of Object.entries(delta)) {
    if (n > 0 && (c.goods[g] || 0) < n) return `Not enough ${nameOf(g).toLowerCase()} (need ${n}).`;
  }
  for (const [g, n] of Object.entries(delta)) addGoods(c, g, -n);
  setRole(u, role, tools);
  return null;
}

// --- building ---

export function buildCost(item) {
  return (BUILDINGS[item] || BUILDABLE_UNITS[item]).cost;
}

export function buildName(item) {
  return BUILDINGS[item] ? BUILDINGS[item].name : UNIT_TYPES[item].name;
}

export function buildOptions(c) {
  const pop = workers(c).length;
  const opts = [];
  for (const [b, B] of Object.entries(BUILDINGS)) {
    if (B.start || c.buildings[b]) continue;
    if (B.coastal && !colonyCoastal(c)) continue;
    let reason = '';
    if (B.requires && !c.buildings[B.requires]) reason = `Needs ${BUILDINGS[B.requires].name}`;
    else if (pop < B.pop) reason = `Needs ${B.pop} colonists`;
    opts.push({ id: b, name: B.name, icon: B.icon, cost: B.cost, desc: B.desc || '', reason });
  }
  for (const [k, U] of Object.entries(BUILDABLE_UNITS)) {
    let reason = '';
    if (U.requires && !c.buildings[U.requires]) reason = `Needs ${BUILDINGS[U.requires].name}`;
    else if (pop < U.pop) reason = `Needs ${U.pop} colonists`;
    opts.push({ id: k, name: buildName(k), icon: UNIT_TYPES[k].icon, cost: U.cost, desc: U.desc, reason });
  }
  return opts;
}

export function defaultBuild(c) {
  const opts = buildOptions(c).filter(o => !o.reason);
  // An inland colony first needs a wagon train to get its goods to the coast.
  const hasWagon = S.units.some(u => u.owner === c.owner && u.type === 'wagon');
  if (!colonyCoastal(c) && !hasWagon && opts.some(o => o.id === 'wagon')) return 'wagon';
  for (const b of BUILD_PRIORITY) if (opts.some(o => o.id === b)) return b;
  return null;
}

// --- end of turn ---

export function processColony(c) {
  const r = computeColony(c);
  for (const g of GOOD_KEYS) if (r.net[g]) addGoods(c, g, r.net[g]);
  c.hammers += r.prod.hammers || 0;
  c.liberty += r.prod.bells || 0;
  S.player.crosses += r.prod.crosses || 0;

  const horses = c.goods.horses || 0;
  if (horses >= 2 && (r.net.food || 0) > 0) {
    addGoods(c, 'horses', Math.min(Math.max(1, Math.floor(horses / 25)), Math.floor(r.net.food / 2) || 1));
  }

  if (c.build) {
    const cost = buildCost(c.build);
    const needPop = (BUILDINGS[c.build] || BUILDABLE_UNITS[c.build]).pop || 0;
    if (c.hammers >= cost.hammers && workers(c).length >= needPop) {
      if ((c.goods.tools || 0) >= (cost.tools || 0)) {
        c.hammers -= cost.hammers;
        if (cost.tools) addGoods(c, 'tools', -cost.tools);
        const done = c.build;
        if (BUILDINGS[done]) c.buildings[done] = true;
        else makeUnit(done, { x: c.x, y: c.y });
        notify(`${c.name} completed: ${buildName(done)}`, { kind: 'good' });
        c.warned.tools = false;
        c.build = defaultBuild(c);
      } else if (!c.warned.tools) {
        c.warned.tools = true;
        notify(`${c.name} needs ${cost.tools} tools to finish ${buildName(c.build)}.`, { kind: 'bad' });
      }
    }
  }

  if ((c.goods.food || 0) >= FOOD_TO_GROW) {
    addGoods(c, 'food', -FOOD_TO_GROW);
    const u = makeUnit('colonist', { where: 'colony', colony: c.id });
    u.job = autoJob(c, u);
    notify(`${c.name} has grown: a new colonist was born.`, { kind: 'good' });
  }
  const food = c.goods.food || 0;
  if (food <= 0 && (r.net.food || 0) < 0) {
    const ws = workers(c);
    if (ws.length > 1) {
      const victim = ws.find(w => w.skill === 'free' || w.skill === 'servant' || w.skill === 'criminal') || ws[ws.length - 1];
      removeUnit(victim);
      notify(`Famine in ${c.name}! A colonist has starved.`, { kind: 'bad', modal: true, title: 'Famine' });
    }
    delete c.goods.food;
  } else if ((r.net.food || 0) < 0 && food / -r.net.food < 4 && !c.warned.food) {
    c.warned.food = true;
    notify(`${c.name} is running out of food!`, { kind: 'bad' });
  } else if ((r.net.food || 0) >= 0) {
    c.warned.food = false;
  }

  const cap = storageCap(c);
  for (const g of GOOD_KEYS) {
    if (g === 'food' || (c.goods[g] || 0) <= cap) continue;
    const lost = c.goods[g] - cap;
    c.goods[g] = cap;
    notify(`${c.name}: warehouse full, ${lost} ${nameOf(g).toLowerCase()} ${iconOf(g)} spoiled.`, { kind: 'bad' });
  }
}

// Natives sometimes bring gifts to nearby colonies.
export function nativeGifts() {
  for (const v of S.villages) {
    if (Math.random() > 0.015) continue;
    const near = playerColonies().filter(c => Math.max(Math.abs(c.x - v.x), Math.abs(c.y - v.y)) <= 6);
    if (!near.length) continue;
    const c = near[rnd(near.length)];
    const g = ['food', 'furs', 'cotton', 'tobacco', 'sugar'][rnd(5)];
    const n = 20 + rnd(41);
    addGoods(c, g, n);
    notify(`The ${v.tribe} bring a gift of ${n} ${nameOf(g).toLowerCase()} ${iconOf(g)} to ${c.name}.`, { kind: 'good' });
  }
}

export function colonyUnitsOutside(c) {
  return unitsAt(c.x, c.y).filter(u => u.owner === c.owner);
}

