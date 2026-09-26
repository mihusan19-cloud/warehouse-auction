import assert from 'node:assert/strict';
import test from 'node:test';
import { generateWarehouse, renderWarehouse } from '../js/game/warehouse.js';
import { revealInstrumentClue } from '../js/game/clue.js';

test('clues and warehouse labels use unique positions, not repeated catalog suffixes', () => {
  const prototypes = Array.from({ length: 5 }, (_, index) => ({
    id: `series-${index + 1}-01`, name: `物品 ${index + 1}`, quality: '普通',
    value: 1000, width: 1, height: 1, series: '測試', image: '📦'
  }));
  const warehouse = generateWarehouse({
    grid: { columns: 5, rows: 2, maximumFillRatio: 0.95 },
    warehouse: { minimumItems: 5, maximumItems: 5 }, prototypeItems: prototypes
  });
  assert.deepEqual(warehouse.items.map((item) => item.slotId), [1, 2, 3, 4, 5]);
  warehouse.items[1].id = warehouse.items[0].id; // A transformation may repeat a catalog ID.

  const grid = { style: { setProperty() {} }, replaceChildren(...cells) { this.cells = cells; } };
  const heading = { textContent: '' };
  const count = { textContent: '' };
  const previousDocument = globalThis.document;
  globalThis.document = {
    querySelector(selector) { return { '#warehouse-grid': grid, '#warehouse-id': heading, '#warehouse-item-count': count }[selector]; },
    createElement() { return { style: {}, dataset: {}, setAttribute() {}, addEventListener() {}, innerHTML: '' }; }
  };
  try { renderWarehouse(warehouse); } finally { globalThis.document = previousDocument; }
  assert.deepEqual(grid.cells.map((cell) => cell.dataset.slotId), ['1', '2', '3', '4', '5']);
  assert.deepEqual(grid.cells.map((cell) => cell.innerHTML.match(/#\d{2}/)?.[0]), ['#01', '#02', '#03', '#04', '#05']);

  const clue = revealInstrumentClue(warehouse, 'value');
  assert.equal(clue.items.length, 2);
  const selectedSlots = new Set(clue.items.map((item) => item.slotId));
  assert.equal(selectedSlots.size, 2);
  warehouse.items.forEach((item) => assert.equal(item.knowledge.value, selectedSlots.has(item.slotId)));
});
