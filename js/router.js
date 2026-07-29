const ROUTES = new Set(['home', 'auction', 'encyclopedia', 'showroom', 'achievements', 'settings']);

export function createRouter({ onRouteChange } = {}) {
  const pages = [...document.querySelectorAll('[data-page]')];

  function focusAppContent() {
    const activeElement = document.activeElement;
    const isEditing = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.tagName === 'SELECT' ||
      activeElement.isContentEditable ||
      activeElement.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
    );

    if (!isEditing) {
      document.querySelector('#app-content')?.focus({ preventScroll: true });
    }
  }

  function go(route, { updateHash = true } = {}) {
    const target = ROUTES.has(route) ? route : 'home';
    pages.forEach((page) => page.classList.toggle('is-active', page.dataset.page === target));
    if (updateHash && window.location.hash !== `#${target}`) { window.location.hash = target; return; }
    focusAppContent();
    onRouteChange?.(target);
  }

  function start() {
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-route]');
      if (!trigger) return;
      event.preventDefault();
      go(trigger.dataset.route);
    });
    window.addEventListener('hashchange', () => go(window.location.hash.slice(1), { updateHash: false }));
    go(window.location.hash.slice(1) || 'home', { updateHash: false });
  }

  return { go, start };
}
