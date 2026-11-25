// A native <dialog> tied to a URL hash (#libs, #rules), so a list can be linked to.
// It lives outside #app, so re-renders leave it alone. Esc, the close button and the
// backdrop all close it and drop the hash without a history entry.

const cross = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;

export interface HashDialog {
  /** The hash that opens it, such as "#libs". */
  hash: string;
  /** Prefix for the title id, and an extra class next to `libs`, which every dialog shares. */
  id: string;
  title: string;
  hint: string;
  /** HTML below the sticky header. */
  body: string;
}

/** Adds the dialog to the page once and keeps it in step with its hash. */
export function mountHashDialog({ hash, id, title, hint, body }: HashDialog): void {
  const esc = (s: string): string => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const dialog = document.createElement('dialog');
  dialog.className = id === 'libs' ? 'libs' : `libs ${id}`;
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = `<div class="libs-body">
    <header class="libs-head">
      <div>
        <h2 id="${esc(id)}-title">${esc(title)}</h2>
        <p class="hint">${esc(hint)}</p>
      </div>
      <button type="button" class="close" aria-label="Close">${cross}</button>
    </header>
    ${body}
  </div>`;
  document.body.append(dialog);

  const sync = () => {
    if (location.hash === hash && !dialog.open) dialog.showModal();
    if (location.hash !== hash && dialog.open) dialog.close();
  };
  dialog.querySelector('.close')!.addEventListener('click', () => dialog.close());
  // A click on the backdrop lands on the dialog element itself, outside .libs-body.
  dialog.addEventListener('click', e => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (location.hash === hash) history.replaceState(null, '', location.pathname + location.search);
  });
  window.addEventListener('hashchange', sync);
  sync();
}
