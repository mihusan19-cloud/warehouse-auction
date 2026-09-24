import { generateWarehouse, renderWarehouse } from './warehouse.js';
import { revealClue, renderClue } from './clue.js';
import { createRoundController } from './round.js';
import { createAiBidders, makeAiBid } from '../ai/aiEngine.js';
import { getHighestBidders, validatePlayerBid } from './bid.js';
import { loadCatalog } from '../encyclopedia/encyclopedia.js';
import { addCollectedItems } from '../utils/storage.js';
import { playSound } from '../utils/audio.js';
import { playGameAnimation, playUnboxingAnimation } from './animation.js';

export async function createAuction({ profile, onProfileChange }) {
  const [warehouseResponse, aiResponse, catalog] = await Promise.all([fetch('data/warehouseTemplates.json'), fetch('data/ai.json'), loadCatalog()]);
  if (!warehouseResponse.ok || !aiResponse.ok) throw new Error('無法載入競標資料。');
  const [template, aiDatabase] = await Promise.all([warehouseResponse.json(), aiResponse.json()]);
  const bidInput = document.querySelector('#bid-input'); const submitButton = document.querySelector('#bid-submit-button'); const nextButton = document.querySelector('#next-round-button'); const newWarehouseButton = document.querySelector('#new-warehouse-button'); const catalogButton = document.querySelector('#auction-catalog-button'); const resetButton = document.querySelector('#reset-auction-button'); const status = document.querySelector('#auction-status');
  let warehouse; let bidders; let history; let clueHistory; let aiTimers = []; let bidDraft = '0'; let roundClosed = false; let ended = false; let disposed = false;
  const format = (amount) => `$${amount.toLocaleString('en-US')}`;
  const player = () => bidders[0];
  const fifthBidFor = (bidderId) => history.find((entry) => entry.round === 5)?.bids.find((bid) => bid.bidderId === bidderId)?.amount ?? 0;
  const previousPlayerBid = () => history.at(-1)?.bids.find((bid) => bid.bidderId === 'player')?.amount ?? 0;
  const clearAiTimers = () => { aiTimers.forEach((timer) => window.clearTimeout(timer)); aiTimers = []; };

  function renderBidders() {
    document.querySelector('#bidders-list').replaceChildren(...bidders.map((bidder) => { const row = document.createElement('div'); const bidText = bidder.lastBid === null ? '等待出價' : roundClosed ? (bidder.lastBid === 0 ? '放棄本回合' : format(bidder.lastBid)) : '已完成喊價'; const showDialogue = player().confirmed && bidder.dialogue; row.className = `bidder-row${bidder.bidderId === 'player' ? ' is-player' : ''}`; row.innerHTML = `<span class="bidder-avatar">${bidder.avatar}</span><span class="bidder-name"><strong>${bidder.name}</strong></span><span class="bidder-bid">${bidText}</span>${showDialogue ? `<em>${bidder.dialogue}</em>` : ''}`; return row; }));
  }
  function renderHistory() { const target = document.querySelector('#bid-history'); if (!history.length) { target.replaceChildren(); return; } target.innerHTML = `<strong>歷史出價</strong>${history.map((entry) => `<div class="history-round"><span>第 ${entry.round} 回</span>${entry.bids.map((bid) => `<small>${bid.name} ${bid.amount === 0 ? '放棄' : format(bid.amount)}</small>`).join('')}</div>`).join('')}`; }
  function renderClueHistory() { const target = document.querySelector('#clue-history'); target.replaceChildren(...clueHistory.map((clue, index) => { const entry = document.createElement('div'); const labels = clue.items?.map((item) => `#${item.id.slice(-3)}`).join('、') || clue.summary; entry.innerHTML = `<strong>第 ${index + 1} 條</strong><span>${clue.meta.title}：${labels}</span>`; return entry; })); }
  function openMiniCatalog(targetItem = null) {
    document.querySelector('#auction-catalog-modal')?.remove(); const rank = { '垃圾': 0, '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4, '神話': 5 };
    const candidates = catalog.filter((item) => !targetItem || ((!targetItem.knowledge.category || item.series === targetItem.series) && (!targetItem.knowledge.value || item.value === targetItem.value) && (!targetItem.knowledge.size || (item.width === targetItem.width && item.height === targetItem.height)))).sort((left, right) => rank[right.quality] - rank[left.quality] || right.value - left.value);
    const modal = document.createElement('div'); modal.id = 'auction-catalog-modal'; modal.className = 'auction-catalog-modal'; modal.innerHTML = `<section><button class="catalog-close" type="button" aria-label="關閉小圖鑑">×</button><p class="eyebrow">${targetItem ? 'POSSIBLE MATCHES' : 'AUCTION CATALOG'}</p><h3>${targetItem ? `可能物品（${candidates.length}）` : '小圖鑑'}</h3><p>${targetItem ? '依已公開情報篩選，品質由高至低。' : '完整物品目錄，品質由高至低。'}</p><div class="auction-catalog-list">${candidates.slice(0, 80).map((item) => `<article class="mini-item quality-${item.quality}"><span>${item.image}</span><div><small>${item.quality} · ${item.series}</small><strong>${item.name}</strong><em>${format(item.value)}　${item.width}×${item.height} 格</em></div></article>`).join('') || '<p>沒有符合目前情報的候選物品。</p>'}</div></section>`; modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('.catalog-close')) modal.remove(); }); document.body.append(modal);
  }
  function setBidControls(enabled, minimum = 0, { resetValue = false } = {}) { bidInput.disabled = !enabled; submitButton.disabled = !enabled; if (resetValue) { bidDraft = String(minimum || 0); bidInput.value = bidDraft; } document.querySelector('#bid-minimum').textContent = minimum ? `本回合最低出價：${format(minimum)}` : '可輸入 0 放棄競標'; }
  function allConfirmed() { return bidders.every((bidder) => bidder.confirmed); }
  function maybeCloseRound() { if (!roundClosed && allConfirmed()) closeRound(); }
  function confirmAiBid(ai, round) {
    if (disposed || roundClosed || ai.confirmed || controller.getRound() !== round) return;
    makeAiBid(ai, warehouse, aiDatabase, { minimum: round === 6 ? fifthBidFor(ai.bidderId) : 1, playerPreviousBid: previousPlayerBid() }); ai.confirmed = true; playSound('bid'); renderBidders(); maybeCloseRound();
  }
  function scheduleAiBids(round, afterPlayerBid = false) {
    if (afterPlayerBid) clearAiTimers();
    const waitingAis = bidders.slice(1).filter((ai) => !ai.confirmed);
    const delays = waitingAis.map((_, index) => afterPlayerBid
      ? 600 + Math.floor(Math.random() * (4400 - index * 350))
      : 5000 + Math.floor(Math.random() * 55001));
    waitingAis.forEach((ai, index) => { aiTimers.push(window.setTimeout(() => confirmAiBid(ai, round), Math.max(350, delays[index]))); });
  }
  function beginRound(round) {
    clearAiTimers(); roundClosed = false; bidders.forEach((bidder) => { bidder.lastBid = null; bidder.confirmed = false; bidder.dialogue = ''; });
    const previousItemIds = clueHistory.flatMap((clueEntry) => clueEntry.items?.map((item) => item.id) ?? []);
    const clue = round <= 5 ? revealClue(warehouse, round, previousItemIds) : { meta: { title: '平手決勝回合', description: '最高價平手，本回合出價不可低於第五回合價格。' }, items: [] };
    if (clue.type !== 'none') clueHistory.push(clue); renderClue(clue); renderClueHistory(); renderWarehouse(warehouse, openMiniCatalog); renderBidders(); renderHistory(); setBidControls(true, round === 6 ? fifthBidFor('player') : 0, { resetValue: true }); nextButton.hidden = true; newWarehouseButton.hidden = true; status.textContent = round === 6 ? '平手決勝：請提交不低於第五回合的出價。' : '查看情報後，提交本回合唯一出價。'; scheduleAiBids(round);
  }
  function completeAuction(message) { ended = true; clearAiTimers(); controller.stop(); setBidControls(false); status.textContent = message; newWarehouseButton.hidden = false; nextButton.hidden = true; }
  function settleWinner(winner) {
    if (winner.bidderId === 'player' && winner.amount > 0) { const warehouseValue = warehouse.items.reduce((sum, item) => sum + item.value, 0); const profit = warehouseValue - winner.amount; profile.money -= winner.amount; profile.stats.wins += 1; const acquired = addCollectedItems(profile, warehouse.items); onProfileChange(profile); playSound('win'); playUnboxingAnimation(warehouse.items); completeAuction(`恭喜得標！成交價 ${format(winner.amount)}，倉庫總價值 ${format(warehouseValue)}，${profit >= 0 ? '預估盈餘' : '預估虧損'} ${format(Math.abs(profit))}，獲得 ${acquired.length} 件收藏品。`); return; }
    completeAuction(winner.amount === 0 ? '所有競標者皆放棄，本倉庫流標。' : `${winner.name} 以 ${format(winner.amount)} 得標。`);
  }
  function closeRound() {
    if (roundClosed) return; roundClosed = true; clearAiTimers(); controller.stop(); const bids = bidders.map((bidder) => ({ bidderId: bidder.bidderId, name: bidder.name, amount: bidder.lastBid })); history.push({ round: controller.getRound(), bids }); const result = getHighestBidders(bids); renderBidders(); renderHistory(); const round = controller.getRound();
    const secondHighest = [...bids].sort((left, right) => right.amount - left.amount)[1]?.amount ?? 0;
    const earlyThresholds = { 1: 2, 2: 1.7, 3: 1.5, 4: 1.3 };
    if (earlyThresholds[round] && secondHighest > 0 && result.bidders.length === 1 && result.highestBid > secondHighest * earlyThresholds[round]) { settleWinner(result.bidders[0]); return; }
    if (round < 5) { status.textContent = `本回合最高出價為 ${format(result.highestBid)}。`; nextButton.hidden = false; nextButton.textContent = '進入下一回合'; return; }
    if (round === 5 && result.highestBid > 0 && result.bidders.length > 1) { status.textContent = `最高價 ${format(result.highestBid)} 平手，進入第六回合決勝。`; nextButton.hidden = false; nextButton.textContent = '進入平手決勝'; return; }
    if (round === 6 && result.highestBid > 0 && result.bidders.length > 1) { completeAuction(`第六回合仍以 ${format(result.highestBid)} 平手，本倉庫流標。`); return; }
    settleWinner(result.bidders[0]);
  }
  function submitPlayerBid(forcedAmount) {
    if (roundClosed || ended || player().confirmed) return; const round = controller.getRound(); const minimum = round === 6 ? fifthBidFor('player') : 0; const validation = validatePlayerBid(forcedAmount ?? bidDraft, { money: profile.money, minimum }); if (!validation.valid) { status.textContent = validation.message; return; }
    player().lastBid = validation.amount; player().confirmed = true; player().dialogue = validation.amount === 0 ? '本回合選擇放棄。' : `已鎖定出價 ${format(validation.amount)}。`; playSound('bid'); setBidControls(false); status.textContent = '你已完成喊價。'; renderBidders(); if (!allConfirmed()) scheduleAiBids(round, true); maybeCloseRound();
  }
  const controller = createRoundController({ onChange: beginRound, onExpire: () => { status.textContent = '時間到，你本回合自動放棄競標。'; submitPlayerBid(0); } });
  function startWarehouse() { clearAiTimers(); warehouse = generateWarehouse({ ...template, prototypeItems: catalog }); bidders = [{ bidderId: 'player', name: profile.name, avatar: 'P', money: profile.money, lastBid: null, confirmed: false, dialogue: '' }, ...createAiBidders(aiDatabase).map((ai) => ({ ...ai, confirmed: false }))]; history = []; clueHistory = []; ended = false; profile.stats.auctions += 1; onProfileChange(profile); playSound('reveal'); playGameAnimation('reveal', '新倉庫開啟'); controller.start(1); }
  const handleSubmit = () => submitPlayerBid(); const handleNext = () => { if (roundClosed) controller.start(controller.getRound() === 5 ? 6 : controller.getRound() + 1); }; const focusBidInput = (event) => { if (!bidInput.disabled && event.target !== bidInput) bidInput.focus(); }; const syncBidDraft = () => { bidDraft = bidInput.value; };
  const handleReset = () => startWarehouse(); document.querySelector('.bid-input-wrap').addEventListener('pointerdown', focusBidInput); bidInput.addEventListener('input', syncBidDraft); submitButton.addEventListener('click', handleSubmit); nextButton.addEventListener('click', handleNext); newWarehouseButton.addEventListener('click', startWarehouse); resetButton.addEventListener('click', handleReset); catalogButton.addEventListener('click', () => openMiniCatalog()); startWarehouse();
  return { leave: () => { if (!roundClosed && !ended) submitPlayerBid(0); }, destroy: () => { disposed = true; clearAiTimers(); document.querySelector('#auction-catalog-modal')?.remove(); controller.destroy(); document.querySelector('.bid-input-wrap').removeEventListener('pointerdown', focusBidInput); bidInput.removeEventListener('input', syncBidDraft); submitButton.removeEventListener('click', handleSubmit); nextButton.removeEventListener('click', handleNext); newWarehouseButton.removeEventListener('click', startWarehouse); resetButton.removeEventListener('click', handleReset); } };
}
