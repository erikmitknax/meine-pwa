// Gemeinsamer Platzhalter, solange eine Seite noch keine Inhalte hat.
// Sobald eine Seite echte Inhalte bekommt, wird dieser Aufruf einfach ersetzt.
export function renderEmpty(el, { title, iconPath }) {
  el.innerHTML = `
    <h1>${title}</h1>
    <section class="empty">
      <svg viewBox="0 0 24 24" aria-hidden="true">${iconPath}</svg>
      <h2>Noch keine Inhalte</h2>
      <p>Diese Seite wird als Nächstes aufgebaut.</p>
    </section>
  `;
}
