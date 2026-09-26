import assert from 'node:assert/strict';
import test from 'node:test';
import { bidderStatus } from '../js/game/bidderView.js';
import { createAiBidRemainingMarks } from '../js/ai/aiEngine.js';
import { createRoundController } from '../js/game/round.js';

test('new round shows waiting for all four bidders, then conceals and reveals bids', () => {
  const bidders = [
    { lastBid: null, revealed: false },
    { lastBid: null, revealed: false },
    { lastBid: null, revealed: false },
    { lastBid: null, revealed: false }
  ];
  assert.deepEqual(bidders.map((bidder) => bidderStatus(bidder, bidders)), Array(4).fill('等待出價'));
  bidders[0].lastBid = 10000;
  assert.equal(bidderStatus(bidders[0], bidders), '已完成喊價');
  bidders[1].lastBid = 12300;
  bidders[1].revealed = true;
  assert.equal(bidderStatus(bidders[1], bidders), '$12,300');
  assert.equal(bidderStatus(bidders[1], bidders, true), '第 1 名');
  bidders.forEach((bidder) => { bidder.lastBid = null; bidder.revealed = false; });
  assert.deepEqual(bidders.map((bidder) => bidderStatus(bidder, bidders)), Array(4).fill('等待出價'));
});

test('AI timing marks stay in the requested countdown windows', () => {
  for (let i = 0; i < 500; i += 1) {
    const normal = createAiBidRemainingMarks(3);
    assert.equal(new Set(normal).size, 3);
    assert.ok(normal.every((mark) => mark >= 0 && mark <= 55));
    const accelerated = createAiBidRemainingMarks(3, { afterPlayerBid: true, currentRemaining: 34 });
    assert.ok(accelerated.every((mark) => mark >= 30 && mark <= 33));
  }
});

test('round state resets before the countdown begins', () => {
  const timer = { textContent: '' };
  const number = { textContent: '' };
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const events = [];
  globalThis.window = {
    setInterval: () => { events.push('timer started'); return 1; },
    clearInterval: () => {}
  };
  globalThis.document = { querySelector: (selector) => selector === '#round-timer' ? timer : number };
  try {
    const controller = createRoundController({ onChange: (round) => events.push(`round ${round} reset at ${controller.getRemaining()}`), onTick: (_, remaining) => events.push(`tick ${remaining}`) });
    controller.start(2);
    assert.deepEqual(events, ['round 2 reset at 60', 'tick 60', 'timer started']);
    assert.equal(timer.textContent, '01:00');
    controller.start(3);
    assert.deepEqual(events.slice(3), ['round 3 reset at 60', 'tick 60', 'timer started']);
    assert.equal(number.textContent, 3);
    controller.destroy();
  } finally {
    globalThis.window = priorWindow;
    globalThis.document = priorDocument;
  }
});
