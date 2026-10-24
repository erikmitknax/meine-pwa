// Kleiner Helfer zum Erzeugen von Elementen (setzt Text sicher per textContent).
export function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
