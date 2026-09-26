import { generateWarehouse, renderWarehouse } from './warehouse.js?v=38';
import { instrumentCanReveal, makeTotalCellsClue, makeValueRangeClue, revealBlindSpotClue, revealBonusClue, revealClue, revealInstrumentClue, revealTargetedClue, renderClue } from './clue.js?v=39';
import { createRoundController } from './round.js';
import { bidderStatus } from './bidderView.js';
import { createAiBidRemainingMarks, createAiBidders, makeAiBid } from '../ai/aiEngine.js?v=39';
import { getHighestBidders, validatePlayerBid } from './bid.js';
import { loadCatalog } from '../encyclopedia/encyclopedia.js';
import { addCollectedItems } from '../utils/storage.js';
import { playSound } from '../utils/audio.js';
import { playClueAnimation, playConditionDraw, playGameAnimation, playUnboxingAnimation } from './animation.js?v=37';

export async function createAuction({ profile, onProfileChange }) {
  const [warehouseResponse, aiResponse, conditionResponse, metaResponse, catalog] = await Promise.all([fetch('data/warehouseTemplates.json'), fetch('data/ai.json'), fetch('data/auctionConditions.json'), fetch('data/auctionMeta.json?v=39'), loadCatalog()]);
  if (!warehouseResponse.ok || !aiResponse.ok || !conditionResponse.ok || !metaResponse.ok) throw new Error('無法載入競標資料。');
  const [template, aiDatabase, conditionConfig, auctionMeta] = await Promise.all([warehouseResponse.json(), aiResponse.json(), conditionResponse.json(), metaResponse.json()]);
  const bidInput = document.querySelector('#bid-input'); const submitButton = document.querySelector('#bid-submit-button'); const nextButton = document.querySelector('#next-round-button'); const newWarehouseButton = document.querySelector('#new-warehouse-button'); const catalogButton = document.querySelector('#auction-catalog-button'); const resetButton = document.querySelector('#reset-auction-button'); const status = document.querySelector('#auction-status');
  let warehouse; let bidders = []; let history; let clueHistory; let publicKnowledge = new Map(); let condition; let instrumentUsed = false; let targetScanPending = false; let clueRevealPending = false; let clueAnimationToken = 0; let starting = false; let aiTimers = []; let aiDueMarks = new Map(); let revealTimers = []; let roundSafetyTimer = null; let aiDeadlineTimer = null; let settlementTimer = null; let bidDraft = '0'; let roundClosed = false; let ended = false; let disposed = false;
  const format = (amount) => `$${amount.toLocaleString('en-US')}`;
  function createPlayerBidder() { return { bidderId: 'player', name: profile.name, avatar: 'P', money: profile.money, lastBid: null, confirmed: false, revealed: false, dialogue: '' }; }
  function createAiRoster() { return createAiBidders(aiDatabase, auctionMeta.assistants).map((ai) => ({ ...ai, confirmed: false, revealed: false })); }
  // 不論畫面何時重繪，競標固定由玩家與三名電腦組成；這也保護舊快取或中斷狀態。
  function ensureBidders() {
    const existingPlayer = bidders.find((bidder) => bidder?.bidderId === 'player') ?? createPlayerBidder();
    const existingAis = bidders.filter((bidder) => bidder?.bidderId?.startsWith('ai-')).slice(0, 3);
    const knownAiIds = new Set(existingAis.map((bidder) => bidder.bidderId));
    const replacements = createAiRoster().filter((bidder) => !knownAiIds.has(bidder.bidderId)).slice(0, 3 - existingAis.length);
    bidders = [existingPlayer, ...existingAis, ...replacements];
    return bidders;
  }
  const player = () => ensureBidders()[0];
  const fifthBidFor = (bidderId) => history.find((entry) => entry.round === 5)?.bids.find((bid) => bid.bidderId === bidderId)?.amount ?? 0;
  const previousPlayerBid = () => history.at(-1)?.bids.find((bid) => bid.bidderId === 'player')?.amount ?? 0;
  const clearAiTimers = () => { aiTimers.forEach((timer) => window.clearTimeout(timer)); aiTimers = []; aiDueMarks = new Map(); };
  const clearRevealTimers = () => { revealTimers.forEach((timer) => window.clearTimeout(timer)); revealTimers = []; };
  const clearRoundSafety = () => { window.clearTimeout(roundSafetyTimer); roundSafetyTimer = null; };
  const clearAiDeadline = () => { window.clearTimeout(aiDeadlineTimer); aiDeadlineTimer = null; };
  const clearSettlementTimer = () => { window.clearTimeout(settlementTimer); settlementTimer = null; };
  const qualityRank = { '垃圾': 0, '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4, '神話': 5 };
  const selectedVenue = () => auctionMeta.venues.find((entry) => entry.id === profile.auction.selectedVenue) ?? auctionMeta.venues[0];
  const selectedAssistant = () => auctionMeta.assistants.find((entry) => entry.id === profile.auction.selectedAssistant) ?? auctionMeta.assistants[0];
  function setMode(mode) { document.querySelector('.auction-page').classList.toggle('is-preparing', mode === 'lobby'); document.querySelector('.auction-page').classList.toggle('is-playing', mode === 'game'); }
  const conditionWeight = (entry, venue) => entry.weights?.[venue.id] ?? entry.weight ?? 0;
  const chooseCondition = (venue = selectedVenue()) => { const total = conditionConfig.conditions.reduce((sum, entry) => sum + conditionWeight(entry, venue), 0); let roll = Math.random() * total; return conditionConfig.conditions.find((entry) => { roll -= conditionWeight(entry, venue); return roll < 0; }) ?? conditionConfig.conditions[0]; };
  const gemCatalog = catalog.filter((item) => /珍珠|鑽|寶石|鉑金|珠寶|水晶/.test(`${item.name}${item.series}`));
  const effectiveValue = (item) => item.value * (condition?.effect === 'doubleQuality' && item.quality === condition.quality ? 2 : 1);
  const candidateItems = (item, knowledge = item.knowledge) => (condition?.effect === 'gemTransform' && item.eventGem ? gemCatalog : catalog).filter((candidate) => (!knowledge.identity || candidate.id === item.id) && (!knowledge.category || candidate.series === item.series) && (!knowledge.size || (candidate.width === item.width && candidate.height === item.height)) && (!knowledge.quality || candidate.quality === item.quality));
  function renderCondition() { const target = document.querySelector('#auction-condition'); target.querySelector('strong').textContent = condition.title; target.querySelector('span').textContent = condition.description; }
  function valuationRange(knowledgeMap = null) { return warehouse.items.reduce((result, item) => { const knowledge = knowledgeMap?.get(item.slotId) ?? item.knowledge; if (knowledge.value) return { lower: result.lower + item.value, upper: result.upper + item.value }; const values = candidateItems(item, knowledge).map(effectiveValue); return { lower: result.lower + Math.min(...values), upper: result.upper + Math.max(...values) }; }, { lower: 0, upper: 0 }); }
  function recordPublicClue(clue) { for (const item of clue.items ?? []) for (const field of clue.meta.fields ?? []) publicKnowledge.get(item.slotId)[field] = true; }
  function renderValuation() { const totals = valuationRange(); document.querySelector('#warehouse-lower-value').textContent = format(totals.lower); document.querySelector('#warehouse-value-range').textContent = `推測區間 ${format(totals.lower)} ～ ${format(totals.upper)}`; }
  function applyCondition() {
    if (condition.effect === 'qualityBroadcast') {
      const qualities = [...new Set(warehouse.items.map((item) => item.quality))]; const quality = qualities[Math.floor(Math.random() * qualities.length)];
      warehouse.items.filter((item) => item.quality === quality).forEach((item) => { item.knowledge.quality = true; });
      condition = { ...condition, description: condition.description.replace('{quality}', quality) };
    }
    if (condition.effect === 'doubleQuality') warehouse.items.filter((item) => item.quality === condition.quality).forEach((item) => { item.value *= 2; item.eventValueMultiplier = 2; });
    if (condition.effect === 'gemTransform' && gemCatalog.length) warehouse.items.forEach((item) => {
      if (item.width !== 1 || item.height !== 1) return;
      const gem = gemCatalog[Math.floor(Math.random() * gemCatalog.length)]; const knowledge = item.knowledge;
      Object.assign(item, { ...gem, slotId: item.slotId, x: item.x, y: item.y, width: 1, height: 1, knowledge, eventGem: true });
    });
  }
  function renderLobby(message = '') {
    const lobby = document.querySelector('#auction-lobby'); const venue = selectedVenue(); const assistant = selectedAssistant();
    const venueCards = auctionMeta.venues.map((entry) => { const locked = profile.money < entry.minimumMoney; return `<button class="prep-card${entry.id === venue.id ? ' is-selected' : ''}${locked ? ' is-locked' : ''}" type="button" data-venue-id="${entry.id}" ${locked ? 'disabled' : ''}><small>${entry.subtitle}</small><strong>${entry.name}</strong><span>${entry.entryFee ? `入場費 ${format(entry.entryFee)}` : '免費入場'} ・ ${entry.minimumItems}–${entry.maximumItems} 件</span>${locked ? `<em>需資產 ${format(entry.minimumMoney)}</em>` : ''}</button>`; }).join('');
    const assistantCards = auctionMeta.assistants.map((entry) => `<button class="prep-card assistant-card${entry.id === assistant.id ? ' is-selected' : ''}" type="button" data-assistant-id="${entry.id}"><b>${entry.icon}</b><strong>${entry.name}</strong><span>${entry.description}</span></button>`).join('');
    const shopCards = auctionMeta.instruments.map((entry) => `<article class="prep-card"><b>${entry.icon}</b><strong>${entry.name}</strong><span>${entry.description}</span><small>持有 ${profile.auction.instruments[entry.id] ?? 0} 個</small><button type="button" data-buy-instrument="${entry.id}" ${profile.money < entry.cost ? 'disabled' : ''}>${format(entry.cost)} 購入</button></article>`).join('');
    lobby.innerHTML = `<p class="eyebrow">SOLO AUCTION PREP</p><h2>選擇本次競標策略</h2><p class="lobby-copy">會場決定風險與物品池；助理與儀器則決定你能掌握的情報。</p><h3>拍賣會場</h3><div class="prep-card-grid">${venueCards}</div><h3>鑑定助理</h3><div class="prep-card-grid assistant-grid">${assistantCards}</div><h3>鑑定商店</h3><div class="prep-card-grid instrument-shop">${shopCards}</div><p class="lobby-feedback">${message}</p><button id="start-prepared-auction" class="button button-primary" type="button">支付 ${format(venue.entryFee)} 並進入競標</button>`;
  }
  function renderInstrumentPanel() {
    const panel = document.querySelector('#instrument-panel');
    const message = player().confirmed ? '已鎖定出價，無法再使用儀器' : instrumentUsed ? '本回合已使用儀器' : clueRevealPending ? '情報公布中…' : targetScanPending ? '請點選倉庫內的物品' : '選擇一台儀器取得額外情報';
    panel.innerHTML = `<div><small>本回合儀器</small><strong>${message}</strong></div><div>${auctionMeta.instruments.map((entry) => `<button type="button" data-use-instrument="${entry.id}" ${player().confirmed || instrumentUsed || clueRevealPending || targetScanPending || roundClosed || !(profile.auction.instruments[entry.id] > 0) || !instrumentCanReveal(warehouse, entry.effect, clueHistory) ? 'disabled' : ''}><span>${entry.icon}</span>${entry.name}<small>×${profile.auction.instruments[entry.id] ?? 0}</small></button>`).join('')}${targetScanPending ? '<button type="button" data-cancel-target class="target-cancel-button">取消選取</button>' : ''}</div>`;
  }
  function showIntelReveal(clue, slotIds) {
    renderClue(clue); renderClueHistory(); renderWarehouse(warehouse, handleWarehouseItemClick); renderValuation();
    const grid = document.querySelector('#warehouse-grid');
    grid.classList.remove('is-intel-updated'); void grid.offsetWidth; grid.classList.add('is-intel-updated');
    const highlighted = new Set(slotIds.map(String));
    grid.querySelectorAll('.warehouse-item').forEach((cell) => { if (highlighted.has(cell.dataset.slotId)) cell.classList.add('is-new-intel'); });
    window.setTimeout(() => grid.classList.remove('is-intel-updated'), 1700);
  }
  function applyAssistantStart() {
    const assistant = selectedAssistant();
    if (assistant.effect === 'topQuality') {
      const top = Math.max(...warehouse.items.map((item) => qualityRank[item.quality]));
      const target = warehouse.items.find((item) => qualityRank[item.quality] === top);
      target.knowledge.quality = true; target.knowledge.size = true;
      clueHistory.push({ type: 'assistant-top', meta: { title: `${assistant.name} 的開場判讀`, description: '已鎖定最高品質物品。' }, items: [target] });
    }
    if (assistant.effect === 'topValue') {
      const targets = [...warehouse.items].sort((left, right) => right.value - left.value).slice(0, 2);
      targets.forEach((item) => { item.knowledge.value = true; });
      clueHistory.push({ type: 'assistant-top-value', meta: { title: `${assistant.name} 的開場判讀`, description: '已公開本局價值最高兩件物品的固定價值。' }, items: targets });
    }
    if (assistant.effect === 'rareCount') {
      const count = warehouse.items.filter((item) => qualityRank[item.quality] >= qualityRank['稀有']).length;
      clueHistory.push({ type: 'assistant-count', meta: { title: `${assistant.name} 的統計`, description: `本倉庫共有 ${count} 件稀有以上物品。` }, items: [], summary: `稀有以上共 ${count} 件` });
    }
    if (assistant.effect === 'totalCells') clueHistory.push(makeTotalCellsClue(warehouse, `${assistant.name} 的空間分析`));
  }
  function applyAssistantRound(round) {
    const assistant = selectedAssistant();
    if (assistant.effect === 'extraClue' && [1, 3].includes(round)) {
      const previousSlots = clueHistory.flatMap((entry) => entry.items?.map((item) => item.slotId) ?? []);
      return revealBonusClue(warehouse, previousSlots);
    }
    if (assistant.effect === 'valueRange' && round === 2) return makeValueRangeClue(warehouse, `${assistant.name} 的風險估價`, assistant.rangeStep);
    if (assistant.effect === 'blindSpot' && round === 3) return revealBlindSpotClue(warehouse, `${assistant.name} 的盲點調查`);
    return null;
  }

  function renderBidders() {
    ensureBidders();
    const target = document.querySelector('#bidders-list');
    bidders.forEach((bidder) => {
      let row = target.querySelector(`[data-bidder-id="${bidder.bidderId}"]`);
      if (!row) {
        row = document.createElement('div');
        row.className = 'bidder-row';
        row.dataset.bidderId = bidder.bidderId;
        row.innerHTML = '<span class="bidder-avatar"></span><span class="bidder-name"><strong></strong></span><span class="bidder-bid"></span>';
        target.append(row);
      }
      const bidText = bidderStatus(bidder, bidders, condition.effect === 'rankOnly');
      row.classList.toggle('is-player', bidder.bidderId === 'player');
      row.classList.toggle('is-complete', bidder.confirmed);
      row.classList.toggle('is-revealed', bidder.revealed);
      row.querySelector('.bidder-avatar').textContent = bidder.avatar;
      row.querySelector('.bidder-name strong').textContent = bidder.name;
      row.querySelector('.bidder-bid').textContent = bidText;
    });
  }
  function renderHistory() { const target = document.querySelector('#bid-history'); if (!history.length) { target.replaceChildren(); return; } const rows = history.map((entry) => { const bids = condition.effect === 'rankOnly' ? [...entry.bids].sort((left, right) => right.amount - left.amount).map((bid, index) => `<small>${bid.name} ${bid.amount === 0 ? '放棄' : `第 ${index + 1} 名`}</small>`) : entry.bids.map((bid) => `<small>${bid.name} ${bid.amount === 0 ? '放棄' : format(bid.amount)}</small>`); return `<div class="history-round"><span>第 ${entry.round} 回</span>${bids.join('')}</div>`; }); target.innerHTML = `<strong>${condition.effect === 'rankOnly' ? '歷史名次' : '歷史出價'}</strong>${rows.join('')}`; }
  function renderClueHistory() { const target = document.querySelector('#clue-history'); target.replaceChildren(...clueHistory.map((clue, index) => { const entry = document.createElement('div'); const labels = clue.items?.map((item) => `#${String(item.slotId).padStart(2, '0')}`).join('、') || clue.summary; entry.innerHTML = `<strong>第 ${index + 1} 條</strong><span>${clue.meta.title}：${labels}</span>`; return entry; })); }
  function openMiniCatalog(targetItem = null) {
    document.querySelector('#auction-catalog-modal')?.remove(); const rank = { '垃圾': 0, '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4, '神話': 5 };
    const candidates = catalog.filter((item) => !targetItem || ((!targetItem.knowledge.identity || item.id === targetItem.id) && (!targetItem.knowledge.category || item.series === targetItem.series) && (!targetItem.knowledge.value || item.value === targetItem.value) && (!targetItem.knowledge.size || (item.width === targetItem.width && item.height === targetItem.height)) && (!targetItem.knowledge.quality || item.quality === targetItem.quality))).sort((left, right) => rank[right.quality] - rank[left.quality] || right.value - left.value);
    const modal = document.createElement('div'); modal.id = 'auction-catalog-modal'; modal.className = 'auction-catalog-modal'; modal.innerHTML = `<section><button class="catalog-close" type="button" aria-label="關閉小圖鑑">×</button><p class="eyebrow">${targetItem ? 'POSSIBLE MATCHES' : 'AUCTION CATALOG'}</p><h3>${targetItem ? `可能物品（${candidates.length}）` : '小圖鑑'}</h3><p>${targetItem ? '依已公開情報篩選，品質由高至低。' : '完整物品目錄，品質由高至低。'}</p><div class="auction-catalog-list">${candidates.slice(0, 80).map((item) => `<article class="mini-item quality-${item.quality}"><span>${item.image}</span><div><small>${item.quality} · ${item.series}</small><strong>${item.name}</strong><em>${format(item.value)}　${item.width}×${item.height} 格</em></div></article>`).join('') || '<p>沒有符合目前情報的候選物品。</p>'}</div></section>`; modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('.catalog-close')) modal.remove(); }); document.body.append(modal);
  }
  function clearTargetScan() {
    targetScanPending = false;
    document.querySelector('#target-scan-modal')?.remove();
    document.querySelector('#warehouse-grid').classList.remove('is-targeting');
    catalogButton.disabled = false;
  }
  function cancelTargetScan() {
    if (!targetScanPending) return;
    clearTargetScan(); renderInstrumentPanel();
    if (!player().confirmed && !roundClosed && !clueRevealPending) setBidControls(true, controller.getRound() === 6 ? fifthBidFor('player') : 0);
    status.textContent = '已取消定點掃描，道具未消耗。';
  }
  function openTargetScanOptions(item) {
    if (!targetScanPending || roundClosed || ended || player().confirmed) return;
    if (item.knowledge.quality && item.knowledge.size) { status.textContent = `物品 #${String(item.slotId).padStart(2, '0')} 的品質與大小已知，請選另一件。`; return; }
    document.querySelector('#target-scan-modal')?.remove();
    const modal = document.createElement('div'); modal.id = 'target-scan-modal'; modal.className = 'target-scan-modal';
    modal.innerHTML = `<section role="dialog" aria-modal="true" aria-label="定點掃描選擇"><p class="eyebrow">TARGET SCAN</p><h3>物品 #${String(item.slotId).padStart(2, '0')}</h3><p>選擇要揭露的情報；確認後才會消耗一支掃描筆。</p><div><button type="button" data-scan-field="quality" ${item.knowledge.quality ? 'disabled' : ''}>揭露品質</button><button type="button" data-scan-field="size" ${item.knowledge.size ? 'disabled' : ''}>揭露大小</button></div><button class="target-scan-cancel" type="button">取消使用</button></section>`;
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('.target-scan-cancel')) { cancelTargetScan(); return; }
      const field = event.target.closest('[data-scan-field]')?.dataset.scanField;
      if (!field || !targetScanPending || roundClosed || ended || player().confirmed) return;
      const instrument = auctionMeta.instruments.find((entry) => entry.effect === 'targeted');
      if (!instrument || !(profile.auction.instruments[instrument.id] > 0)) { cancelTargetScan(); return; }
      const clue = revealTargetedClue(warehouse, item.slotId, field);
      if (!clue) return;
      clearTargetScan();
      consumeInstrument(instrument, clue);
    });
    document.body.append(modal);
    modal.querySelector('[data-scan-field]:not([disabled])')?.focus();
  }
  function handleWarehouseItemClick(item) {
    if (targetScanPending) openTargetScanOptions(item);
    else openMiniCatalog(item);
  }
  function setBidControls(enabled, minimum = 0, { resetValue = false } = {}) { bidInput.disabled = !enabled; submitButton.disabled = !enabled; if (resetValue) { bidDraft = String(minimum || 0); bidInput.value = bidDraft; } document.querySelector('#bid-minimum').textContent = minimum ? `本回合最低出價：${format(minimum)}` : '可輸入 0 放棄競標'; }
  const shuffleBidders = (entries) => [...entries].sort(() => Math.random() - 0.5);
  function allConfirmed() { ensureBidders(); return bidders.every((bidder) => bidder.confirmed); }
  function maybeCloseRound() { if (!roundClosed && allConfirmed()) closeRound(); }
  function commitAiBid(ai, round) {
    if (disposed || roundClosed || ai.confirmed || controller.getRound() !== round) return false;
    const minimum = round === 6 ? fifthBidFor(ai.bidderId) : 1;
    try {
      makeAiBid(ai, warehouse, aiDatabase, { minimum, playerPreviousBid: previousPlayerBid(), valuationRange: valuationRange(publicKnowledge) });
    } catch {
      // 即使單一角色資料有問題，也必須完成本回合，不能讓整個競標卡住。
      ai.lastBid = Math.min(Number(ai.money) || 100000, Math.max(minimum, 1000));
    }
    ai.confirmed = true;
    return true;
  }
  function confirmAiBid(ai, round) {
    if (!commitAiBid(ai, round)) return;
    playSound('bid'); renderBidders(); maybeCloseRound();
  }
  function scheduleAiBids(round, afterPlayerBid = false) {
    ensureBidders();
    if (afterPlayerBid) clearAiTimers();
    const waitingAis = shuffleBidders(bidders.slice(1).filter((ai) => !ai.confirmed));
    const marks = createAiBidRemainingMarks(waitingAis.length, { afterPlayerBid, currentRemaining: controller.getRemaining() });
    waitingAis.forEach((ai, index) => aiDueMarks.set(ai.bidderId, { round, remaining: marks[index] }));
  }
  function processDueAiBids(round, remaining) {
    if (!warehouse || disposed || ended || roundClosed || controller.getRound() !== round) return;
    const dueAis = bidders.slice(1).filter((ai) => !ai.confirmed && aiDueMarks.get(ai.bidderId)?.round === round && remaining <= aiDueMarks.get(ai.bidderId).remaining);
    if (!dueAis.length) return;
    dueAis.forEach((ai) => { aiDueMarks.delete(ai.bidderId); commitAiBid(ai, round); });
    playSound('bid'); renderBidders(); maybeCloseRound();
  }
  function forceAiBids(round) {
    if (disposed || roundClosed || controller.getRound() !== round) return;
    ensureBidders(); clearAiTimers(); clearAiDeadline();
    let submitted = false;
    bidders.slice(1).filter((ai) => !ai.confirmed).forEach((ai) => { submitted = commitAiBid(ai, round) || submitted; });
    if (submitted) { playSound('bid'); renderBidders(); }
    maybeCloseRound();
  }
  function finishExpiredRound(round) { if (disposed || ended || roundClosed || controller.getRound() !== round) return; if (!player().confirmed) { status.textContent = '時間到，未提交出價視為放棄。'; submitPlayerBid(0); } forceAiBids(round); }
  function beginRound(round) {
    clearTargetScan(); clearAiTimers(); clearAiDeadline(); clearRevealTimers(); clearSettlementTimer(); clearRoundSafety(); ensureBidders(); roundClosed = false; instrumentUsed = false; clueRevealPending = false; bidders.forEach((bidder) => { bidder.lastBid = null; bidder.confirmed = false; bidder.revealed = false; bidder.dialogue = ''; });
    const previousSlots = clueHistory.flatMap((clueEntry) => clueEntry.items?.map((item) => item.slotId) ?? []);
    const clue = round <= 5 ? revealClue(warehouse, round, previousSlots) : { meta: { title: '平手決勝回合', description: '最高價平手，本回合出價不可低於第五回合價格。' }, items: [] };
    const announcedClues = [];
    if (clue.type !== 'none') { clueHistory.push(clue); announcedClues.push(clue); recordPublicClue(clue); }
    if (condition.effect === 'bonusClue' && (round === 1 || round === 3)) {
      const previousSlots = clueHistory.flatMap((entry) => entry.items?.map((item) => item.slotId) ?? []);
      const bonusClue = revealBonusClue(warehouse, previousSlots);
      clueHistory.push(bonusClue); announcedClues.push(bonusClue); recordPublicClue(bonusClue);
    }
    const assistantClue = applyAssistantRound(round);
    if (assistantClue) { clueHistory.push(assistantClue); announcedClues.push(assistantClue); }
    const minimum = round === 6 ? fifthBidFor('player') : 0;
    const readyMessage = round === 6 ? '平手決勝：請提交不低於第五回合的出價。' : '查看情報後，提交本回合唯一出價。';
    const token = ++clueAnimationToken;
    clueRevealPending = announcedClues.length > 0;
    renderCondition(); renderInstrumentPanel(); renderBidders(); renderHistory();
    setBidControls(!clueRevealPending, minimum, { resetValue: true });
    nextButton.hidden = true; newWarehouseButton.hidden = true;
    status.textContent = clueRevealPending ? '正在公布本回合情報…' : readyMessage;
    const reveal = () => {
      if (disposed || ended || controller.getRound() !== round || token !== clueAnimationToken) return;
      clueRevealPending = false;
      if (announcedClues.length) showIntelReveal(clue, announcedClues.flatMap((entry) => entry.items.map((item) => item.slotId)));
      else { renderClue(clue); renderClueHistory(); renderWarehouse(warehouse, handleWarehouseItemClick); renderValuation(); }
      renderInstrumentPanel(); setBidControls(!player().confirmed, minimum);
      if (!roundClosed) status.textContent = readyMessage;
    };
    if (clueRevealPending) playClueAnimation(announcedClues.map((entry) => entry.meta.title).join(' ＋ '), announcedClues.reduce((sum, entry) => sum + entry.items.length, 0)).then(reveal);
    else reveal();
    scheduleAiBids(round); roundSafetyTimer = window.setTimeout(() => finishExpiredRound(round), 60500);
  }
  function completeAuction(message) { ended = true; clearAiTimers(); clearAiDeadline(); clearSettlementTimer(); clearRoundSafety(); controller.stop(); setBidControls(false); status.textContent = message; newWarehouseButton.hidden = false; nextButton.hidden = true; }
  function settleWinner(winner) {
    const warehouseValue = warehouse.items.reduce((sum, item) => sum + item.value, 0);
    if (winner.bidderId === 'player' && winner.amount > 0) { const profit = warehouseValue - winner.amount; const welfare = condition.effect === 'welfareBonus' ? Math.floor(warehouseValue * 0.3) : 0; profile.money += welfare - winner.amount; profile.stats.wins += 1; const acquired = addCollectedItems(profile, warehouse.items); onProfileChange(profile); playSound('win'); playUnboxingAnimation(warehouse.items); completeAuction(`恭喜得標！成交價 ${format(winner.amount)}，倉庫總價值 ${format(warehouseValue)}，${profit >= 0 ? '預估盈餘' : '預估虧損'} ${format(Math.abs(profit))}${welfare ? `，福利金 ${format(welfare)}` : ''}，獲得 ${acquired.length} 件收藏品。`); return; }
    if (winner.amount > 0) playUnboxingAnimation(warehouse.items, { title: `${winner.name} 得標開箱`, description: `成交價 ${format(winner.amount)}，現在揭曉本倉庫的全部 ${warehouse.items.length} 件藏品。` });
    if (winner.amount > warehouseValue) { completeAuction(`${winner.name} 以 ${format(winner.amount)} 得標，但高於實際價值。你成功避開接盤。`); return; }
    completeAuction(winner.amount === 0 ? '所有競標者皆放棄，本倉庫流標。' : `${winner.name} 以 ${format(winner.amount)} 得標。`);
  }
  function resolveRound(bids) {
    const result = getHighestBidders(bids); renderHistory(); const round = controller.getRound();
    const secondHighest = [...bids].sort((left, right) => right.amount - left.amount)[1]?.amount ?? 0;
    const earlyThresholds = { 1: 2, 2: 1.7, 3: 1.5, 4: 1.3 };
    if (earlyThresholds[round] && secondHighest > 0 && result.bidders.length === 1 && result.highestBid > secondHighest * earlyThresholds[round]) { settleWinner(result.bidders[0]); return; }
    if (round < 5) { status.textContent = `本回合最高出價為 ${format(result.highestBid)}，即將進入下一回合。`; nextButton.hidden = true; if (!disposed && !ended) controller.start(round + 1); return; }
    if (round === 5 && result.highestBid > 0 && result.bidders.length > 1) { status.textContent = `最高價 ${format(result.highestBid)} 平手，進入第六回合決勝。`; nextButton.hidden = false; nextButton.textContent = '進入平手決勝'; return; }
    if (round === 6 && result.highestBid > 0 && result.bidders.length > 1) { completeAuction(`第六回合仍以 ${format(result.highestBid)} 平手，本倉庫流標。`); return; }
    settleWinner(result.bidders[0]);
  }
  function closeRound() {
    if (roundClosed) return; roundClosed = true; clearAiTimers(); clearAiDeadline(); clearRoundSafety(); controller.stop(); const bids = bidders.map((bidder) => ({ bidderId: bidder.bidderId, name: bidder.name, amount: bidder.lastBid })); history.push({ round: controller.getRound(), bids }); status.textContent = '全員已完成喊價，準備公布結果…'; renderBidders();
    bidders.forEach((bidder, index) => { revealTimers.push(window.setTimeout(() => { if (disposed || ended) return; bidder.revealed = true; playSound('bid'); renderBidders(); if (index === bidders.length - 1) { status.textContent = '所有出價已公布，正在確認結果…'; clearSettlementTimer(); settlementTimer = window.setTimeout(() => resolveRound(bids), 2000); } }, 450 + index * 650)); });
  }
  function submitPlayerBid(forcedAmount) {
    if (roundClosed || ended || player().confirmed || ((clueRevealPending || targetScanPending) && forcedAmount == null)) return; if (targetScanPending) clearTargetScan(); const round = controller.getRound(); const minimum = round === 6 ? fifthBidFor('player') : 0; const validation = validatePlayerBid(forcedAmount ?? bidDraft, { money: profile.money, minimum }); if (!validation.valid) { status.textContent = validation.message; return; }
    player().lastBid = validation.amount; player().confirmed = true; player().dialogue = validation.amount === 0 ? '本回合選擇放棄。' : `已鎖定出價 ${format(validation.amount)}。`; playSound('bid'); setBidControls(false); renderInstrumentPanel(); status.textContent = '你已完成喊價。'; renderBidders(); if (!allConfirmed()) scheduleAiBids(round, true); maybeCloseRound();
  }
  const controller = createRoundController({ onChange: beginRound, onTick: processDueAiBids, onExpire: () => finishExpiredRound(controller.getRound()) });
  async function startWarehouse() { if (starting) return; starting = true; const venue = selectedVenue(); if (profile.money < venue.minimumMoney) { renderLobby(`資產不足，需要至少 ${format(venue.minimumMoney)} 才能進入此會場。`); starting = false; return; } clearAiTimers(); clearAiDeadline(); clearRevealTimers(); clearSettlementTimer(); profile.money -= venue.entryFee; const itemPool = catalog.filter((item) => qualityRank[item.quality] >= qualityRank[venue.minimumQuality]); warehouse = generateWarehouse({ ...template, warehouse: { ...template.warehouse, minimumItems: venue.minimumItems, maximumItems: venue.maximumItems }, prototypeItems: itemPool }); condition = chooseCondition(venue); applyCondition(); publicKnowledge = new Map(warehouse.items.map((item) => [item.slotId, { ...item.knowledge }])); bidders = [createPlayerBidder(), ...createAiRoster()]; ensureBidders(); history = []; clueHistory = []; applyAssistantStart(); ended = false; profile.stats.auctions += 1; onProfileChange(profile); setMode('game'); renderWarehouse(warehouse, handleWarehouseItemClick); renderValuation(); playSound('reveal'); await playConditionDraw(conditionConfig.conditions, condition); if (!disposed && !ended) { playGameAnimation('reveal', '新倉庫開啟'); controller.start(1); } starting = false; }
  const handleSubmit = () => submitPlayerBid(); const handleNext = () => { if (roundClosed) controller.start(controller.getRound() === 5 ? 6 : controller.getRound() + 1); }; const focusBidInput = (event) => { if (!bidInput.disabled && event.target !== bidInput) bidInput.focus(); }; const syncBidDraft = () => { bidDraft = bidInput.value; };
  function consumeInstrument(instrument, clue) {
    if (!instrument || !clue || player().confirmed || roundClosed || ended || !(profile.auction.instruments[instrument.id] > 0)) return false;
    profile.auction.instruments[instrument.id] -= 1; instrumentUsed = true; clueRevealPending = true;
    clueHistory.push(clue); onProfileChange(profile); renderInstrumentPanel(); setBidControls(false);
    const round = controller.getRound(); const token = ++clueAnimationToken;
    status.textContent = `正在公布${instrument.name}情報…`;
    playClueAnimation(instrument.name, clue.items.length).then(() => {
      if (disposed || ended || controller.getRound() !== round || token !== clueAnimationToken) return;
      clueRevealPending = false;
      showIntelReveal(clue, clue.items.map((item) => item.slotId));
      renderInstrumentPanel(); setBidControls(!player().confirmed && !roundClosed); if (!roundClosed) status.textContent = `${instrument.name} 已完成分析。`;
    });
    return true;
  }
  function useInstrument(id) {
    if (player().confirmed || clueRevealPending || targetScanPending || instrumentUsed || roundClosed || ended || !(profile.auction.instruments[id] > 0)) return;
    const instrument = auctionMeta.instruments.find((entry) => entry.id === id);
    if (!instrument || !instrumentCanReveal(warehouse, instrument.effect, clueHistory)) return;
    if (instrument.effect === 'targeted') {
      targetScanPending = true;
      document.querySelector('#warehouse-grid').classList.add('is-targeting');
      catalogButton.disabled = true;
      renderInstrumentPanel(); setBidControls(false);
      status.textContent = '請點選倉庫中要掃描的物品，再選擇品質或大小。';
      document.querySelector('#warehouse-grid').scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return;
    }
    consumeInstrument(instrument, revealInstrumentClue(warehouse, instrument.effect, instrument.count));
  }
  function handleLobbyClick(event) { const venueId = event.target.closest('[data-venue-id]')?.dataset.venueId; const assistantId = event.target.closest('[data-assistant-id]')?.dataset.assistantId; const buyId = event.target.closest('[data-buy-instrument]')?.dataset.buyInstrument; if (venueId) { profile.auction.selectedVenue = venueId; onProfileChange(profile); renderLobby(); } if (assistantId) { profile.auction.selectedAssistant = assistantId; onProfileChange(profile); renderLobby(); } if (buyId) { const instrument = auctionMeta.instruments.find((entry) => entry.id === buyId); if (profile.money >= instrument.cost) { profile.money -= instrument.cost; profile.auction.instruments[buyId] = (profile.auction.instruments[buyId] ?? 0) + 1; onProfileChange(profile); renderLobby(`${instrument.name} 已放入補給箱。`); } } if (event.target.closest('#start-prepared-auction')) startWarehouse(); }
  const handleReset = () => { clearTargetScan(); clueAnimationToken += 1; document.querySelector('#clue-fx')?.remove(); clearAiTimers(); clearAiDeadline(); clearSettlementTimer(); clearRoundSafety(); controller.stop(); ended = true; setMode('lobby'); renderLobby(); };
  const handleUseInstrument = (event) => { if (event.target.closest('[data-cancel-target]')) { cancelTargetScan(); return; } const id = event.target.closest('[data-use-instrument]')?.dataset.useInstrument; if (id) useInstrument(id); };
  const handleCatalog = () => { if (!targetScanPending) openMiniCatalog(); };
  const handleEscape = (event) => { if (event.key === 'Escape' && targetScanPending) cancelTargetScan(); };
  document.querySelector('.bid-input-wrap').addEventListener('pointerdown', focusBidInput); bidInput.addEventListener('input', syncBidDraft); submitButton.addEventListener('click', handleSubmit); nextButton.addEventListener('click', handleNext); newWarehouseButton.addEventListener('click', handleReset); resetButton.addEventListener('click', handleReset); catalogButton.addEventListener('click', handleCatalog); document.querySelector('#auction-lobby').addEventListener('click', handleLobbyClick); document.querySelector('#instrument-panel').addEventListener('click', handleUseInstrument); document.addEventListener('keydown', handleEscape); setMode('lobby'); renderLobby();
  return { leave: () => { if (!roundClosed && !ended && warehouse) submitPlayerBid(0); }, destroy: () => { disposed = true; clearTargetScan(); clueAnimationToken += 1; document.querySelector('#clue-fx')?.remove(); clearAiTimers(); clearAiDeadline(); clearSettlementTimer(); clearRoundSafety(); document.querySelector('#auction-catalog-modal')?.remove(); document.querySelector('#condition-draw-fx')?.remove(); controller.destroy(); document.querySelector('.bid-input-wrap').removeEventListener('pointerdown', focusBidInput); bidInput.removeEventListener('input', syncBidDraft); submitButton.removeEventListener('click', handleSubmit); nextButton.removeEventListener('click', handleNext); newWarehouseButton.removeEventListener('click', handleReset); resetButton.removeEventListener('click', handleReset); catalogButton.removeEventListener('click', handleCatalog); document.querySelector('#auction-lobby').removeEventListener('click', handleLobbyClick); document.querySelector('#instrument-panel').removeEventListener('click', handleUseInstrument); document.removeEventListener('keydown', handleEscape); } };
}
