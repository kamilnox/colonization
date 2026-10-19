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
  <p><b>🎯 Not sure what to do?</b> The line at the top always suggests a next step. Tap it for details and a <i>Show me</i> button.</p>
  <p><b>Each turn.</b> Units that can still act have a <b style="color:#4ade80">green dot</b> and are listed in the <b>Waiting</b> row at the bottom. Tap one to select it (yellow ring). When nobody is waiting, tap <b>End turn</b>.</p>
  <p><b>Moving.</b> Bright tiles show where the selected unit can go this turn: tap one. Rings mean actions: red ⚔️ attack, gold 💬 talk to a village or 🔍 explore ruins, blue ⛵ board a ship. Tap a tile further away to plan a longer trip, then tap Go. Drag to look around, pinch to zoom.</p>
  <p><b>👥 Units</b> (top right) lists everyone: who is on the map, on a ship, working in a colony or waiting in Europe. Tap a name to jump to it.</p>
  <p><b>Ships.</b> Passengers show up in the Waiting row when the ship is next to land: tap one, then a bright land tile. Ships on the dark blue <i>high seas</i> can sail to Europe (3 turns each way).</p>
  <p><b>Colonies.</b> Any colonist on land can found one (🏠). A unit standing on the colony tile is <i>outside</i> and not working: tap <i>Work in ...</i> to put it to work. In the colony screen, tap a colonist, then a green field or building. Each colonist eats 2 food; 200 stored food grows a new colonist.</p>
  <p><b>Coast or inland.</b> Ships can only dock at colonies right next to the sea. An inland colony needs a 🐂 Wagon Train (build it under Construction) to carry its goods to a coastal colony.</p>
  <p><b>Building.</b> Colonists in the Carpenter's House turn lumber into hammers 🔨, which build docks, stockades and more. Lumber comes from colonists working forest tiles.</p>
  <p><b>Trade.</b> Load goods from the warehouse onto a ship, sail to Europe and sell them. Buy tools, muskets and horses, recruit colonists, or train experts. Watch out for the King's taxes.</p>
  <p><b>Native villages 🛖</b> are friendly neighbours. Walk a Free Colonist in to learn their skill (experts produce double). A scout 🤠 can meet the chief for gold or maps. Bring goods next to a village by wagon train or ship and they buy them for gold, tax free. They also send food to colonies nearby. Tap a village to see what it offers.</p>
  <p><b>Ruins ❓</b> hide treasure, maps or survivors. Scouts get the best results.</p>
  <p><b>Pioneers</b> 👷 clear forests, plow fields (+1 food) and build roads.</p>
  <p><b>Liberty.</b> Colonists in the Town Hall make liberty bells 🔔. At ${DECLARE_AT}% rebels overall you can declare independence (☰ menu). Then the King sends his army: keep soldiers in your colonies, build stockades and fight back!</p>
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

