// Game setup, the end-of-turn sequence and the big decisions (independence, victory, defeat).
import { START_GOLD, DECLARE_AT } from './data.js';
import { S, setState, notify, reveal, playerColonies, unitsAt, dateLabel } from './state.js';
import { generateMap } from './mapgen.js';
import { makeUnit, maxMoves, isNaval, isPerson, isMilitary, removeUnit } from './units.js';
import { processColony, nativeGifts, workers, rebelPercent, sol } from './colony.js';
import { initMarket, randomRecruit, immigration, marketTurn, progressSailing, sailToAmerica } from './europe.js';
import { progressWork, runPath } from './movement.js';
import { refTurn, refSize, refRemaining, refOnMap } from './ai.js';

export function newGame(seed = Math.floor(Math.random() * 2 ** 31)) {
  const map = generateMap(seed);
  setState({
    version: 1, seed, turn: 0, W: map.W, H: map.H, tiles: map.tiles, villages: map.villages,
    explored: new Uint8Array(map.W * map.H), units: [], colonies: [], nextId: 1, nextColonyId: 1,
    player: {
      name: 'English', gold: START_GOLD, tax: 0, sales: 0, crosses: 0, crossesNeeded: 24,
      recruitBase: 300, pool: [], declared: false, entry: map.start,
    },
    market: initMarket(), ref: null, log: [], over: null,
  });
  S.player.pool = [randomRecruit(), randomRecruit(), randomRecruit()];
  const { x, y } = map.start;
  const ship = makeUnit('caravel', { x, y });
  makeUnit('colonist', { skill: 'veteran', role: 'soldier', where: 'ship', carrier: ship.id, state: 'sentry' });
  makeUnit('colonist', { skill: 'pioneer', role: 'pioneer', tools: 100, where: 'ship', carrier: ship.id, state: 'sentry' });
  makeUnit('colonist', { where: 'europe' });
  reveal(x, y, 4);
  return S;
}

export const needsOrders = (u, ignoreWait = false) =>
  u.owner === 'player' && u.where === 'map' && u.moves > 0 && u.state === 'active' &&
  !u.path && !u.work && (ignoreWait || !u.waited);

// Next unit waiting for orders, cycling after `current`.
export function nextUnit(current = null) {
  let list = S.units.filter(u => needsOrders(u));
  if (!list.length) {
    list = S.units.filter(u => needsOrders(u, true));
    list.forEach(u => { u.waited = false; });
  }
  if (!list.length) return null;
  return list.find(u => current && u.id > current.id) || list[0];
}

export function endTurn() {
  if (S.over) return;
  for (const c of playerColonies()) processColony(c);
  for (const u of S.units.filter(u => u.work && u.owner === 'player')) progressWork(u);
  progressSailing();
  immigration();
  marketTurn();
  nativeGifts();
  refTurn();
  S.turn++;
  for (const u of S.units) {
    u.moves = maxMoves(u);
    u.waited = false;
  }
  for (const u of S.units.filter(u => u.owner === 'player' && u.path)) runPath(u);
  checkEnd();
}

export function score() {
  const pop = playerColonies().reduce((s, c) => s + workers(c).length, 0);
  return pop * 10 + rebelPercent() + Math.floor(S.player.gold / 100) + (S.over === 'won' ? 500 : 0);
}

function checkEnd() {
  if (!S.player.declared || S.over) return;
  if (!playerColonies().length) {
    S.over = 'lost';
    notify('All your colonies have fallen. The rebellion has been crushed.', { kind: 'bad', modal: true, title: 'Defeat' });
    return;
  }
  if (!refRemaining() && !refOnMap().length) {
    S.over = 'won';
    for (const c of S.colonies) c.owner = 'player';
    notify(`In ${dateLabel()} the last of the King's army surrenders. The colonies are free! Final score: ${score()}.`,
      { kind: 'good', modal: true, title: 'Independence!' });
  }
}

export const canDeclare = () => !S.player.declared && playerColonies().length > 0 && rebelPercent() >= DECLARE_AT;

export function declareIndependence() {
  const p = S.player;
  p.declared = true;
  p.tax = 0;
  S.ref = { pool: refSize(playerColonies().length), nextWave: S.turn + 2 };
  for (const u of S.units.filter(u => u.where === 'europe' && !isNaval(u))) removeUnit(u);
  for (const s of S.units.filter(u => isNaval(u) && (u.where === 'europe' || (u.where === 'sailing' && u.sail.to === 'europe')))) {
    sailToAmerica(s);
  }
  let promoted = 0;
  for (const c of playerColonies()) {
    if (sol(c) < 50) continue;
    for (const u of unitsAt(c.x, c.y)) {
      if (u.owner === 'player' && isPerson(u) && isMilitary(u) && !u.vet) { u.vet = true; promoted++; }
    }
  }
  const size = Object.values(S.ref.pool).reduce((s, n) => s + n, 0);
  notify(
    `You have declared independence! Europe is closed to you now. The King is sending ${size} units to crush the rebellion. ` +
    (promoted ? `${promoted} of your soldiers joined the Continental Army as veterans. ` : '') +
    'Defend your colonies and destroy every one of his soldiers.',
    { kind: 'good', modal: true, title: 'Declaration of Independence' },
  );
}
