import { generateWarehouse, renderWarehouse } from './warehouse.js';
import { revealBonusClue, revealClue, revealInstrumentClue, renderClue } from './clue.js';
import { createRoundController } from './round.js';
import { createAiBidders, makeAiBid } from '../ai/aiEngine.js';
import { getHighestBidders, validatePlayerBid } from './bid.js';
import { loadCatalog } from '../encyclopedia/encyclopedia.js';
import { addCollectedItems } from '../utils/storage.js';
import { playSound } from '../utils/audio.js';
import { playClueAnimation, playConditionDraw, playGameAnimation, playUnboxingAnimation } from './animation.js';

export async function createAuction({ profile, onProfileChange }) {
  const [warehouseResponse, aiResponse, conditionResponse, metaResponse, catalog] = await Promise.all([fetch('data/warehouseTemplates.json'), fetch('data/ai.json'), fetch('data/auctionConditions.json'), fetch('data/auctionMeta.json'), loadCatalog()]);
  if (!warehouseResponse.ok || !aiResponse.ok || !conditionResponse.ok || !metaResponse.ok) throw new Error('無法載入競標資料。');
  const [template, aiDatabase, conditionConfig, auctionMeta] = await Promise.all([warehouseResponse.json(), aiResponse.json(), conditionResponse.json(), metaResponse.json()]);
  const bidInput = document.querySelector('#bid-input'); const submitButton = document.querySelector('#bid-submit-button'); const nextButton = document.querySelector('#next-round-button'); const newWarehouseButton = document.querySelector('#new-warehouse-button'); const catalogButton = document.querySelector('#auction-catalog-button'); const resetButton = document.querySelector('#reset-auction-button'); const status = document.querySelector('#auction-status');
  let warehouse; let bidders = []; let history; let clueHistory; let condition; let instrumentUsed = false; let starting = false; let aiTimers = []; let revealTimers = []; let roundSafetyTimer = null; let bidDraft = '0'; let roundClosed = false; let ended = false; let disposed = false;
  const format = (amount) => `$${amount.toLocaleString('en-US')}`;
  function createPlayerBidder() { return { bidderId: 'player', name: profile.name, avatar: 'P', money: profile.money, lastBid: null, confirmed: false, revealed: false, dialogue: '' }; }
  function createAiRoster() { return createAiBidders(aiDatabase).map((ai) => ({ ...ai, confirmed: false, revealed: false })); }
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
  const clearAiTimers = () => { aiTimers.forEach((timer) => window.clearTimeout(timer)); aiTimers = []; };
  const clearRevealTimers = () => { revealTimers.forEach((timer) => window.clearTimeout(timer)); revealTimers = []; };
  const clearRoundSafety = () => { window.clearTimeout(roundSafetyTimer); roundSafetyTimer = null; };
  const qualityRank = { '垃圾': 0, '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4, '神話': 5 };
  const selectedVenue = () => auctionMeta.venues.find((entry) => entry.id === profile.auction.selectedVenue) ?? auctionMeta.venues[0];
  const selectedAssistant = () => auctionMeta.assistants.find((entry) => entry.id === profile.auction.selectedAssistant) ?? auctionMeta.assistants[0];
  function setMode(mode) { document.querySelector('.auction-page').classList.toggle('is-preparing', mode === 'lobby'); document.querySelector('.auction-page').classList.toggle('is-playing', mode === 'game'); }
  const conditionWeight = (entry, venue) => entry.weights?.[venue.id] ?? entry.weight ?? 0;
  const chooseCondition = (venue = selectedVenue()) => { const total = conditionConfig.conditions.reduce((sum, entry) => sum + conditionWeight(entry, venue), 0); let roll = Math.random() * total; return conditionConfig.conditions.find((entry) => { roll -= conditionWeight(entry, venue); return roll < 0; }) ?? conditionConfig.conditions[0]; };
  const gemCatalog = catalog.filter((item) => /珍珠|鑽|寶石|鉑金|珠寶|水晶/.test(`${item.name}${item.series}`));
  const effectiveValue = (item) => item.value * (condition?.effect === 'doubleQuality' && item.quality === condition.quality ? 2 : 1);
  const candidateItems = (item) => (condition?.effect === 'gemTransform' && item.eventGem ? gemCatalog : catalog).filter((candidate) => (!item.knowledge.identity || candidate.id === item.id) && (!item.knowledge.category || candidate.series === item.series) && (!item.knowledge.size || (candidate.width === item.width && candidate.height === item.height)) && (!item.knowledge.quality || candidate.quality === item.quality));
  function renderCondition() { const target = document.querySelector('#auction-condition'); target.querySelector('strong').textContent = condition.title; target.querySelector('span').textContent = condition.description; }
  function renderValuation() { const totals = warehouse.items.reduce((result, item) => { if (item.knowledge.value) return { lower: result.lower + item.value, upper: result.upper + item.value }; const values = candidateItems(item).map(effectiveValue); return { lower: result.lower + Math.min(...values), upper: result.upper + Math.max(...values) }; }, { lower: 0, upper: 0 }); document.querySelector('#warehouse-lower-value').textContent = format(totals.lower); document.querySelector('#warehouse-value-range').textContent = `推測區間 ${format(totals.lower)} ～ ${format(totals.upper)}`; }
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
      Object.assign(item, { ...gem, x: item.x, y: item.y, width: 1, height: 1, knowledge, eventGem: true });
    });
  }
  function renderLobby(message = '') {
    const lobby = document.querySelector('#auction-lobby'); const venue = selectedVenue(); const assistant = selectedAssistant();
    const venueCards = auctionMeta.venues.map((entry) => { const locked = profile.money < entry.minimumMoney; return `<button class="prep-card${entry.id === venue.id ? ' is-selected' : ''}${locked ? ' is-locked' : ''}" type="button" data-venue-id="${entry.id}" ${locked ? 'disabled' : ''}><small>${entry.subtitle}</small><strong>${entry.name}</strong><span>${entry.entryFee ? `入場費 ${format(entry.entryFee)}` : '免費入場'} ・ ${entry.minimumItems}–${entry.maximumItems} 件</span>${locked ? `<em>需資產 ${format(entry.minimumMoney)}</em>` : ''}</button>`; }).join('');
    const assistantCards = auctionMeta.assistants.map((entry) => `<button class="prep-card assistant-card${entry.id === assistant.id ? ' is-selected' : ''}" type="button" data-assistant-id="${entry.id}"><b>${entry.icon}</b><strong>${entry.name}</strong><span>${entry.description}</span></button>`).join('');
    const shopCards = auctionMeta.instruments.map((entry) => `<article class="prep-card"><b>${entry.icon}</b><strong>${entry.name}</strong><span>${entry.description}</span><small>持有 ${profile.auction.instruments[entry.id] ?? 0} 個</small><button type="button" data-buy-instrument="${entry.id}" ${profile.money < entry.cost ? 'disabled' : ''}>${format(entry.cost)} 購入</button></article>`).join('');
    lobby.innerHTML = `<p class="eyebrow">SOLO AUCTION PREP</p><h2>選擇本次競標策略</h2><p class="lobby-copy">會場決定風險與物品池；助理與儀器則決定你能掌握的情報。</p><h3>拍賣會場</h3><div class="prep-card-grid">${venueCards}</div><h3>鑑定助理</h3><div class="prep-card-grid assistant-grid">${assistantCards}</div><h3>鑑定商店</h3><div class="prep-card-grid instrument-shop">${shopCards}</div><p class="lobby-feedback">${message}</p><button id="start-prepared-auction" class="button button-primary" type="button">支付 ${format(venue.entryFee)} 並進入競標</button>`;
  }
  function renderInstrumentPanel() { const panel = document.querySelector('#instrument-panel'); panel.innerHTML = `<div><small>本回合儀器</small><strong>${instrumentUsed ? '本回合已使用儀器' : '選擇一台儀器取得額外情報'}</strong></div><div>${auctionMeta.instruments.map((entry) => `<button type="button" data-use-instrument="${entry.id}" ${instrumentUsed || !(profile.auction.instruments[entry.id] > 0) ? 'disabled' : ''}><span>${entry.icon}</span>${entry.name}<small>×${profile.auction.instruments[entry.id] ?? 0}</small></button>`).join('')}</div>`; }
  function applyAssistantStart() { const assistant = selectedAssistant(); if (assistant.effect === 'topQuality') { const top = Math.max(...warehouse.items.map((item) => qualityRank[item.quality])); const target = warehouse.items.find((item) => qualityRank[item.quality] === top); target.knowledge.quality = true; target.knowledge.size = true; clueHistory.push({ type: 'assistant-top', meta: { title: `${assistant.name} 的開場判讀`, description: '已鎖定最高品質物品。' }, items: [target] }); } if (assistant.effect === 'rareCount') { const count = warehouse.items.filter((item) => qualityRank[item.quality] >= qualityRank['稀有']).length; clueHistory.push({ type: 'assistant-count', meta: { title: `${assistant.name} 的統計`, description: `本倉庫共有 ${count} 件稀有以上物品。` }, items: [], summary: `稀有以上共 ${count} 件` }); } }
  function applyAssistantRound(round) { if (selectedAssistant().effect !== 'extraClue' || ![1, 3].includes(round)) return null; const previousIds = clueHistory.flatMap((entry) => entry.items?.map((item) => item.id) ?? []); return revealBonusClue(warehouse, previousIds); }

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
      const rank = 1 + bidders.filter((other) => other.lastBid > bidder.lastBid).length;
      const completedBid = bidder.lastBid === 0 ? '放棄本回合' : condition.effect === 'rankOnly' ? `第 ${rank} 名` : format(bidder.lastBid);
      const bidText = bidder.lastBid === null ? '等待出價' : bidder.revealed ? completedBid : '已完成喊價';
      row.classList.toggle('is-player', bidder.bidderId === 'player');
      row.querySelector('.bidder-avatar').textContent = bidder.avatar;
      row.querySelector('.bidder-name strong').textContent = bidder.name;
      row.querySelector('.bidder-bid').textContent = bidText;
    });
  }
  function renderHistory() { const target = document.querySelector('#bid-history'); if (!history.length) { target.replaceChildren(); return; } const rows = history.map((entry) => { const bids = condition.effect === 'rankOnly' ? [...entry.bids].sort((left, right) => right.amount - left.amount).map((bid, index) => `<small>${bid.name} ${bid.amount === 0 ? '放棄' : `第 ${index + 1} 名`}</small>`) : entry.bids.map((bid) => `<small>${bid.name} ${bid.amount === 0 ? '放棄' : format(bid.amount)}</small>`); return `<div class="history-round"><span>第 ${entry.round} 回</span>${bids.join('')}</div>`; }); target.innerHTML = `<strong>${condition.effect === 'rankOnly' ? '歷史名次' : '歷史出價'}</strong>${rows.join('')}`; }
  function renderClueHistory() { const target = document.querySelector('#clue-history'); target.replaceChildren(...clueHistory.map((clue, index) => { const entry = document.createElement('div'); const labels = clue.items?.map((item) => `#${item.id.slice(-3)}`).join('、') || clue.summary; entry.innerHTML = `<strong>第 ${index + 1} 條</strong><span>${clue.meta.title}：${labels}</span>`; return entry; })); }
  function openMiniCatalog(targetItem = null) {
    document.querySelector('#auction-catalog-modal')?.remove(); const rank = { '垃圾': 0, '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4, '神話': 5 };
    const candidates = catalog.filter((item) => !targetItem || ((!targetItem.knowledge.identity || item.id === targetItem.id) && (!targetItem.knowledge.category || item.series === targetItem.series) && (!targetItem.knowledge.value || item.value === targetItem.value) && (!targetItem.knowledge.size || (item.width === targetItem.width && item.height === targetItem.height)) && (!targetItem.knowledge.quality || item.quality === targetItem.quality))).sort((left, right) => rank[right.quality] - rank[left.quality] || right.value - left.value);
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
  function forceAiBids(round) { clearAiTimers(); bidders.slice(1).filter((ai) => !ai.confirmed).forEach((ai) => confirmAiBid(ai, round)); }
  function finishExpiredRound(round) { if (disposed || ended || roundClosed || controller.getRound() !== round) return; if (!player().confirmed) { status.textContent = '時間到，未提交出價視為放棄。'; submitPlayerBid(0); } forceAiBids(round); }
  function beginRound(round) {
    clearAiTimers(); clearRevealTimers(); clearRoundSafety(); roundClosed = false; instrumentUsed = false; bidders.forEach((bidder) => { bidder.lastBid = null; bidder.confirmed = false; bidder.revealed = false; bidder.dialogue = ''; });
    const previousItemIds = clueHistory.flatMap((clueEntry) => clueEntry.items?.map((item) => item.id) ?? []);
    const clue = round <= 5 ? revealClue(warehouse, round, previousItemIds) : { meta: { title: '平手決勝回合', description: '最高價平手，本回合出價不可低於第五回合價格。' }, items: [] };
    const announcedClues = []; if (clue.type !== 'none') { clueHistory.push(clue); announcedClues.push(clue); } if (condition.effect === 'bonusClue' && (round === 1 || round === 3)) { const previousIds = clueHistory.flatMap((entry) => entry.items?.map((item) => item.id) ?? []); const bonusClue = revealBonusClue(warehouse, previousIds); clueHistory.push(bonusClue); announcedClues.push(bonusClue); } const assistantClue = applyAssistantRound(round); if (assistantClue) { clueHistory.push(assistantClue); announcedClues.push(assistantClue); } renderClue(clue); renderClueHistory(); renderWarehouse(warehouse, openMiniCatalog); renderCondition(); renderValuation(); renderInstrumentPanel(); renderBidders(); renderHistory(); setBidControls(true, round === 6 ? fifthBidFor('player') : 0, { resetValue: true }); nextButton.hidden = true; newWarehouseButton.hidden = true; status.textContent = round === 6 ? '平手決勝：請提交不低於第五回合的出價。' : '查看情報後，提交本回合唯一出價。'; if (announcedClues.length) playClueAnimation(announcedClues.map((entry) => entry.meta.title).join(' ＋ '), announcedClues.reduce((sum, entry) => sum + entry.items.length, 0)); scheduleAiBids(round); roundSafetyTimer = window.setTimeout(() => finishExpiredRound(round), 60500);
  }
  function completeAuction(message) { ended = true; clearAiTimers(); clearRoundSafety(); controller.stop(); setBidControls(false); status.textContent = message; newWarehouseButton.hidden = false; nextButton.hidden = true; }
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
    if (round < 5) { status.textContent = `本回合最高出價為 ${format(result.highestBid)}，即將進入下一回合。`; nextButton.hidden = true; revealTimers.push(window.setTimeout(() => { if (!disposed && !ended) controller.start(round + 1); }, 450)); return; }
    if (round === 5 && result.highestBid > 0 && result.bidders.length > 1) { status.textContent = `最高價 ${format(result.highestBid)} 平手，進入第六回合決勝。`; nextButton.hidden = false; nextButton.textContent = '進入平手決勝'; return; }
    if (round === 6 && result.highestBid > 0 && result.bidders.length > 1) { completeAuction(`第六回合仍以 ${format(result.highestBid)} 平手，本倉庫流標。`); return; }
    settleWinner(result.bidders[0]);
  }
  function closeRound() {
    if (roundClosed) return; roundClosed = true; clearAiTimers(); clearRoundSafety(); controller.stop(); const bids = bidders.map((bidder) => ({ bidderId: bidder.bidderId, name: bidder.name, amount: bidder.lastBid })); history.push({ round: controller.getRound(), bids }); status.textContent = '全員已完成喊價，準備公布結果…'; renderBidders();
    bidders.forEach((bidder, index) => { revealTimers.push(window.setTimeout(() => { if (disposed || ended) return; bidder.revealed = true; playSound('bid'); renderBidders(); if (index === bidders.length - 1) { status.textContent = '所有出價已公布，正在確認結果…'; revealTimers.push(window.setTimeout(() => resolveRound(bids), 2000)); } }, 450 + index * 650)); });
  }
  function submitPlayerBid(forcedAmount) {
    if (roundClosed || ended || player().confirmed) return; const round = controller.getRound(); const minimum = round === 6 ? fifthBidFor('player') : 0; const validation = validatePlayerBid(forcedAmount ?? bidDraft, { money: profile.money, minimum }); if (!validation.valid) { status.textContent = validation.message; return; }
    player().lastBid = validation.amount; player().confirmed = true; player().dialogue = validation.amount === 0 ? '本回合選擇放棄。' : `已鎖定出價 ${format(validation.amount)}。`; playSound('bid'); setBidControls(false); status.textContent = '你已完成喊價。'; renderBidders(); if (!allConfirmed()) scheduleAiBids(round, true); maybeCloseRound();
  }
  const controller = createRoundController({ onChange: beginRound, onExpire: () => finishExpiredRound(controller.getRound()) });
  async function startWarehouse() { if (starting) return; starting = true; const venue = selectedVenue(); if (profile.money < venue.minimumMoney) { renderLobby(`資產不足，需要至少 ${format(venue.minimumMoney)} 才能進入此會場。`); starting = false; return; } clearAiTimers(); clearRevealTimers(); profile.money -= venue.entryFee; const itemPool = catalog.filter((item) => qualityRank[item.quality] >= qualityRank[venue.minimumQuality]); warehouse = generateWarehouse({ ...template, warehouse: { ...template.warehouse, minimumItems: venue.minimumItems, maximumItems: venue.maximumItems }, prototypeItems: itemPool }); condition = chooseCondition(venue); applyCondition(); bidders = [createPlayerBidder(), ...createAiRoster()]; ensureBidders(); history = []; clueHistory = []; applyAssistantStart(); ended = false; profile.stats.auctions += 1; onProfileChange(profile); setMode('game'); playSound('reveal'); await playConditionDraw(conditionConfig.conditions, condition); if (!disposed && !ended) { playGameAnimation('reveal', '新倉庫開啟'); controller.start(1); } starting = false; }
  const handleSubmit = () => submitPlayerBid(); const handleNext = () => { if (roundClosed) controller.start(controller.getRound() === 5 ? 6 : controller.getRound() + 1); }; const focusBidInput = (event) => { if (!bidInput.disabled && event.target !== bidInput) bidInput.focus(); }; const syncBidDraft = () => { bidDraft = bidInput.value; };
  function useInstrument(id) { if (instrumentUsed || roundClosed || ended || !(profile.auction.instruments[id] > 0)) return; const instrument = auctionMeta.instruments.find((entry) => entry.id === id); profile.auction.instruments[id] -= 1; instrumentUsed = true; const clue = revealInstrumentClue(warehouse, instrument.effect); clueHistory.push(clue); onProfileChange(profile); renderClue(clue); renderClueHistory(); renderWarehouse(warehouse, openMiniCatalog); renderValuation(); renderInstrumentPanel(); playClueAnimation(instrument.name, clue.items.length); status.textContent = `${instrument.name} 已完成分析。`; }
  function handleLobbyClick(event) { const venueId = event.target.closest('[data-venue-id]')?.dataset.venueId; const assistantId = event.target.closest('[data-assistant-id]')?.dataset.assistantId; const buyId = event.target.closest('[data-buy-instrument]')?.dataset.buyInstrument; if (venueId) { profile.auction.selectedVenue = venueId; onProfileChange(profile); renderLobby(); } if (assistantId) { profile.auction.selectedAssistant = assistantId; onProfileChange(profile); renderLobby(); } if (buyId) { const instrument = auctionMeta.instruments.find((entry) => entry.id === buyId); if (profile.money >= instrument.cost) { profile.money -= instrument.cost; profile.auction.instruments[buyId] = (profile.auction.instruments[buyId] ?? 0) + 1; onProfileChange(profile); renderLobby(`${instrument.name} 已放入補給箱。`); } } if (event.target.closest('#start-prepared-auction')) startWarehouse(); }
  const handleReset = () => { clearAiTimers(); clearRoundSafety(); controller.stop(); ended = true; setMode('lobby'); renderLobby(); }; const handleUseInstrument = (event) => { const id = event.target.closest('[data-use-instrument]')?.dataset.useInstrument; if (id) useInstrument(id); };
  document.querySelector('.bid-input-wrap').addEventListener('pointerdown', focusBidInput); bidInput.addEventListener('input', syncBidDraft); submitButton.addEventListener('click', handleSubmit); nextButton.addEventListener('click', handleNext); newWarehouseButton.addEventListener('click', handleReset); resetButton.addEventListener('click', handleReset); catalogButton.addEventListener('click', () => openMiniCatalog()); document.querySelector('#auction-lobby').addEventListener('click', handleLobbyClick); document.querySelector('#instrument-panel').addEventListener('click', handleUseInstrument); setMode('lobby'); renderLobby();
  return { leave: () => { if (!roundClosed && !ended && warehouse) submitPlayerBid(0); }, destroy: () => { disposed = true; clearAiTimers(); clearRoundSafety(); document.querySelector('#auction-catalog-modal')?.remove(); document.querySelector('#condition-draw-fx')?.remove(); controller.destroy(); document.querySelector('.bid-input-wrap').removeEventListener('pointerdown', focusBidInput); bidInput.removeEventListener('input', syncBidDraft); submitButton.removeEventListener('click', handleSubmit); nextButton.removeEventListener('click', handleNext); newWarehouseButton.removeEventListener('click', handleReset); resetButton.removeEventListener('click', handleReset); document.querySelector('#auction-lobby').removeEventListener('click', handleLobbyClick); document.querySelector('#instrument-panel').removeEventListener('click', handleUseInstrument); } };
}
