// Plain-language descriptions of where units are and what they are doing.
import { BUILDINGS, TERRAIN, iconOf } from '../data.js';
import { tile, colonyAt, unitById, colonyById, isWater } from '../state.js';
import { unitName, isNaval, hasHold, cargoUnits } from '../units.js';

export function terrainName(x, y) {
  const t = tile(x, y);
  const T = TERRAIN[t.terrain];
  return t.forest && T.forest ? T.forest.name : T.name;
}

const VERB = {
  furs: 'trapping furs', lumber: 'cutting lumber', ore: 'mining ore', silver: 'mining silver',
  sugar: 'growing sugar', tobacco: 'growing tobacco', cotton: 'growing cotton',
};

export function jobText(u) {
  if (!u.job) return 'no job';
  if (u.job.kind === 'bldg') return `${BUILDINGS[u.job.b].icon} in the ${BUILDINGS[u.job.b].name}`;
  const { x, y, good } = u.job;
  const verb = good === 'food' ? (isWater(tile(x, y)) ? 'fishing' : 'farming') : VERB[good] || good;
  return `${iconOf(good)} ${verb} (${terrainName(x, y).toLowerCase()})`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Where a unit is, in plain words.
export function whereText(u) {
  switch (u.where) {
    case 'colony': return `Working in ${colonyById(u.colony).name}: ${jobText(u)}`;
    case 'ship': {
      const s = unitById(u.carrier);
      const at = s.where === 'europe' ? ' in Europe' : s.where === 'sailing' ? ' at sea' : '';
      return `Passenger on the ${unitName(s)}${at}`;
    }
    case 'europe': return isNaval(u) ? 'In port in Europe' : 'Waiting on the docks in Europe';
    case 'sailing': return `Sailing to ${u.sail.to === 'europe' ? 'Europe' : 'the New World'}, ${plural(u.sail.turns, 'turn')} left`;
    default: {
      const c = colonyAt(u.x, u.y);
      if (c && isNaval(u)) return `In port at ${c.name}`;
      if (c) return hasHold(u) ? `Parked at ${c.name}` : `Standing outside ${c.name} (not working there)`;
      return `On the map, ${terrainName(u.x, u.y).toLowerCase()}`;
    }
  }
}

const WORK = { clear: 'clearing forest', plow: 'plowing', road: 'building a road' };

// What a unit is doing this turn.
export function stateText(u) {
  if (u.work) return `Busy ${WORK[u.work.kind]}, ${plural(u.work.turns, 'turn')} left`;
  if (u.state === 'fortified') return 'Fortified';
  if (u.state === 'sentry') return 'Sleeping';
  if (u.path) return u.goEurope ? 'Heading for Europe' : 'On its way';
  if (u.where !== 'map' && u.where !== 'ship') return '';
  if (u.moves <= 0) return 'Done for this turn';
  if (u.waited) return 'Skipped this turn';
  const whole = Math.floor(u.moves / 3);
  return whole ? `${plural(whole, 'move')} left` : 'Part of a move left';
}

export function cargoText(ship) {
  const people = cargoUnits(ship).length;
  const goods = Object.entries(ship.goods || {}).map(([g, n]) => `${iconOf(g)}${n}`);
  const parts = [];
  if (people) parts.push(plural(people, 'passenger'));
  if (goods.length) parts.push(goods.join(' '));
  return parts.length ? parts.join(', ') : 'empty';
}
