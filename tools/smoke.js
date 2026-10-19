// Headless smoke test of the game rules: plays a few hundred turns with a dumb bot.
// Run with: node tools/smoke.js [games]
import { S, tile, isWater, neighbors, hooks, playerColonies } from '../js/state.js';
import { newGame, endTurn, declareIndependence, nextUnit } from '../js/game.js';
import { findPath } from '../js/path.js';
import { tryMove, runPath, workOptions, startWork } from '../js/movement.js';
import { canFound, foundColony, workers, computeColony, joinColony, equipFromColony } from '../js/colony.js';
import { cargoUnits, isNaval } from '../js/units.js';
import { sellGoods, buyGoods, recruit } from '../js/europe.js';
import { refRemaining, refOnMap } from '../js/ai.js';

let messages = 0;
hooks.message = () => { messages++; };

function assert(cond, msg) {
  if (!cond) throw new Error('Assertion failed: ' + msg);
}

function playGame(seed) {
  newGame(seed);
  S.explored.fill(1);
  const ship = S.units.find(isNaval);
  assert(cargoUnits(ship).length === 2, 'starting ship carries two units');
  assert(S.villages.length > 5, 'villages generated');
  assert(tile(ship.x, ship.y).highSeas, 'ship starts on high seas');

  // Sail to the coast and land everybody.
  const coast = [];
  for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) {
    const t = tile(x, y);
    if (isWater(t) && neighbors(x, y).some(([a, b]) => !isWater(tile(a, b)) && tile(a, b).village == null)) coast.push([x, y]);
  }
  coast.sort((a, b) => Math.hypot(a[0] - ship.x, a[1] - ship.y) - Math.hypot(b[0] - ship.x, b[1] - ship.y));
  ship.path = findPath(ship, ...coast[0]);
  assert(ship.path, 'route to the coast');
  for (let i = 0; i < 10 && ship.path; i++) { runPath(ship); if (ship.path) endTurn(); }
  const land = neighbors(ship.x, ship.y).find(([a, b]) => !isWater(tile(a, b)) && tile(a, b).village == null);
  for (const u of cargoUnits(ship)) {
    u.moves = 3;
    const r = tryMove(u, ...land);
    assert(r.ok || r.msg, 'disembark returns a result');
  }
  const soldier = S.units.find(u => u.role === 'soldier');
  if (soldier.where === 'map' && canFound(soldier)) foundColony(soldier);
  assert(S.colonies.length === 1, 'colony founded');
  const c = S.colonies[0];
  const pioneer = S.units.find(u => u.role === 'pioneer');
  if (pioneer && pioneer.where === 'map') {
    const opts = workOptions(pioneer);
    if (opts.length) startWork(pioneer, opts[0].kind);
  }

  // Trade a little in Europe.
  ship.goods.furs = 100;
  const before = S.player.gold;
  sellGoods(ship, 'furs');
  assert(S.player.gold > before, 'selling raises gold');
  assert(buyGoods(ship, 'tools', 100) === 100, 'buying tools');
  assert(recruit(0) === null, 'recruit colonist');

  for (let t = 0; t < 120; t++) {
    // Send docked colonists over occasionally.
    if (t % 15 === 0) {
      for (const u of S.units.filter(u => u.where === 'europe' && !isNaval(u))) joinColony(u, c);
    }
    let u = nextUnit();
    for (let k = 0; k < 20 && u; k++) { u.waited = true; u = nextUnit(); }
    endTurn();
    const r = computeColony(c);
    assert(Number.isFinite(r.net.food || 0), 'production is numeric');
  }
  const pop = workers(c).length;
  assert(pop >= 1, 'colony still alive');

  // Fortify a little and declare.
  for (let i = 0; i < 3; i++) {
    joinColony(S.units.find(u => u.where === 'europe') || S.units.find(u => u.where === 'colony'), c);
  }
  c.goods.muskets = 300;
  const guard = workers(c)[0];
  if (workers(c).length > 1) {
    guard.where = 'map'; guard.x = c.x; guard.y = c.y; guard.colony = null; guard.job = null;
    equipFromColony(guard, c, 'soldier');
  }
  c.liberty = 99999;
  declareIndependence();
  assert(refRemaining() > 0, 'REF assembled');
  let turns = 0;
  while (!S.over && turns < 200) { endTurn(); turns++; }
  assert(S.over || refOnMap().length || refRemaining(), 'war resolved or ongoing');

  const json = JSON.stringify({ ...S, explored: S.explored.join('') });
  assert(JSON.parse(json).units.length === S.units.length, 'state serialises');
  return { seed, pop, result: S.over || 'ongoing', turns: S.turn, colonies: playerColonies().length, units: S.units.length };
}

const games = Number(process.argv[2] || 5);
for (let i = 0; i < games; i++) {
  const r = playGame(1000 + i * 7919);
  console.log(JSON.stringify(r));
}
console.log(`ok, ${messages} messages`);
