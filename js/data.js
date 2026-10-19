// Static game data. Most balancing happens by tweaking the numbers in this file.

export const TILE = 48;               // tile size in CSS pixels at zoom 1
export const MAP_W = 40;
export const MAP_H = 52;
export const START_YEAR = 1492;
export const START_GOLD = 1000;
export const LIBERTY_PER_REBEL = 50;  // bells needed to win one colonist over to the cause
export const FOOD_TO_GROW = 200;      // stored food that becomes a new colonist
export const BASE_STORAGE = 100;      // warehouse capacity per good
export const SAIL_TURNS = 3;          // turns to cross the Atlantic
export const DECLARE_AT = 50;         // rebel % needed to declare independence

export const GOODS = {
  food:    { name: 'Food',    icon: '🌽', price: 1,  spread: 4, drop: 600 },
  sugar:   { name: 'Sugar',   icon: '🎋', price: 4,  spread: 2, drop: 400 },
  tobacco: { name: 'Tobacco', icon: '🍂', price: 4,  spread: 2, drop: 400 },
  cotton:  { name: 'Cotton',  icon: '☁️', price: 3,  spread: 2, drop: 400 },
  furs:    { name: 'Furs',    icon: '🦫', price: 4,  spread: 2, drop: 400 },
  lumber:  { name: 'Lumber',  icon: '🪵', price: 1,  spread: 1, drop: 600 },
  ore:     { name: 'Ore',     icon: '🪨', price: 3,  spread: 2, drop: 400 },
  silver:  { name: 'Silver',  icon: '🥈', price: 16, spread: 2, drop: 150 },
  horses:  { name: 'Horses',  icon: '🐎', price: 2,  spread: 1, drop: 300 },
  rum:     { name: 'Rum',     icon: '🥃', price: 10, spread: 1, drop: 250 },
  cigars:  { name: 'Cigars',  icon: '🚬', price: 10, spread: 1, drop: 250 },
  cloth:   { name: 'Cloth',   icon: '🧵', price: 10, spread: 1, drop: 250 },
  coats:   { name: 'Coats',   icon: '🧥', price: 10, spread: 1, drop: 250 },
  tools:   { name: 'Tools',   icon: '🛠️', price: 1,  spread: 1, drop: 300 },
  muskets: { name: 'Muskets', icon: '⚔️', price: 2,  spread: 1, drop: 300 },
};
export const GOOD_KEYS = Object.keys(GOODS);
export const PRICE_RISE = 300;        // units bought in Europe before the price goes up by 1

// Produced but not stored in the warehouse.
export const VIRTUAL = {
  hammers: { name: 'Hammers', icon: '🔨' },
  bells:   { name: 'Liberty Bells', icon: '🔔' },
  crosses: { name: 'Crosses', icon: '✝️' },
};

export const iconOf = g => (GOODS[g] || VIRTUAL[g] || {}).icon || '';
export const nameOf = g => (GOODS[g] || VIRTUAL[g] || {}).name || g;

// move: movement cost in whole moves. def: defence bonus for units standing here.
export const TERRAIN = {
  ocean:     { name: 'Ocean', color: '#2a5b86', water: true, move: 1, prod: { food: 4 } },
  tundra:    { name: 'Tundra', color: '#a7b398', move: 1, prod: { food: 3, ore: 2 },
               forest: { name: 'Boreal Forest', prod: { food: 2, furs: 3, lumber: 4, ore: 1 } } },
  prairie:   { name: 'Prairie', color: '#cbb968', move: 1, prod: { food: 3, cotton: 3 },
               forest: { name: 'Broadleaf Forest', prod: { food: 2, furs: 2, lumber: 4 } } },
  grassland: { name: 'Grassland', color: '#79a649', move: 1, prod: { food: 3, tobacco: 3 },
               forest: { name: 'Conifer Forest', prod: { food: 2, furs: 2, lumber: 6 } } },
  plains:    { name: 'Plains', color: '#a9b85b', move: 1, prod: { food: 5, cotton: 2 },
               forest: { name: 'Mixed Forest', prod: { food: 3, furs: 3, lumber: 6 } } },
  savanna:   { name: 'Savannah', color: '#8fb244', move: 1, prod: { food: 4, sugar: 3 },
               forest: { name: 'Tropical Forest', prod: { food: 3, furs: 2, lumber: 4 } } },
  marsh:     { name: 'Marsh', color: '#6d8256', move: 2, def: 0.25, prod: { food: 3, tobacco: 2, ore: 2 },
               forest: { name: 'Wetland Forest', prod: { food: 2, furs: 2, lumber: 4, ore: 1 } } },
  desert:    { name: 'Desert', color: '#d8c38a', move: 1, prod: { food: 2, cotton: 1, ore: 2 },
               forest: { name: 'Scrub Forest', prod: { food: 2, furs: 2, lumber: 2 } } },
  hills:     { name: 'Hills', color: '#9b8455', move: 2, def: 1.0, prod: { food: 2, ore: 4 } },
  mountains: { name: 'Mountains', color: '#847a6d', move: 3, def: 1.5, prod: { ore: 4, silver: 1 } },
  arctic:    { name: 'Arctic', color: '#e6edf1', move: 2, prod: {} },
};
export const FOREST_DEF = 0.5;

