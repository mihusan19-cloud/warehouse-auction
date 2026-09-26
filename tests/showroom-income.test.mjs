import assert from 'node:assert/strict';
import test from 'node:test';
import { accrueDisplayIncome, claimDisplayIncome, previewDisplayIncome } from '../js/inventory/income.js';

const hour = 3600000;
const config = { maxOfflineHours: 168, displayMultiplier: 0.01 };
const qualities = { '普通': { multiplier: 1 } };
const displayed = [{ displayed: true, item: { value: 1000, quality: '普通' } }];

test('income waits for manual claim and caps at 168 hours', () => {
  const profile = { money: 100, showroomLastIncomeAt: hour };
  const preview = previewDisplayIncome(profile, displayed, qualities, config, hour * 201);
  assert.equal(preview.elapsedHours, 168);
  assert.equal(preview.amount, 1680);
  assert.equal(profile.money, 100);
  const claimed = claimDisplayIncome(profile, displayed, qualities, config, hour * 201);
  assert.equal(claimed.amount, 1680);
  assert.equal(profile.money, 1780);
  assert.equal(profile.showroomAccruedHours, 0);
  assert.equal(claimDisplayIncome(profile, displayed, qualities, config, hour * 201).amount, 0);
  assert.equal(profile.money, 1780);
  assert.equal(previewDisplayIncome(profile, displayed, qualities, config, hour * 202).amount, 10);
});

test('changing displayed items keeps earnings earned at the old rate', () => {
  const profile = { money: 0, showroomLastIncomeAt: hour };
  accrueDisplayIncome(profile, displayed, qualities, config, hour * 11);
  assert.equal(profile.showroomPendingIncome, 100);
  const stored = [{ ...displayed[0], displayed: false }];
  assert.equal(previewDisplayIncome(profile, stored, qualities, config, hour * 16).amount, 100);
  assert.equal(claimDisplayIncome(profile, stored, qualities, config, hour * 16).amount, 100);
  assert.equal(profile.money, 100);
});

test('the 168-hour cap spans multiple visits and can restart without earnings', () => {
  const profile = { money: 0, showroomLastIncomeAt: hour };
  accrueDisplayIncome(profile, [], qualities, config, hour * 101);
  const preview = previewDisplayIncome(profile, [], qualities, config, hour * 201);
  assert.equal(preview.elapsedHours, 168);
  assert.equal(preview.amount, 0);
  claimDisplayIncome(profile, [], qualities, config, hour * 201);
  assert.equal(profile.showroomAccruedHours, 0);
  assert.equal(previewDisplayIncome(profile, displayed, qualities, config, hour * 202).amount, 10);
});
