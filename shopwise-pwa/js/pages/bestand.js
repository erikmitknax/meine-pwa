import { renderEmpty } from './_empty.js';

export function render(el) {
  renderEmpty(el, {
    title: 'Bestand',
    iconPath: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  });
}
