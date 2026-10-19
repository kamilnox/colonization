// The ☰ menu: colonies list, independence, messages, help and new game.
import { DECLARE_AT } from '../data.js';
import { S, dateLabel, playerColonies } from '../state.js';
import { openScreen, esc } from './ctx.js';
import { modal, choose, confirm } from './dialogs.js';
import { workers, sol, rebelPercent } from '../colony.js';
import { canDeclare, declareIndependence, score } from '../game.js';
import { refRemaining, refOnMap } from '../ai.js';
import { saveGame } from '../save.js';
import { BUILD } from '../build.js';

export const HELP_HTML = `
  <div class="help">
  <p><b>Goal.</b> Found colonies in the New World, grow them, win your colonists over to the cause of liberty, then declare independence and defeat the King's army.</p>
  <p><b>Moving.</b> Tap a unit to select it. Tap a neighbouring tile to move there. Tap a tile further away to see a route, then tap it again (or ▶ Go) to follow it. Drag to look around, pinch to zoom.</p>
  <p><b>Ships.</b> Your ship carries units and goods. Tap the land next to it with a unit aboard selected to go ashore. Ships on dark blue <i>high seas</i> can sail to Europe (3 turns each way).</p>
  <p><b>Colonies.</b> Any colonist can found a colony (🏠). Open it by tapping it. Tap a colonist, then a field or building, to change their job. Each colonist eats 2 food. 200 stored food grows a new colonist.</p>
  <p><b>Building.</b> Colonists in the Carpenter's House turn lumber into hammers 🔨, which build docks, stockades and more. Lumberjacks cut lumber in forests.</p>
  <p><b>Trade.</b> Load goods from the warehouse onto a ship, sail to Europe and sell them. Buy tools, muskets and horses, recruit colonists, or train experts. Watch out for the King's taxes.</p>
  <p><b>Experts</b> produce double. Free colonists can learn a skill by visiting a native village 🛖. Scouts 🤠 can speak to chiefs and explore lost city rumours ❓.</p>
  <p><b>Pioneers</b> 👷 clear forests, plow fields (+1 food) and build roads.</p>
  <p><b>Liberty.</b> Colonists in the Town Hall make liberty bells 🔔. At ${DECLARE_AT}% rebels overall you can declare independence (☰ menu). Then the King sends his army: put soldiers in your colonies, build stockades and fight back!</p>
  </div>`;

function coloniesList() {
  const cols = playerColonies();
  if (!cols.length) return modal({ title: 'Colonies', text: 'You have no colonies yet. Land a colonist and tap 🏠 Found colony.' });
  return choose('Colonies', cols.map(c => ({
    value: String(c.id), icon: '🏘️', label: c.name, sub: `${workers(c).length} colonists · rebels ${sol(c)}%`,
  }))).then(v => { if (v) openScreen('colony', { colonyId: Number(v), colonySel: null }); });
}

async function independence() {
  if (S.player.declared) {
    return modal({ title: 'War of Independence', text: `The King still has ${refRemaining()} units waiting to land and ${refOnMap().length} in the field.` });
  }
  const pct = rebelPercent();
  if (!canDeclare()) {
    return modal({
      title: 'Not yet',
      text: `Only ${pct}% of your colonists support independence. You need ${DECLARE_AT}%. Put colonists (best: Elder Statesmen) in Town Halls to make liberty bells.`,
    });
  }
  const yes = await confirm('Declare independence?',
    `${pct}% of your colonists are rebels. Once you declare, Europe closes to you and the King's army will land near your colonies. Make sure they are defended.`,
    'Declare!');
  if (yes) {
    declareIndependence();
    saveGame();
  }
}

function messages() {
  const items = S.log.slice(-60).reverse();
  return modal({
    title: 'Messages',
    html: items.length ? `<div class="log">${items.map(m => `<p><small>${dateLabel(m.turn)}</small> ${esc(m.text)}</p>`).join('')}</div>` : '<p>No messages yet.</p>',
  });
}

export async function openMenu({ onNewGame }) {
  const build = BUILD.sha === 'dev' ? 'local build' : `build ${BUILD.sha} · ${BUILD.date}`;
  const v = await choose('Menu', [
    { value: 'europe', icon: '⚓', label: 'Europe', sub: S.player.declared ? 'Closed' : 'Trade, recruit and buy ships' },
    { value: 'colonies', icon: '🏘️', label: 'Colonies', sub: `${playerColonies().length} founded` },
    { value: 'independence', icon: '🔔', label: S.player.declared ? 'War status' : 'Declare independence', sub: `Rebels: ${rebelPercent()}% · Score ${score()}` },
    { value: 'messages', icon: '📜', label: 'Messages' },
    { value: 'help', icon: '❔', label: 'How to play' },
    { value: 'reload', icon: '🔄', label: 'Reload app', sub: build },
    { value: 'new', icon: '🆕', label: 'New game' },
  ]);
  switch (v) {
    case 'europe': return openScreen('europe', { europeSel: null });
    case 'colonies': return coloniesList();
    case 'independence': return independence();
    case 'messages': return messages();
    case 'help': return modal({ title: 'How to play', html: HELP_HTML });
    case 'reload': saveGame(); return location.reload();
    case 'new':
      if (await confirm('New game', 'Start over on a new map? Your current game will be lost.', 'Start over')) onNewGame();
  }
}

