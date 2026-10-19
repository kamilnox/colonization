// The goal banner: looks at the game and suggests one sensible next step.
import { GOODS, GOOD_KEYS, DECLARE_AT } from '../data.js';
import { S, playerColonies, dist } from '../state.js';
import { isNaval, isPerson, cargoUnits, unitName } from '../units.js';
import { workers, computeColony, rebelPercent, buildingWorkers, colonyCoastal } from '../colony.js';
import { canLandFrom } from '../movement.js';
import { refRemaining, refOnMap } from '../ai.js';
import { needsOrders } from '../game.js';

const SELLABLE = GOOD_KEYS.filter(g => !['food', 'horses', 'tools', 'muskets'].includes(g));

// Returns { icon, text, more?, focus? } where focus is { unit } | { colony } | { europe }.
export function advice() {
  const p = S.player;
  const mine = S.units.filter(u => u.owner === 'player');
  const ships = mine.filter(isNaval);
  const cols = playerColonies();

  if (S.over === 'won') return { icon: '🎉', text: 'You won independence! Start a new game from the ☰ menu.' };
  if (S.over) return { icon: '💀', text: 'The rebellion failed. Start a new game from the ☰ menu.' };
  if (p.declared) {
    return {
      icon: '⚔️', text: `War! ${refRemaining() + refOnMap().length} of the King's units are left.`,
      more: 'Keep soldiers on your colony tiles and fortify them. Attack enemies standing in the open with dragoons and artillery. You win when every one of the King\'s units is gone.',
    };
  }

  if (!cols.length) {
    const founder = mine.find(u => isPerson(u) && u.where === 'map');
    if (founder) {
      return {
        icon: '🏠', text: 'Found your first colony: pick a colonist on land and tap 🏠 Found colony.',
        more: 'Good spots are on the coast (so ships can dock) with plains, grassland or forest around. The colony works the 8 tiles around it.',
        focus: { unit: founder.id },
      };
    }
    const carrier = ships.find(s => s.where === 'map' && cargoUnits(s).length);
    if (carrier && canLandFrom(carrier)) {
      return {
        icon: '⛰️', text: 'Go ashore: tap a passenger in the Waiting row at the bottom, then a bright land tile.',
        focus: { unit: cargoUnits(carrier)[0].id },
      };
    }
    if (carrier) {
      return {
        icon: '⛵', text: 'Sail west to the coast: tap a bright sea tile to move the ship.',
        more: 'Bright tiles show where the selected unit can go this turn. Tap further away to plan a longer trip, then tap Go.',
        focus: { unit: carrier.id },
      };
    }
    return { icon: '🧭', text: 'Bring colonists to the New World and found a colony.' };
  }

  for (const c of cols) {
    if ((computeColony(c).net.food || 0) < 0) {
      return { icon: '🌽', text: `${c.name} is short of food. Move a colonist to a food field.`, focus: { colony: c.id } };
    }
  }

  const passenger = mine.find(u => u.where === 'ship' && needsOrders(u));
  if (passenger) {
    return {
      icon: '⛰️', text: `${unitName(passenger)} can go ashore: tap it in the Waiting row, then a bright land tile.`,
      focus: { unit: passenger.id },
    };
  }

  const inEurope = ships.find(s => s.where === 'europe');
  if (inEurope) {
    return {
      icon: '🏰', text: `Your ${unitName(inEurope)} is in Europe. Board colonists, trade, then Sail west.`,
      focus: { europe: true },
    };
  }
  const docks = mine.filter(u => u.where === 'europe' && !isNaval(u));
  const fetching = ships.some(s => s.goEurope || (s.where === 'sailing' && s.sail.to === 'europe'));
  if (docks.length && !fetching) {
    const ship = ships.find(s => s.where === 'map');
    return {
      icon: '⚓', text: `${docks.length} colonist${docks.length > 1 ? 's wait' : ' waits'} in Europe. Select your ship and tap 🧭 To Europe.`,
      more: 'Ships reach Europe from the dark blue high seas. The crossing takes 3 turns each way.',
      focus: ship ? { unit: ship.id } : { europe: true },
    };
  }

  const c0 = cols[0];
  if (!cols.some(c => (computeColony(c).prod.hammers || 0) > 0) && workers(c0).length >= 2) {
    const text = buildingWorkers(c0, 'carpenter').length
      ? `${c0.name} has no lumber. Put a colonist on a forest tile to cut wood.`
      : `Start building in ${c0.name}: put a colonist in the Carpenter's House.`;
    return {
      icon: '🔨', text,
      more: 'The carpenter turns lumber into hammers, and hammers build docks, stockades and more. Lumber comes from colonists working forest tiles.',
      focus: { colony: c0.id },
    };
  }

  const pioneer = mine.find(u => u.role === 'pioneer' && u.where === 'map' && !u.work && u.state === 'active' &&
    cols.some(c => dist(c, u) <= 2));
  if (pioneer) {
    return {
      icon: '👷', text: 'Your pioneer is free: clear forest, plow fields or build roads near a colony.',
      more: 'Plowing adds food. Clearing a forest next to a colony gives it lumber. Roads make moving faster.',
      focus: { unit: pioneer.id },
    };
  }

  const wagon = mine.find(u => u.type === 'wagon');
  for (const c of cols) {
    const g = SELLABLE.find(k => (c.goods[k] || 0) >= 90);
    if (!g) continue;
    const what = `${c.name} has ${c.goods[g]} ${GOODS[g].name.toLowerCase()}.`;
    if (colonyCoastal(c)) {
      return { icon: GOODS[g].icon, text: `${what} Load them on a ship and sell them in Europe.`, focus: { colony: c.id } };
    }
    if (wagon) {
      return {
        icon: '🐂', text: `${what} Drive your wagon train there, load them and bring them to a colony on the coast.`,
        focus: { unit: wagon.id },
      };
    }
    return {
      icon: '🐂', text: `${what} It is inland, so build a Wagon Train there to carry goods to the coast.`,
      more: 'Open the colony, tap Change under Construction and pick Wagon Train. It needs 40 hammers.',
      focus: { colony: c.id },
    };
  }

  const pop = cols.reduce((s, c) => s + workers(c).length, 0);
  if (pop < 6) {
    return {
      icon: '👥', text: 'Grow your colonies: recruit colonists in Europe and keep food above zero.',
      more: 'Every 200 stored food becomes a new colonist. Immigrants also show up on the docks in Europe from time to time.',
    };
  }
  if (!cols.some(c => c.buildings.stockade)) {
    return { icon: '🧱', text: 'Build a stockade so a colony can defend itself.', focus: { colony: c0.id } };
  }
  const reb = rebelPercent();
  if (reb < DECLARE_AT) {
    return {
      icon: '🔔', text: `Liberty: ${reb}% of the ${DECLARE_AT}% needed. Put colonists in a Town Hall to make bells.`,
      more: 'Elder Statesmen make twice as many bells. A Printing Press adds 50%.',
      focus: { colony: c0.id },
    };
  }
  return {
    icon: '🗽', text: 'You can declare independence from the ☰ menu. Arm soldiers in every colony first.',
  };
}