export const BONUS = {
  fish:   { name: 'Fish', icon: '🐟', good: 'food', amount: 4 },
  game:   { name: 'Game', icon: '🦌', good: 'furs', amount: 3 },
  wheat:  { name: 'Wheat', icon: '🌾', good: 'food', amount: 2 },
  ore:    { name: 'Ore deposit', icon: '⛏️', good: 'ore', amount: 3 },
  silver: { name: 'Silver', icon: '💎', good: 'silver', amount: 3 },
};

// expert: the good this colonist produces twice as much of.
export const SKILLS = {
  free:           { name: 'Free Colonist' },
  servant:        { name: 'Indentured Servant', badge: '🧺', factory: 2 },
  criminal:       { name: 'Petty Criminal', badge: '🎲', factory: 1 },
  farmer:         { name: 'Expert Farmer', expert: 'food', land: true, price: 1100 },
  fisherman:      { name: 'Expert Fisherman', badge: '🐟', expert: 'food', sea: true, price: 1000 },
  trapper:        { name: 'Expert Fur Trapper', expert: 'furs', price: 900 },
  lumberjack:     { name: 'Expert Lumberjack', expert: 'lumber', price: 700 },
  miner:          { name: 'Expert Ore Miner', expert: 'ore', price: 600 },
  silverminer:    { name: 'Expert Silver Miner', expert: 'silver', price: 900 },
  sugarplanter:   { name: 'Master Sugar Planter', expert: 'sugar', price: 1100 },
  tobaccoplanter: { name: 'Master Tobacco Planter', expert: 'tobacco', price: 1100 },
  cottonplanter:  { name: 'Master Cotton Planter', expert: 'cotton', price: 1100 },
  statesman:      { name: 'Elder Statesman', expert: 'bells', price: 1900 },
  carpenter:      { name: 'Master Carpenter', expert: 'hammers', price: 1000 },
  blacksmith:     { name: 'Master Blacksmith', expert: 'tools', price: 1000 },
  gunsmith:       { name: 'Master Gunsmith', expert: 'muskets', price: 1200 },
  distiller:      { name: 'Master Distiller', expert: 'rum', price: 1100 },
  tobacconist:    { name: 'Master Tobacconist', expert: 'cigars', price: 1100 },
  weaver:         { name: 'Master Weaver', expert: 'cloth', price: 1100 },
  furtrader:      { name: 'Master Fur Trader', expert: 'coats', price: 1100 },
  pioneer:        { name: 'Hardy Pioneer', badge: '⚒️', price: 1200 },
  scout:          { name: 'Seasoned Scout', badge: '🧭', price: 600 },
  veteran:        { name: 'Veteran Soldier', badge: '⭐', price: 2000 },
};
export const skillBadge = s => SKILLS[s].badge || (SKILLS[s].expert ? iconOf(SKILLS[s].expert) : '');

// Weighted pool for immigrants and recruits in Europe.
export const RECRUIT_WEIGHTS = {
  free: 36, servant: 18, criminal: 10, farmer: 4, fisherman: 4, trapper: 3, lumberjack: 3,
  miner: 3, tobaccoplanter: 2, sugarplanter: 2, cottonplanter: 2, carpenter: 2, blacksmith: 2,
  statesman: 1, pioneer: 3, scout: 3, veteran: 2,
};

// What a colonist carries for each role. Pioneers carry tools separately (20 per job).
export const ROLES = {
  none:    { name: 'Colonist', icon: '🧑', moves: 1, att: 0, def: 1, equip: {} },
  soldier: { name: 'Soldier', icon: '💂', moves: 1, att: 2, def: 2, equip: { muskets: 50 } },
  dragoon: { name: 'Dragoon', icon: '🏇', moves: 4, att: 3, def: 3, equip: { muskets: 50, horses: 50 } },
  scout:   { name: 'Scout', icon: '🤠', moves: 4, att: 0, def: 1, equip: { horses: 50 } },
  pioneer: { name: 'Pioneer', icon: '👷', moves: 1, att: 0, def: 1, equip: {} },
};
export const PIONEER_TOOLS = 100;

