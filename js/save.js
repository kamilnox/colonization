// Saving to localStorage. On iPhone this survives closing the home screen app.
import { S } from './state.js';

const KEY = 'newworld.save.v1';

export function saveGame() {
  if (!S) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...S, explored: S.explored.join('') }));
  } catch (e) {
    console.warn('Save failed', e);
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    data.explored = Uint8Array.from(data.explored, ch => (ch === '1' ? 1 : 0));
    return data;
  } catch (e) {
    console.warn('Load failed', e);
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

let timer = null;
// Saves shortly after a burst of actions instead of after every single tap.
export function saveSoon() {
  clearTimeout(timer);
  timer = setTimeout(saveGame, 1200);
}
