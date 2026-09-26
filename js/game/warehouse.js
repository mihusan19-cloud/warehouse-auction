function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function canPlace(occupied, item, x, y, grid) {
  if (x + item.width > grid.columns || y + item.height > grid.rows) return false;
  for (let row = y; row < y + item.height; row += 1) for (let col = x; col < x + item.width; col += 1) if (occupied.has(`${col}:${row}`)) return false;
  return true;
}

function occupy(occupied, item, x, y) {
  for (let row = y; row < y + item.height; row += 1) for (let col = x; col < x + item.width; col += 1) occupied.add(`${col}:${row}`);
}

export function generateWarehouse(template) {
  const { grid, warehouse, prototypeItems } = template;
  const capacity = grid.columns * grid.rows;
  const maximumCells = Math.floor(capacity * grid.maximumFillRatio);
  const itemCount = warehouse.minimumItems + Math.floor(Math.random() * (warehouse.maximumItems - warehouse.minimumItems + 1));
  const picked = shuffle(prototypeItems).slice(0, itemCount);
  const occupied = new Set();
  const items = [];

  for (const item of picked) {
    const usedCells = [...occupied].length;
    if (usedCells + item.width * item.height > maximumCells) continue;
    const positions = Array.from({ length: capacity }, (_, index) => ({ x: index % grid.columns, y: Math.floor(index / grid.columns) }));
    const position = positions.find(({ x, y }) => canPlace(occupied, item, x, y, grid));
    if (!position) continue;
    occupy(occupied, item, position.x, position.y);
    items.push({ ...item, x: position.x, y: position.y, knowledge: { size: false, value: false, category: false, quality: false, identity: false } });
  }

  if (items.length < warehouse.minimumItems) throw new Error('倉庫生成失敗：可放置物品不足。');
  items.sort((left, right) => left.y - right.y || left.x - right.x);
  items.forEach((item, index) => { item.slotId = index + 1; });
  return { id: String(Math.floor(1000 + Math.random() * 9000)), grid, items };
}

export function renderWarehouse(warehouse, onItemClick) {
  const gridElement = document.querySelector('#warehouse-grid');
  gridElement.style.setProperty('--columns', warehouse.grid.columns);
  gridElement.style.setProperty('--rows', warehouse.grid.rows);
  gridElement.replaceChildren(...warehouse.items.map((item) => {
    const element = document.createElement('div');
    // 未獲得任何情報時，只顯示不帶外觀與品質的未知方塊。
    // 尺寸情報才會揭露真正的格子外型；已知身分也不偷看尺寸。
    const visibleWidth = item.knowledge.size ? item.width : 1;
    const visibleHeight = item.knowledge.size ? item.height : 1;
    const category = item.category ?? item.series;
    const revealed = Object.values(item.knowledge).some(Boolean);
    element.className = `warehouse-item${item.knowledge.size ? ' is-sized' : ''}${revealed ? ' is-revealed' : ''}${item.knowledge.identity ? ' is-identified' : ''}${item.knowledge.value ? ' has-value' : ''}${item.knowledge.quality ? ` quality-${item.quality}` : ''}${item.knowledge.quality && item.knowledge.size ? ' is-scan-complete' : ''}`;
    element.dataset.slotId = String(item.slotId);
    element.style.cssText = `grid-column:${item.x + 1} / span ${visibleWidth};grid-row:${item.y + 1} / span ${visibleHeight};`;
    element.setAttribute('aria-label', `物品 ${item.slotId}${item.knowledge.identity ? `，${item.name}` : item.knowledge.category ? `，${category}` : ''}`);
    element.setAttribute('role', 'button'); element.tabIndex = 0;
    const identityMarkup = item.knowledge.identity ? `<i class="warehouse-item-image" aria-hidden="true">${item.image || '📦'}</i><span>${item.name}</span>` : `<span>${item.knowledge.category ? category : '?'}</span>`;
    element.innerHTML = `<b class="warehouse-item-number">#${String(item.slotId).padStart(2, '0')}</b>${identityMarkup}${item.knowledge.value ? `<small>$${item.value.toLocaleString('en-US')}</small>` : ''}`;
    if (onItemClick) { element.addEventListener('click', () => onItemClick(item)); element.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onItemClick(item); } }); }
    return element;
  }));
  document.querySelector('#warehouse-id').textContent = warehouse.id;
  document.querySelector('#warehouse-item-count').textContent = `${warehouse.items.length} 件物品`;
}
