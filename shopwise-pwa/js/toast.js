// Kurze Meldung unten über der Tab-Leiste.
export function showToast(message) {
  const app = document.querySelector('.app');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  app.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}
