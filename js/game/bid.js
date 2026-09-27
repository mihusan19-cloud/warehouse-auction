export function getHighestBidders(bids) { const highestBid = Math.max(...bids.map((entry) => entry.amount)); return { highestBid, bidders: bids.filter((entry) => entry.amount === highestBid) }; }
export function calculateSettlement(highestBid, warehouseValue) {
  const profit = warehouseValue - highestBid;
  return { highestBid, warehouseValue, profit, lossReward: profit < 0 ? Math.floor(-profit * 0.1) : 0 };
}
export function awardLossReward(profile, bidders, winnerId, amount) {
  if (amount <= 0) return;
  bidders.filter((bidder) => bidder.bidderId !== winnerId).forEach((bidder) => {
    bidder.money += amount;
    if (bidder.bidderId === 'player') profile.money += amount;
  });
}
export function validatePlayerBid(rawValue, { money, minimum = 0 }) { const normalized = String(rawValue ?? '').trim().replace(/[,$\s]/g, ''); if (!normalized) return { valid: false, message: '請輸入出價金額；輸入 0 才是放棄競標。' }; const amount = Number(normalized); if (!Number.isSafeInteger(amount) || amount < 0) return { valid: false, message: '請輸入 0 或正整數金額。' }; if (amount > money) return { valid: false, message: '出價不可超過你的目前資產。' }; if (amount > 0 && amount < minimum) return { valid: false, message: `第六回合出價不得低於 $${minimum.toLocaleString('en-US')}。` }; return { valid: true, amount }; }
