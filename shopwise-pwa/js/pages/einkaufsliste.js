import { renderEmpty } from './_empty.js';

export function render(el) {
  renderEmpty(el, {
    title: 'Einkaufsliste',
    iconPath: '<path d="M3 4h2l2.4 11h10.2l2-8H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  });
}
