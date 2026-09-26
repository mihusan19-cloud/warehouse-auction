const QUALITY_RANK = { '垃圾': 0, '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4, '神話': 5 };
const CLUE_META = {
  size: { title: '實際尺寸情報', description: '以下 2～4 件物品的實際佔用格數已公開。', fields: ['size'] },
  quality: { title: '實際品質情報', description: '以下 2～4 件物品的實際品質已公開。', fields: ['quality'] },
  identity: { title: '物品身分情報', description: '以下 2～4 件物品已直接確認品項。', fields: ['identity'] },
  none: { title: '自由思考時間', description: '本回合沒有新的情報，請整理目前發現。', fields: [] },
};

function shuffle(items) { return [...items].sort(() => Math.random() - 0.5); }

function qualitySummary(warehouse) {
  const present = [...new Set(warehouse.items.map((item) => item.quality))]; const quality = present[Math.floor(Math.random() * present.length)]; const matching = warehouse.items.filter((item) => item.quality === quality);
  const variants = [
    { title: `${quality}品質總件數`, description: `本局共有 ${matching.length} 件${quality}品質物品。` },
    { title: `${quality}品質總格數`, description: `本局${quality}品質物品合計佔用 ${matching.reduce((sum, item) => sum + item.width * item.height, 0)} 格。` },
    { title: `${quality}品質平均價值`, description: `本局${quality}品質物品平均價值為 $${Math.round(matching.reduce((sum, item) => sum + item.value, 0) / matching.length).toLocaleString('en-US')}。` }
  ];
  const result = variants[Math.floor(Math.random() * variants.length)]; return { type: 'qualitySummary', meta: result, items: [], summary: result.description };
}

export function revealClue(warehouse, round, previousSlotIds = []) {
  // 第四回合保留為整理資訊的空檔；其餘指定回合都從四種資訊隨機抽取。
  const type = round === 4 ? 'none' : ['size', 'quality', 'identity', 'qualitySummary'][Math.floor(Math.random() * 4)];
  if (type === 'qualitySummary') return qualitySummary(warehouse);
  const meta = CLUE_META[type];
  if (!meta.fields.length) return { type, meta, items: [] };
  const eligible = warehouse.items.filter((candidate) => meta.fields.some((field) => !candidate.knowledge[field]));
  const targetRank = Math.min(3, round); const preferred = eligible.filter((candidate) => QUALITY_RANK[candidate.quality] >= targetRank); const pool = preferred.length ? preferred : eligible;
  const avoidPrevious = Math.random() >= 0.08; const freshPool = avoidPrevious ? pool.filter((item) => !previousSlotIds.includes(item.slotId)) : pool;
  // 若可揭露的新目標不足兩件，回退到全倉庫，確保每次物品型情報仍會列出 2～4 件。
  const selectionPool = freshPool.length >= 2 ? freshPool : pool.length >= 2 ? pool : warehouse.items;
  const count = Math.min(selectionPool.length, 2 + Math.floor(Math.random() * 3));
  const items = shuffle(selectionPool).slice(0, count);
  items.forEach((item) => meta.fields.forEach((field) => { item.knowledge[field] = true; }));
  return { type, meta, items };
}

export function revealBonusClue(warehouse, previousSlotIds = []) {
  const types = ['size', 'quality', 'identity', 'qualitySummary'];
  const type = types[Math.floor(Math.random() * types.length)];
  if (type === 'qualitySummary') {
    const clue = qualitySummary(warehouse);
    return { ...clue, type: 'bonus-qualitySummary', meta: { ...clue.meta, title: `額外情報：${clue.meta.title}` } };
  }
  const meta = { ...CLUE_META[type], title: `額外情報：${CLUE_META[type].title}` };
  const eligible = warehouse.items.filter((candidate) => meta.fields.some((field) => !candidate.knowledge[field]));
  const fresh = eligible.filter((item) => !previousSlotIds.includes(item.slotId));
  const pool = fresh.length >= 2 ? fresh : eligible.length >= 2 ? eligible : warehouse.items;
  const count = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
  const items = shuffle(pool).slice(0, count);
  items.forEach((item) => meta.fields.forEach((field) => { item.knowledge[field] = true; }));
  return { type: `bonus-${type}`, meta, items };
}

export function revealInstrumentClue(warehouse, effect) {
  const fields = effect === 'quality' ? ['quality'] : effect === 'value' ? ['value'] : ['size'];
  const eligible = warehouse.items.filter((item) => fields.some((field) => !item.knowledge[field]));
  const count = Math.min(eligible.length, effect === 'value' ? 2 : 3);
  const items = shuffle(eligible).slice(0, count);
  items.forEach((item) => fields.forEach((field) => { item.knowledge[field] = true; }));
  const labels = { size: '尺寸掃描完成', quality: '品質探測完成', value: '估值探針完成' };
  return { type: `instrument-${effect}`, meta: { title: labels[effect], description: '儀器提供的情報只供本次競標判斷。', fields }, items };
}

export function renderClue(clue) {
  document.querySelector('#clue-title').textContent = clue.meta.title; document.querySelector('#clue-description').textContent = clue.meta.description;
  const card = document.querySelector('#clue-item-card');
  if (!clue.items.length) { card.innerHTML = `<span class="clue-empty">${clue.summary ?? '本輪請仔細觀察倉庫。'}</span>`; return; }
  card.innerHTML = clue.items.map((item) => { const details = []; if (item.knowledge.identity) details.push(`品項：${item.name}`); if (item.knowledge.quality) details.push(`品質：${item.quality}`); if (item.knowledge.category) details.push(`種類：${item.category ?? item.series}`); if (item.knowledge.value) details.push(`價值：$${item.value.toLocaleString('en-US')}`); if (item.knowledge.size) details.push(`大小：${item.width}×${item.height} 格`); return `<div><strong>物品 #${String(item.slotId).padStart(2, '0')}</strong><span>${details.join('　')}</span></div>`; }).join('');
}
