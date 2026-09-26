import { loadCatalog } from '../encyclopedia/encyclopedia.js';
import { collectionEntries, setDisplayState } from './backpack.js';
import { sellCollectionItems } from './sell.js';
import { accrueDisplayIncome, claimDisplayIncome, hourlyDisplayIncome, previewDisplayIncome } from './income.js?v=37';
import { playSound } from '../utils/audio.js';

const money = (value) => `$${Math.floor(value).toLocaleString('en-US')}`;

export async function createShowroom({ profile, onProfileChange }) {
  const [catalog, qualitiesData, config] = await Promise.all([loadCatalog(), fetch('data/qualities.json').then((response) => response.json()), fetch('data/showroomConfig.json?v=37').then((response) => response.json())]);
  const qualityMap = Object.fromEntries(qualitiesData.qualities.map((quality) => [quality.id, quality]));
  const displayGrid = document.querySelector('#display-grid');
  const collectionGrid = document.querySelector('#collection-grid');
  const selected = new Set();
  const sellButton = document.querySelector('#sell-selected-button');
  const claimButton = document.querySelector('#claim-income-button');
  const qualityControls = document.querySelector('#quality-select-controls');
  const notice = document.querySelector('#offline-income-notice');
  accrueDisplayIncome(profile, collectionEntries(profile, catalog), qualityMap, config);
  onProfileChange(profile);
  function renderIncome() {
    const income = previewDisplayIncome(profile, collectionEntries(profile, catalog), qualityMap, config);
    document.querySelector('#pending-income').textContent = money(income.amount);
    document.querySelector('#income-hours').textContent = `已累積 ${income.elapsedHours.toFixed(1)} / ${income.cap} 小時`;
    claimButton.disabled = income.amount <= 0 && income.elapsedHours < income.cap;
    claimButton.textContent = income.amount > 0 ? '領取收益' : income.elapsedHours >= income.cap ? '重新開始累積' : '領取收益';
  }
  function itemCard(entry, { display = false } = {}) {
    const quality = qualityMap[entry.item.quality];
    const card = document.createElement('article'); card.className = `inventory-card${display ? ' is-displayed' : ''}`; card.style.setProperty('--item-color', quality.color);
    card.innerHTML = `<div class="inventory-image">${entry.item.image}</div><div class="inventory-main"><span>${entry.item.quality} · ${entry.item.series}</span><h4>${entry.item.name}</h4><strong>${money(entry.item.value)}</strong></div><button class="inventory-action" type="button" data-display-id="${entry.instanceId}" data-next-display="${display ? 'false' : 'true'}">${display ? '下架' : '展示'}</button>`;
    return card;
  }
  function render() {
    const entries = collectionEntries(profile, catalog); const displayed = entries.filter((entry) => entry.displayed); const stored = entries.filter((entry) => !entry.displayed);
    const storedIds = new Set(stored.map((entry) => entry.instanceId));
    for (const id of selected) if (!storedIds.has(id)) selected.delete(id);
    document.querySelector('#display-count').textContent = String(displayed.length);
    document.querySelector('#hourly-income').textContent = money(hourlyDisplayIncome(entries, qualityMap, config.displayMultiplier));
    renderIncome();
    qualityControls.replaceChildren(...qualitiesData.qualities.map((quality) => {
      const count = stored.filter((entry) => entry.item.quality === quality.id).length;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quality-select-button';
      button.dataset.selectQuality = quality.id; button.disabled = count === 0;
      button.style.setProperty('--quality-color', quality.color);
      button.textContent = `${quality.id}全選 (${count})`;
      return button;
    }), Object.assign(document.createElement('button'), { type: 'button', className: 'quality-clear-button', textContent: '清除選取', disabled: selected.size === 0 }));
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
    accrueDisplayIncome(profile, collectionEntries(profile, catalog), qualityMap, config);
    const result = setDisplayState(profile, action.dataset.displayId, action.dataset.nextDisplay === 'true', config.displayLimit);
    if (!result.changed) { notice.hidden = false; notice.textContent = result.message; return; }
    onProfileChange(profile); playSound('reveal'); render();
  }
  function handleSell() {
    const result = sellCollectionItems(profile, [...selected], catalog); selected.clear(); onProfileChange(profile); if (result.sold) playSound('sell'); notice.hidden = false; notice.textContent = result.message; render();
  }
  function handleQualitySelect(event) {
    const quality = event.target.closest('[data-select-quality]')?.dataset.selectQuality;
    if (quality) collectionEntries(profile, catalog).filter((entry) => !entry.displayed && entry.item.quality === quality).forEach((entry) => selected.add(entry.instanceId));
    else if (event.target.closest('.quality-clear-button')) selected.clear();
    else return;
    render();
  }
  function handleClaim() {
    const result = claimDisplayIncome(profile, collectionEntries(profile, catalog), qualityMap, config);
    onProfileChange(profile);
    notice.hidden = false;
    notice.textContent = result.amount > 0 ? `已領取 ${money(result.amount)} 展示收益，重新開始累積。` : '已重新開始累積展示收益。';
    if (result.amount > 0) playSound('win');
    renderIncome();
  }
  displayGrid.addEventListener('click', handleClick); collectionGrid.addEventListener('click', handleClick); sellButton.addEventListener('click', handleSell); qualityControls.addEventListener('click', handleQualitySelect); claimButton.addEventListener('click', handleClaim);
  const incomeTimer = window.setInterval(renderIncome, 10000);
  render();
  return { destroy: () => { window.clearInterval(incomeTimer); displayGrid.removeEventListener('click', handleClick); collectionGrid.removeEventListener('click', handleClick); sellButton.removeEventListener('click', handleSell); qualityControls.removeEventListener('click', handleQualitySelect); claimButton.removeEventListener('click', handleClaim); } };
}
