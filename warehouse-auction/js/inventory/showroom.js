import { loadCatalog } from '../encyclopedia/encyclopedia.js';
import { collectionEntries, setDisplayState } from './backpack.js';
import { sellCollectionItems } from './sell.js';
import { hourlyDisplayIncome, settleOfflineIncome } from './income.js';
import { playSound } from '../utils/audio.js';

const money = (value) => `$${Math.floor(value).toLocaleString('en-US')}`;

export async function createShowroom({ profile, onProfileChange }) {
  const [catalog, qualitiesData, config] = await Promise.all([loadCatalog(), fetch('data/qualities.json').then((response) => response.json()), fetch('data/showroomConfig.json').then((response) => response.json())]);
  const qualityMap = Object.fromEntries(qualitiesData.qualities.map((quality) => [quality.id, quality]));
  const displayGrid = document.querySelector('#display-grid');
  const collectionGrid = document.querySelector('#collection-grid');
  const selected = new Set();
  const sellButton = document.querySelector('#sell-selected-button');
  const notice = document.querySelector('#offline-income-notice');
  const settled = settleOfflineIncome(profile, collectionEntries(profile, catalog), qualityMap, config);
  onProfileChange(profile);
  if (settled.amount > 0) { notice.hidden = false; notice.textContent = `離線 ${settled.elapsedHours.toFixed(1)} 小時，展示館帶來 ${money(settled.amount)} 收益。`; }
  function itemCard(entry, { display = false } = {}) {
    const quality = qualityMap[entry.item.quality];
    const card = document.createElement('article'); card.className = `inventory-card${display ? ' is-displayed' : ''}`; card.style.setProperty('--item-color', quality.color);
    card.innerHTML = `<div class="inventory-image">${entry.item.image}</div><div class="inventory-main"><span>${entry.item.quality} · ${entry.item.series}</span><h4>${entry.item.name}</h4><strong>${money(entry.item.value)}</strong></div><button class="inventory-action" type="button" data-display-id="${entry.instanceId}" data-next-display="${display ? 'false' : 'true'}">${display ? '下架' : '展示'}</button>`;
    return card;
  }
  function render() {
    const entries = collectionEntries(profile, catalog); const displayed = entries.filter((entry) => entry.displayed); const stored = entries.filter((entry) => !entry.displayed);
    document.querySelector('#display-count').textContent = String(displayed.length);
    document.querySelector('#hourly-income').textContent = money(hourlyDisplayIncome(entries, qualityMap, config.displayMultiplier));
    displayGrid.replaceChildren(...(displayed.length ? displayed.map((entry) => itemCard(entry, { display: true })) : [Object.assign(document.createElement('p'), { className: 'empty-collection', textContent: '尚未展示物品。從收藏背包選擇物品展示吧！' })]));
    collectionGrid.replaceChildren(...(stored.length ? stored.map((entry) => {
        const card = itemCard(entry);
        const selectButton = document.createElement('button');
        selectButton.type = 'button'; selectButton.className = `sell-check${selected.has(entry.instanceId) ? ' is-selected' : ''}`;
        selectButton.dataset.selectId = entry.instanceId;
        selectButton.textContent = selected.has(entry.instanceId) ? '✓ 已選取' : '選取出售';
        card.prepend(selectButton);
        return card;
    }) : [Object.assign(document.createElement('p'), { className: 'empty-collection', textContent: '背包目前沒有未展示的收藏品。' })]));
    sellButton.disabled = selected.size === 0;
  }
  function handleClick(event) {
    const selection = event.target.closest('[data-select-id]');
    if (selection) { const { selectId } = selection.dataset; if (selected.has(selectId)) selected.delete(selectId); else selected.add(selectId); render(); return; }
    const action = event.target.closest('[data-display-id]'); if (!action) return;
    const result = setDisplayState(profile, action.dataset.displayId, action.dataset.nextDisplay === 'true', config.displayLimit);
    if (!result.changed) { notice.hidden = false; notice.textContent = result.message; return; }
    onProfileChange(profile); playSound('reveal'); render();
  }
  function handleSell() {
    const result = sellCollectionItems(profile, [...selected], catalog); selected.clear(); onProfileChange(profile); if (result.sold) playSound('sell'); notice.hidden = false; notice.textContent = result.message; render();
  }
  displayGrid.addEventListener('click', handleClick); collectionGrid.addEventListener('click', handleClick); sellButton.addEventListener('click', handleSell);
  render();
  return { destroy: () => { displayGrid.removeEventListener('click', handleClick); collectionGrid.removeEventListener('click', handleClick); sellButton.removeEventListener('click', handleSell); } };
}
