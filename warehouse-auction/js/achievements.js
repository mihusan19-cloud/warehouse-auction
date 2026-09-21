import { loadCatalog } from './encyclopedia/encyclopedia.js';

function progressFor(profile, type, catalogById) {
  if (type === 'collection') return profile.collection.filter((entry) => typeof entry === 'object').length;
  if (type === 'displayed') return profile.collection.filter((entry) => typeof entry === 'object' && entry.displayed).length;
  if (type === 'uniqueCollection') return new Set(profile.collection.filter((entry) => typeof entry === 'object').map((entry) => entry.itemId)).size;
  if (type.startsWith('quality:')) { const quality = type.slice('quality:'.length); return profile.collection.filter((entry) => typeof entry === 'object' && catalogById.get(entry.itemId)?.quality === quality).length; }
  if (type === 'money') return profile.money;
  return profile.stats?.[type] ?? 0;
}

function formatProgress(value) { return Math.floor(value).toLocaleString('en-US'); }

export async function createAchievements({ profile }) {
  const [response, catalog] = await Promise.all([fetch('data/achievements.json'), loadCatalog()]); if (!response.ok) throw new Error('無法載入成就資料。');
  const { achievements } = await response.json(); const catalogById = new Map(catalog.map((item) => [item.id, item])); const grid = document.querySelector('#achievements-grid');
  grid.replaceChildren(...achievements.map((achievement) => { const progress = Math.max(0, Number(progressFor(profile, achievement.type, catalogById)) || 0); const done = progress >= achievement.target; const percentage = Math.min(100, progress / achievement.target * 100); const card = document.createElement('article'); card.className = `achievement-card${done ? ' is-complete' : ''}`; card.innerHTML = `<span class="achievement-icon">${achievement.icon}</span><div><h3>${achievement.name}</h3><p>${achievement.description}</p><div class="achievement-progress" aria-label="進度 ${percentage.toFixed(1)}%"><i style="width:${percentage}%"></i></div><small>${formatProgress(Math.min(progress, achievement.target))} / ${formatProgress(achievement.target)}　${percentage.toFixed(1)}%${done ? '　已完成' : ''}</small></div>`; return card; }));
  return { destroy: () => grid.replaceChildren() };
}
