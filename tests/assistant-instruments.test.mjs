import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  instrumentCanReveal, makeTotalCellsClue, makeValueRangeClue,
  revealBlindSpotClue, revealInstrumentClue, revealTargetedClue, totalOccupiedCells
} from '../js/game/clue.js';

function warehouseFixture() {
  return { items: [
    { id: 'a-01', slotId: 1, name: '甲', quality: '普通', value: 12000, width: 2, height: 2, knowledge: { quality: false, size: false, identity: false, value: false } },
    { id: 'b-01', slotId: 2, name: '乙', quality: '稀有', value: 21000, width: 1, height: 2, knowledge: { quality: false, size: false, identity: false, value: false } },
    { id: 'c-01', slotId: 3, name: '丙', quality: '史詩', value: 45000, width: 1, height: 1, knowledge: { quality: false, size: false, identity: false, value: false } }
  ] };
}

test('selected assistants and instruments are present with purchasable prices', () => {
  const metadata = JSON.parse(readFileSync(new URL('../data/auctionMeta.json', import.meta.url), 'utf8'));
  assert.deepEqual(['spaceAnalyst', 'riskAppraiser', 'blindSpot'].map((id) => metadata.assistants.find((assistant) => assistant.id === id)?.effect), ['totalCells', 'valueRange', 'blindSpot']);
  assert.deepEqual(['totalCellsMeter', 'identityDecoder', 'targetScanner'].map((id) => metadata.instruments.find((instrument) => instrument.id === id)?.cost), [2500, 18000, 12000]);
});

test('space assistant and meter tell the true total without revealing item positions', () => {
  const warehouse = warehouseFixture();
  assert.equal(totalOccupiedCells(warehouse), 7);
  const clue = makeTotalCellsClue(warehouse, '空間分析');
  assert.equal(clue.items.length, 0);
  assert.match(clue.summary, /7 格/);
  assert.equal(instrumentCanReveal(warehouse, 'totalCells', [clue]), false);
  assert.equal(revealInstrumentClue(warehouse, 'totalCells').summary, clue.summary);
  assert.ok(warehouse.items.every((item) => !item.knowledge.quality && !item.knowledge.size));
});

test('risk assistant interval always contains the actual warehouse value', () => {
  const warehouse = warehouseFixture();
  const total = warehouse.items.reduce((sum, item) => sum + item.value, 0);
  const clue = makeValueRangeClue(warehouse, '風險估價', 100000);
  assert.ok(clue.lower <= total && total <= clue.upper);
  assert.equal(clue.upper - clue.lower + 1, 100000);
  assert.equal(clue.items.length, 0);
});

test('blind-spot assistant and targeted scanner affect only their chosen slot', () => {
  const warehouse = warehouseFixture();
  const assistantClue = revealBlindSpotClue(warehouse, '盲點調查');
  assert.equal(assistantClue.items.length, 1);
  const chosen = assistantClue.items[0];
  assert.equal(chosen.knowledge.quality, true);
  assert.equal(chosen.knowledge.size, true);
  assert.ok(warehouse.items.filter((item) => item !== chosen).every((item) => !item.knowledge.quality && !item.knowledge.size));
  assert.equal(revealTargetedClue(warehouse, chosen.slotId, 'quality'), null);
  const other = warehouse.items.find((item) => item !== chosen);
  const targetedClue = revealTargetedClue(warehouse, other.slotId, 'size');
  assert.deepEqual(targetedClue.items, [other]);
  assert.equal(other.knowledge.size, true);
  assert.equal(other.knowledge.quality, false);
  assert.equal(revealTargetedClue(warehouse, other.slotId, 'size'), null);
});

test('single-item decoder identifies exactly one unknown item', () => {
  const warehouse = warehouseFixture();
  const clue = revealInstrumentClue(warehouse, 'identity', 1);
  assert.equal(clue.items.length, 1);
  assert.equal(warehouse.items.filter((item) => item.knowledge.identity).length, 1);
});
