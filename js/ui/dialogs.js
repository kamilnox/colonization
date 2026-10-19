// Toast notifications and modal dialogs.
import { esc } from './ctx.js';

// --- toasts ---

const toastQueue = [];
let toastsShown = 0;

export function toast(text, kind = 'info') {
  toastQueue.push({ text, kind });
  pumpToasts();
}

function pumpToasts() {
  const box = document.getElementById('toasts');
  while (toastsShown < 3 && toastQueue.length) {
    const { text, kind } = toastQueue.shift();
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    box.appendChild(el);
    toastsShown++;
    let gone = false;
    const remove = () => {
      if (gone) return;
      gone = true;
      el.classList.add('out');
      setTimeout(() => { el.remove(); toastsShown--; pumpToasts(); }, 250);
    };
    el.addEventListener('click', remove);
    setTimeout(remove, 2200 + Math.min(3000, text.length * 25));
  }
}

// --- modals ---
// buttons: [{ label, value, primary }]. Resolves with the value of the button pressed,
// or with the data-value of any element inside the body that has one.

const modalQueue = [];
let modalOpen = false;

export function modal(opts) {
  return new Promise(resolve => {
    modalQueue.push({ opts, resolve });
    if (!modalOpen) showNextModal();
  });
}

export const isModalOpen = () => modalOpen;

function showNextModal() {
  const next = modalQueue.shift();
  const root = document.getElementById('modal');
  if (!next) {
    modalOpen = false;
    root.hidden = true;
    root.innerHTML = '';
    return;
  }
  modalOpen = true;
  const { title = '', text = '', html = '', buttons = [{ label: 'OK', value: true, primary: true }], dismissable = true } = next.opts;
  root.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      <div class="modal-body">${text ? `<p>${esc(text)}</p>` : ''}${html}</div>
      <div class="modal-buttons">
        ${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-btn="${i}">${esc(b.label)}</button>`).join('')}
      </div>
    </div>`;
  root.hidden = false;
  const close = value => {
    root.onclick = null;
    next.resolve(value);
    showNextModal();
  };
  root.onclick = e => {
    const b = e.target.closest('[data-btn]');
    if (b) return close(buttons[Number(b.dataset.btn)].value);
    const v = e.target.closest('[data-value]');
    if (v && !v.disabled) return close(v.dataset.value);
    if (e.target === root && dismissable) close(null);
  };
}

// A list of choices; resolves with the chosen value or null.
export function choose(title, items, { text = '', cancel = 'Cancel' } = {}) {
  const html = `<div class="choice-list">${items.map(it => `
    <button class="choice" data-value="${esc(it.value)}" ${it.disabled ? 'disabled' : ''}>
      ${it.icon ? `<span class="choice-icon">${it.icon}</span>` : ''}
      <span class="choice-text"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>
      ${it.right ? `<span class="choice-right">${esc(it.right)}</span>` : ''}
    </button>`).join('')}</div>`;
  return modal({ title, text, html, buttons: cancel ? [{ label: cancel, value: null }] : [] });
}

export const confirm = (title, text, yes = 'OK') =>
  modal({ title, text, buttons: [{ label: 'Cancel', value: false }, { label: yes, value: true, primary: true }] });
