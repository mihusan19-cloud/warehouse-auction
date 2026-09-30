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

test('an empty showroom does not start its timer, including legacy empty saves', () => {
  const profile = { money: 0, showroomLastIncomeAt: hour, showroomAccruedHours: 168, showroomPendingIncome: 0 };
  assert.equal(previewDisplayIncome(profile, [], qualities, config, hour * 201).elapsedHours, 0);
  accrueDisplayIncome(profile, [], qualities, config, hour * 201);
  assert.equal(profile.showroomAccruedHours, 0);
  const started = previewDisplayIncome(profile, displayed, qualities, config, hour * 202);
  assert.equal(started.elapsedHours, 1);
  assert.equal(started.amount, 10);
});

test('removing the final exhibit pauses time without losing earned income', () => {
  const profile = { money: 0, showroomLastIncomeAt: hour };
  accrueDisplayIncome(profile, displayed, qualities, config, hour * 11);
  const paused = previewDisplayIncome(profile, [], qualities, config, hour * 101);
  assert.equal(paused.elapsedHours, 10);
  assert.equal(paused.amount, 100);
  accrueDisplayIncome(profile, [], qualities, config, hour * 101);
  const resumed = previewDisplayIncome(profile, displayed, qualities, config, hour * 103);
  assert.equal(resumed.elapsedHours, 12);
  assert.equal(resumed.amount, 120);
  assert.equal(claimDisplayIncome(profile, displayed, qualities, config, hour * 103).amount, 120);
  assert.equal(profile.money, 120);
});

test('claiming while paused resets the cycle; the 168-hour cap uses display time only', () => {
  const profile = { money: 0, showroomLastIncomeAt: hour };
  accrueDisplayIncome(profile, displayed, qualities, config, hour * 101);
  accrueDisplayIncome(profile, [], qualities, config, hour * 300);
  assert.equal(profile.showroomAccruedHours, 100);
  const capped = previewDisplayIncome(profile, displayed, qualities, config, hour * 400);
  assert.equal(capped.elapsedHours, 168);
  assert.equal(capped.amount, 1680);
  accrueDisplayIncome(profile, displayed, qualities, config, hour * 400);
  assert.equal(claimDisplayIncome(profile, [], qualities, config, hour * 500).amount, 1680);
  assert.equal(profile.showroomAccruedHours, 0);
  assert.equal(previewDisplayIncome(profile, [], qualities, config, hour * 600).elapsedHours, 0);
  accrueDisplayIncome(profile, [], qualities, config, hour * 600);
  assert.equal(previewDisplayIncome(profile, displayed, qualities, config, hour * 601).amount, 10);
});
