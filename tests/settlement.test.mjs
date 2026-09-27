import assert from 'node:assert/strict';
import test from 'node:test';
import { awardLossReward, calculateSettlement } from '../js/game/bid.js';
import { DEFAULT_PROFILE, loadProfile } from '../js/utils/storage.js';

test('new players start with three million; existing saves retain their balance', () => {
  assert.equal(DEFAULT_PROFILE.money, 3000000);
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => JSON.stringify({ profile: { name: '舊玩家', money: 123456, collection: [] } }) };
  try { assert.equal(loadProfile().money, 123456); } finally { globalThis.localStorage = previous; }
});

test('settlement reports bid, real value and profit without loss reward', () => {
  assert.deepEqual(calculateSettlement(60000, 85000), {
    highestBid: 60000, warehouseValue: 85000, profit: 25000, lossReward: 0
  });
});

test('a losing winner grants each other bidder ten percent of the loss', () => {
  assert.deepEqual(calculateSettlement(110001, 100000), {
    highestBid: 110001, warehouseValue: 100000, profit: -10001, lossReward: 1000
  });
  const profile = { money: 3000000 };
  const bidders = [
    { bidderId: 'player', money: 3000000 },
    { bidderId: 'ai-0', money: 400000 },
    { bidderId: 'ai-1', money: 400000 },
    { bidderId: 'ai-2', money: 400000 }
  ];
  awardLossReward(profile, bidders, 'ai-0', 1000);
  assert.equal(profile.money, 3001000);
  assert.deepEqual(bidders.map((bidder) => bidder.money), [3001000, 400000, 401000, 401000]);
  awardLossReward(profile, bidders, 'player', 500);
  assert.equal(profile.money, 3001000);
  assert.deepEqual(bidders.map((bidder) => bidder.money), [3001000, 400500, 401500, 401500]);
});