export const UNIT_TYPES = {
  colonist:    { name: 'Colonist', person: true },
  artillery:   { name: 'Artillery', icon: '💣', moves: 1, att: 5, def: 3, price: 500 },
  caravel:     { name: 'Caravel', icon: '⛵', naval: true, moves: 4, holds: 2, price: 1000 },
  merchantman: { name: 'Merchantman', icon: '🚢', naval: true, moves: 5, holds: 4, price: 2000 },
  galleon:     { name: 'Galleon', icon: '🛳️', naval: true, moves: 6, holds: 6, price: 3000 },
  regular:     { name: "King's Regulars", icon: '💂', moves: 1, att: 4, def: 3 },
  cavalry:     { name: "King's Cavalry", icon: '🏇', moves: 4, att: 5, def: 4 },
};

// Buildings with in/out turn one good into another; three workers each.
// Key order is also production order (blacksmith makes tools before the armory uses them).
export const BUILDINGS = {
  townhall:    { name: 'Town Hall', icon: '🏛️', out: 'bells', start: true },
  carpenter:   { name: "Carpenter's House", icon: '🪚', in: 'lumber', out: 'hammers', start: true },
  blacksmith:  { name: "Blacksmith's House", icon: '⚒️', in: 'ore', out: 'tools', start: true },
  armory:      { name: 'Armory', icon: '🎯', in: 'tools', out: 'muskets', cost: { hammers: 52 }, pop: 1,
                 desc: 'Turns tools into muskets.' },
  distiller:   { name: "Distiller's House", icon: '🥃', in: 'sugar', out: 'rum', start: true },
  tobacconist: { name: "Tobacconist's House", icon: '🚬', in: 'tobacco', out: 'cigars', start: true },
  weaver:      { name: "Weaver's House", icon: '🧵', in: 'cotton', out: 'cloth', start: true },
  furtrader:   { name: "Fur Trader's House", icon: '🧥', in: 'furs', out: 'coats', start: true },
  chapel:      { name: 'Chapel', icon: '⛪', crosses: 1, start: true },
  docks:       { name: 'Docks', icon: '⚓', cost: { hammers: 52 }, pop: 1, coastal: true,
                 desc: 'Colonists can fish on ocean tiles.' },
  warehouse:   { name: 'Warehouse', icon: '📦', cost: { hammers: 80 }, pop: 1, storage: 100,
                 desc: 'Store 200 of each good.' },
  lumbermill:  { name: 'Lumber Mill', icon: '🏭', cost: { hammers: 52 }, pop: 3, boost: 'carpenter',
                 desc: '+50% hammers.' },
  printing:    { name: 'Printing Press', icon: '📰', cost: { hammers: 52, tools: 20 }, pop: 1, boost: 'townhall',
                 desc: '+50% liberty bells.' },
  church:      { name: 'Church', icon: '💒', cost: { hammers: 64 }, pop: 3, crosses: 2,
                 desc: 'More immigrants arrive from Europe.' },
  stockade:    { name: 'Stockade', icon: '🧱', cost: { hammers: 64 }, pop: 3, defense: 1.0,
                 desc: '+100% defence for the colony.' },
  fort:        { name: 'Fort', icon: '🏰', cost: { hammers: 120, tools: 100 }, pop: 4, requires: 'stockade',
                 defense: 1.5, desc: '+150% defence for the colony.' },
};

export const BUILDABLE_UNITS = {
  artillery: { cost: { hammers: 192, tools: 40 }, pop: 1, requires: 'armory' },
};

// Preferred order when a colony picks its next project on its own.
export const BUILD_PRIORITY = ['docks', 'warehouse', 'stockade', 'lumbermill', 'printing', 'armory', 'church', 'fort'];

export const TRIBES = ['Arawak', 'Tupi', 'Cherokee', 'Iroquois', 'Sioux', 'Apache', 'Aztec', 'Inca'];

export const COLONY_NAMES = [
  'Jamestown', 'Plymouth', 'Roanoke', 'Boston', 'Salem', 'Hartford', 'Providence', 'New Haven',
  'Charleston', 'Baltimore', 'Philadelphia', 'Savannah', 'Williamsburg', 'Annapolis', 'Albany',
  'Dover', 'Portsmouth', 'Newport', 'Wilmington', 'Concord', 'Lexington', 'Trenton', 'Norfolk', 'Augusta',
];
