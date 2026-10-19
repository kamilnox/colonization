// Battles between units, and capturing colonies.
import { UNIT_TYPES, ROLES, TERRAIN, FOREST_DEF } from './data.js';
import { tile, colonyAt, unitsAt, notify, chance, neighbors, isWater } from './state.js';
import { isPerson, isNaval, isMilitary, isVet, unitName, removeUnit, setRole } from './units.js';
import { fortification, addGoods } from './colony.js';

export function attackStrength(u) {
  const T = UNIT_TYPES[u.type];
  let a = isPerson(u) ? ROLES[u.role].att : u.damaged ? 3 : T.att || 0;
  if (a && isVet(u)) a *= 1.5;
  return a;
}

export function defenseStrength(u, x, y) {
  const T = UNIT_TYPES[u.type];
  const base = isPerson(u) ? ROLES[u.role].def : u.damaged ? 2 : T.def || 1;
  let bonus = isVet(u) ? 0.5 : 0;
  const c = colonyAt(x, y);
  if (c) {
    bonus += 0.5 + fortification(c);
    if (u.type === 'artillery') bonus += 0.75;
  } else {
    const t = tile(x, y);
    if (u.state === 'fortified') bonus += 0.5;
    if (t.forest) bonus += FOREST_DEF;
    bonus += TERRAIN[t.terrain].def || 0;
    if (u.type === 'artillery') bonus -= 0.75;
  }
  return Math.max(0.5, base * (1 + bonus));
}

export function pickDefender(attacker, x, y) {
  const enemies = unitsAt(x, y).filter(u => u.owner !== attacker.owner && !isNaval(u));
  if (!enemies.length) return null;
  return enemies.reduce((best, u) => (defenseStrength(u, x, y) > defenseStrength(best, x, y) ? u : best));
}

// Colonists defending their colony when no soldier is left.
function militiaStrength(c) {
  const armed = (c.goods.muskets || 0) >= 50;
  return { armed, d: (armed ? 2 : 1) * (1.5 + fortification(c)) };
}

// Odds the attacker wins, for showing in the UI before attacking.
export function attackOdds(u, x, y) {
  const A = attackStrength(u);
  const def = pickDefender(u, x, y);
  const c = colonyAt(x, y);
  let D;
  if (def) D = defenseStrength(def, x, y);
  else if (c && c.owner === 'player') D = militiaStrength(c).d;
  else return 1;
  return A / (A + D);
}

function loseBattle(u, x, y) {
  const c = colonyAt(x, y);
  if (isPerson(u)) {
    if (u.role === 'dragoon') { setRole(u, 'soldier'); return 'lost its horses'; }
    if (u.role === 'soldier') {
      if (c && c.owner === u.owner && (c.goods.muskets || 0) >= 50) {
        addGoods(c, 'muskets', -50);
        return 'was disarmed, but took new muskets from the colony stores';
      }
      setRole(u, 'none');
      u.vet = false;
      return 'was disarmed';
    }
    removeUnit(u);
    return 'was killed';
  }
  if (u.type === 'artillery') {
    if (u.damaged) { removeUnit(u); return 'was destroyed'; }
    u.damaged = true;
    return 'was damaged';
  }
  if (u.type === 'cavalry') {
    u.type = 'regular';
    u.moves = Math.min(u.moves, 3);
    return 'lost its horses';
  }
  removeUnit(u);
  return 'was destroyed';
}

function promote(u) {
  if (u.owner === 'player' && isPerson(u) && isMilitary(u) && !isVet(u) && chance(0.2)) {
    u.vet = true;
    notify(`${unitName(u)} has been promoted to veteran ⭐`, { kind: 'good' });
  }
}

export function captureColony(c, u) {
  const prev = c.owner;
  c.owner = u.owner;
  for (const o of unitsAt(c.x, c.y).filter(k => k.owner === prev)) {
    if (isNaval(o)) {
      const spot = neighbors(c.x, c.y).find(([nx, ny]) =>
        isWater(tile(nx, ny)) && !unitsAt(nx, ny).some(k => k.owner !== prev));
      if (spot) { o.x = spot[0]; o.y = spot[1]; continue; }
    }
    removeUnit(o);
  }
  if (u.where === 'map') { u.x = c.x; u.y = c.y; }
  if (u.owner === 'player') {
    notify(`${c.name} has been liberated!`, { kind: 'good', modal: true, title: 'Colony liberated' });
  } else {
    notify(`${c.name} has fallen to the King's army!`, { kind: 'bad', modal: true, title: 'Colony lost' });
  }
}

export function attack(u, x, y) {
  const c = colonyAt(x, y);
  const def = pickDefender(u, x, y);
  if (!def && c && c.owner !== 'player') { captureColony(c, u); u.moves = 0; return { ok: true }; }

  const A = attackStrength(u);
  let D, defName, militia = null;
  if (def) {
    D = defenseStrength(def, x, y);
    defName = unitName(def);
  } else if (c) {
    militia = militiaStrength(c);
    D = militia.d;
    defName = militia.armed ? `the militia of ${c.name}` : `the colonists of ${c.name}`;
  } else {
    return { ok: false, msg: 'Nothing to attack there.' };
  }
  u.moves = 0;
  u.state = 'active';
  u.path = null;

  const won = Math.random() < A / (A + D);
  const name = unitName(u);
  let text;
  if (won) {
    if (def) {
      text = `${name} defeated ${defName}, which ${loseBattle(def, x, y)}.`;
    } else {
      if (militia.armed) addGoods(c, 'muskets', -50);
      text = `${name} overcame ${defName}.`;
    }
    promote(u);
  } else {
    text = `${name} attacked ${defName} and lost: it ${loseBattle(u, u.x, u.y)}.`;
    if (def) promote(def);
  }
  const good = (u.owner === 'player') === won;
  notify(text, { kind: good ? 'good' : 'bad' });
  if (won && !def && c) captureColony(c, u);
  return { ok: true };
}
