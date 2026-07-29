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
    const positions = shuffle(Array.from({ length: capacity }, (_, index) => ({ x: index % grid.columns, y: Math.floor(index / grid.columns) })));
    const position = positions.find(({ x, y }) => canPlace(occupied, item, x, y, grid));
    if (!position) continue;
    occupy(occupied, item, position.x, position.y);
    items.push({ ...item, x: position.x, y: position.y, knowledge: { size: false, value: false, category: false } });
  }

  if (items.length < warehouse.minimumItems) throw new Error('倉庫生成失敗：可放置物品不足。');
  return { id: String(Math.floor(1000 + Math.random() * 9000)), grid, items };
}

export function renderWarehouse(warehouse, onItemClick) {
  const gridElement = document.querySelector('#warehouse-grid');
  gridElement.style.setProperty('--columns', warehouse.grid.columns);
  gridElement.style.setProperty('--rows', warehouse.grid.rows);
  gridElement.replaceChildren(...warehouse.items.map((item, index) => {
    const element = document.createElement('div');
    const visibleWidth = item.knowledge.size ? item.width : 1;
    const visibleHeight = item.knowledge.size ? item.height : 1;
    const category = item.category ?? item.series;
    const revealed = Object.values(item.knowledge).some(Boolean);
    element.className = `warehouse-item${item.knowledge.size ? ' is-sized' : ''}${revealed ? ' is-revealed' : ''}${item.knowledge.value ? ' has-value' : ''}${item.knowledge.quality ? ` quality-${item.quality}` : ''}`;
    element.style.cssText = `grid-column:${item.x + 1} / span ${visibleWidth};grid-row:${item.y + 1} / span ${visibleHeight};`;
    element.setAttribute('aria-label', `物品 ${index + 1}${item.knowledge.category ? `，${category}` : ''}`);
    element.setAttribute('role', 'button'); element.tabIndex = 0;
    element.innerHTML = `<b class="warehouse-item-number">#${item.id.slice(-3)}</b><span>${item.knowledge.category ? category : '?'}</span>${item.knowledge.value ? `<small>$${item.value.toLocaleString('en-US')}</small>` : ''}`;
    if (onItemClick) { element.addEventListener('click', () => onItemClick(item)); element.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onItemClick(item); } }); }
    return element;
  }));
  document.querySelector('#warehouse-id').textContent = warehouse.id;
  document.querySelector('#warehouse-item-count').textContent = `${warehouse.items.length} 件物品`;
}
