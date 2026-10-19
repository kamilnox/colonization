// Shared UI state and a tiny refresh bus so screens can redraw each other.
export const ui = {
  selected: null,     // id of the selected unit on the map
  preview: null,      // { x, y, path, turns } route waiting for a second tap
  info: null,         // { x, y } tile shown in the bottom panel
  screen: null,       // 'colony' | 'europe' | null
  colonyId: null,
  colonySel: null,    // unit picked inside the colony screen
  colonyShip: null,   // ship picked for loading in the colony screen
  europeShip: null,
  europeSel: null,
};

const listeners = [];
export const onRefresh = fn => listeners.push(fn);
export function refresh() {
  for (const fn of listeners) fn();
}

export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// Full-screen views (colony, Europe) register a render function here.
export const screens = {};

export function openScreen(name, opts = {}) {
  Object.assign(ui, opts, { screen: name });
  refresh();
}

export function closeScreen() {
  ui.screen = null;
  refresh();
}
