// Entry point: wires the game rules to the map, panels and screens.
import { S, setState, hooks, dateLabel, unitPos, unitById } from './state.js';
import { newGame, nextUnit } from './game.js';
import { rebelPercent } from './colony.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { BUILD } from './build.js';
import { ui, onRefresh, refresh, screens, openScreen, esc } from './ui/ctx.js';
import { initRenderer, requestDraw, centerOn, insets, resize, camera } from './ui/render.js';
import { initInput } from './ui/input.js';
import { toast, modal } from './ui/dialogs.js';
import { onTap, renderPanel, initPanel, selectUnit } from './ui/mapui.js';
import { openMenu, HELP_HTML } from './ui/menu.js';
import { advice } from './ui/advisor.js';
import './ui/colonyScreen.js';
import './ui/europeScreen.js';
import './ui/roster.js';

const $ = id => document.getElementById(id);

hooks.message = (text, { kind, modal: asModal, title }) => {
  if (asModal) modal({ title, text });
  else toast(text, kind);
};

let goal = null;

function renderHud() {
  if (!S) return;
  $('hud-gold').textContent = `💰 ${S.player.gold}`;
  $('hud-date').textContent = dateLabel();
  $('hud-lib').textContent = `🔔 ${rebelPercent()}%`;
  $('hud-europe').hidden = S.player.declared;
  goal = advice();
  $('goal').innerHTML = `<span class="goal-icon">${goal.icon}</span><span class="goal-text">${esc(goal.text)}</span><span class="goal-more">›</span>`;
}

// Tapping the goal banner explains it and can jump to the unit or colony it is about.
async function explainGoal() {
  const g = goal;
  if (!g) return;
  const buttons = [{ label: 'OK', value: false }];
  if (g.focus) buttons.push({ label: 'Show me', value: true, primary: true });
  const show = await modal({ title: `${g.icon} Next step`, text: g.more ? `${g.text} ${g.more}` : g.text, buttons });
  if (!show || !g.focus) return;
  if (g.focus.unit != null) {
    ui.screen = null;
    selectUnit(unitById(g.focus.unit));
  } else if (g.focus.colony != null) {
    openScreen('colony', { colonyId: g.focus.colony, colonySel: null });
  } else if (g.focus.europe) {
    openScreen('europe', { europeSel: null });
  }
}

function renderScreen() {
  const el = $('screen');
  document.getElementById('app').classList.toggle('has-screen', !!(ui.screen && S));
  if (!ui.screen || !S) {
    if (!el.hidden) {
      el.hidden = true;
      el.innerHTML = '';
    }
    return;
  }
  const keepScroll = el.dataset.screen === ui.screen ? el.scrollTop : 0;
  el.hidden = false;
  el.dataset.screen = ui.screen;
  screens[ui.screen].render(el);
  el.scrollTop = keepScroll;
}

function measureInsets() {
  insets.top = $('hud').getBoundingClientRect().bottom;
  insets.bottom = window.innerHeight - $('panel').getBoundingClientRect().top;
}

onRefresh(() => {
  renderHud();
  renderPanel();
  renderScreen();
  measureInsets();
  requestDraw();
});

function startGame(state) {
  setState(state);
  ui.selected = null;
  ui.preview = null;
  ui.info = null;
  ui.screen = null;
  const first = nextUnit() || S.units.find(u => u.owner === 'player' && u.where === 'map');
  refresh();
  const p = first ? unitPos(first) : S.player.entry;
  centerOn(p.x, p.y);
  if (first) selectUnit(first, false);
}

async function beginNewGame() {
  startGame(newGame());
  saveGame();
  const v = await modal({
    title: 'The New World, 1492',
    html: `<p>The King has granted you a charter to settle the New World. Your caravel carries a veteran soldier and a hardy pioneer. Sail west, find good land and found your first colony.</p>
      <p><b>How it works:</b> the selected unit has a yellow ring. The bright tiles show where it can go this turn: tap one to move. Units with a green dot still need orders, and they are listed in the <b>Waiting</b> row at the bottom.</p>
      <p>Not sure what to do? The 🎯 line at the top always suggests the next step. Tap it for details.</p>`,
    buttons: [{ label: 'How to play', value: 'help' }, { label: 'Set sail!', value: true, primary: true }],
  });
  if (v === 'help') modal({ title: 'How to play', html: HELP_HTML });
}

function boot() {
  initRenderer($('map'));
  initInput($('map'), onTap);
  initPanel();

  $('hud').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || !S) return;
    if (b.dataset.act === 'menu') openMenu({ onNewGame: beginNewGame });
    if (b.dataset.act === 'europe') openScreen('europe', { europeSel: null });
    if (b.dataset.act === 'units') openScreen('units');
    if (b.dataset.act === 'goal') explainGoal();
  });
  $('screen').addEventListener('click', e => {
    if (ui.screen && screens[ui.screen].onClick) screens[ui.screen].onClick(e);
  });

  window.addEventListener('resize', () => { measureInsets(); resize(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGame();
    else checkForUpdate();
  });
  window.addEventListener('pagehide', saveGame);

  const saved = hasSave() && loadGame();
  if (saved) {
    startGame(saved);
    toast(`Welcome back. ${dateLabel()}.`);
  } else {
    beginNewGame();
  }
  measureInsets();
  requestDraw();
}

// --- installable app support ---

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// When the app comes back to the foreground, see whether a newer build was published.
let updateShown = false;
async function checkForUpdate() {
  if (updateShown || BUILD.sha === 'dev') return;
  try {
    const res = await fetch(`./js/build.js?t=${Date.now()}`, { cache: 'no-store' });
    const m = (await res.text()).match(/sha:\s*['"]([^'"]+)['"]/);
    if (m && m[1] !== BUILD.sha) {
      updateShown = true;
      const bar = $('update');
      bar.hidden = false;
      bar.onclick = () => { saveGame(); location.reload(); };
    }
  } catch {
    // offline: nothing to do
  }
}

boot();
setTimeout(checkForUpdate, 3000);
// Handy for debugging from the browser console and for automated tests.
window.__debug = { state: () => S, tap: onTap, camera, ui };
