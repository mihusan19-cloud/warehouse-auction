import { createRouter } from './router.js';
import { loadProfile, saveProfile } from './utils/storage.js?v=39';
import { createAuction } from './game/auction.js?v=39';
import { createEncyclopedia } from './encyclopedia/encyclopedia.js';
import { createShowroom } from './inventory/showroom.js?v=37';
import { configureAudio } from './utils/audio.js';
import { createSettings, openFirstNameDialog } from './settings.js?v=37';
import { createAchievements } from './achievements.js';

function formatMoney(value) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Number(value) || 0));
}

function renderProfile(profile) {
  document.querySelector('#player-name').textContent = profile.name;
  document.querySelector('#player-money').textContent = formatMoney(profile.money);
}

async function initializeApp() {
  const profile = loadProfile();
  saveProfile(profile);
  renderProfile(profile);
  configureAudio(() => profile.settings.soundEnabled);
  let auction = null;
  let encyclopedia = null;
  let showroom = null;
  let settings = null;
  let achievements = null;
  let activeRoute = 'home';
  const router = createRouter({ onRouteChange: async (route) => {
    activeRoute = route;
    document.body.dataset.route = route;
    if (route === 'auction' && !auction) {
      const createdAuction = await createAuction({ profile, onProfileChange: (nextProfile) => { saveProfile(nextProfile); renderProfile(nextProfile); } });
      if (activeRoute === 'auction') auction = createdAuction;
      else createdAuction.destroy();
    }
    if (route !== 'auction' && auction) { auction.leave(); auction.destroy(); auction = null; }
    if (route !== 'encyclopedia' && encyclopedia) { encyclopedia.destroy(); encyclopedia = null; }
    if (route === 'encyclopedia' && !encyclopedia) encyclopedia = await createEncyclopedia({ profile });
    if (route !== 'showroom' && showroom) { showroom.destroy(); showroom = null; }
    if (route === 'showroom' && !showroom) showroom = await createShowroom({ profile, onProfileChange: (nextProfile) => { saveProfile(nextProfile); renderProfile(nextProfile); } });
    if (route !== 'settings' && settings) { settings.destroy(); settings = null; }
    if (route === 'settings' && !settings) settings = await createSettings({ profile, onProfileChange: (nextProfile) => { saveProfile(nextProfile); renderProfile(nextProfile); } });
    if (route !== 'achievements' && achievements) { achievements.destroy(); achievements = null; }
    if (route === 'achievements' && !achievements) achievements = await createAchievements({ profile });
  } });
  router.start();
  openFirstNameDialog(profile, (nextProfile) => { saveProfile(nextProfile); renderProfile(nextProfile); });
  const rulesButton = document.querySelector('#rules-button'); const rulesModal = document.querySelector('#rules-modal'); const rulesClose = document.querySelector('#rules-close-button');
  Promise.all([fetch('data/auctionConditions.json').then((response) => response.json()), fetch('data/auctionMeta.json').then((response) => response.json())]).then(([conditions, meta]) => {
    const target = document.querySelector('#rules-event-probabilities');
    target.innerHTML = meta.venues.map((venue) => `<section><strong>${venue.name}</strong>${conditions.conditions.map((event) => `<span>${event.title}<b>${event.weights?.[venue.id] ?? event.weight ?? 0}%</b></span>`).join('')}</section>`).join('');
  }).catch(() => { document.querySelector('#rules-event-probabilities').textContent = '事件機率載入失敗。'; });
  const closeRules = () => { rulesModal.hidden = true; };
  rulesButton.addEventListener('click', () => { rulesModal.hidden = false; }); rulesClose.addEventListener('click', closeRules); rulesModal.addEventListener('click', (event) => { if (event.target === rulesModal) closeRules(); });
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

document.addEventListener('DOMContentLoaded', initializeApp);
