const CLUE_ORDER = ['size', 'qualitySummary', 'category', 'none', 'valueAndSize'];
const QUALITY_RANK = { '垃圾': 0, '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4, '神話': 5 };
const CLUE_META = {
  size: { title: '尺寸情報已解鎖', description: '以下物品的實際佔用格數已公開。', fields: ['size'] },
  category: { title: '種類情報已解鎖', description: '以下物品所屬的種類已公開。', fields: ['category'] },
  none: { title: '自由思考時間', description: '本回合沒有新的情報，請整理目前發現。', fields: [] },
  valueAndSize: { title: '完整估值與尺寸情報', description: '以下物品的固定價值與實際佔用格數同時公開。', fields: ['value', 'size'] }
};

function shuffle(items) { return [...items].sort(() => Math.random() - 0.5); }
function unknownFields(item) { return ['size', 'value', 'category'].filter((field) => !item.knowledge[field]); }

function qualitySummary(warehouse) {
  const present = [...new Set(warehouse.items.map((item) => item.quality))]; const quality = present[Math.floor(Math.random() * present.length)]; const matching = warehouse.items.filter((item) => item.quality === quality);
  const variants = [
    { title: `${quality}品質總件數`, description: `本局共有 ${matching.length} 件${quality}品質物品。` },
    { title: `${quality}品質總格數`, description: `本局${quality}品質物品合計佔用 ${matching.reduce((sum, item) => sum + item.width * item.height, 0)} 格。` },
    { title: `${quality}品質平均價值`, description: `本局${quality}品質物品平均價值為 $${Math.round(matching.reduce((sum, item) => sum + item.value, 0) / matching.length).toLocaleString('en-US')}。` }
  ];
  const result = variants[Math.floor(Math.random() * variants.length)]; return { type: 'qualitySummary', meta: result, items: [], summary: result.description };
}

export function revealClue(warehouse, round, previousItemIds = []) {
  const type = CLUE_ORDER[round - 1];
  if (type === 'qualitySummary') return qualitySummary(warehouse);
  const meta = CLUE_META[type];
  if (!meta.fields.length) return { type, meta, items: [] };
  const eligible = warehouse.items.filter((candidate) => meta.fields.some((field) => !candidate.knowledge[field]) && unknownFields(candidate).length);
  const targetRank = Math.min(3, round); const preferred = eligible.filter((candidate) => QUALITY_RANK[candidate.quality] >= targetRank); const pool = preferred.length ? preferred : eligible;
  const avoidPrevious = Math.random() >= 0.08; const freshPool = avoidPrevious ? pool.filter((item) => !previousItemIds.includes(item.id)) : pool;
  const selectionPool = freshPool.length >= 2 ? freshPool : pool;
  const count = Math.min(selectionPool.length, 2 + Math.floor(Math.random() * 3));
  const items = shuffle(selectionPool).slice(0, count);
  items.forEach((item) => meta.fields.forEach((field) => { item.knowledge[field] = true; }));
  return { type, meta, items };
}

export function revealBonusClue(warehouse, previousItemIds = []) {
  const types = ['size', 'category', 'valueAndSize'];
  const type = types[Math.floor(Math.random() * types.length)];
  const meta = { ...CLUE_META[type], title: `額外情報：${CLUE_META[type].title}` };
  const eligible = warehouse.items.filter((candidate) => meta.fields.some((field) => !candidate.knowledge[field]));
  const fresh = eligible.filter((item) => !previousItemIds.includes(item.id));
  const pool = fresh.length >= 2 ? fresh : eligible;
  const count = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
  const items = shuffle(pool).slice(0, count);
  items.forEach((item) => meta.fields.forEach((field) => { item.knowledge[field] = true; }));
  return { type: `bonus-${type}`, meta, items };
}

export function renderClue(clue) {
  document.querySelector('#clue-title').textContent = clue.meta.title; document.querySelector('#clue-description').textContent = clue.meta.description;
  const card = document.querySelector('#clue-item-card');
  if (!clue.items.length) { card.innerHTML = `<span class="clue-empty">${clue.summary ?? '本輪請仔細觀察倉庫。'}</span>`; return; }
  card.innerHTML = clue.items.map((item) => { const details = []; if (item.knowledge.category) details.push(`種類：${item.category ?? item.series}`); if (item.knowledge.value) details.push(`價值：$${item.value.toLocaleString('en-US')}`); if (item.knowledge.size) details.push(`大小：${item.width}×${item.height} 格`); return `<div><strong>物品 #${item.id.slice(-3)}</strong><span>${details.join('　')}</span></div>`; }).join('');
}
