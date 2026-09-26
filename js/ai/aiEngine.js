function randomBetween(min, max) { return min + Math.random() * (max - min); }
function choose(items) { return items[Math.floor(Math.random() * items.length)]; }
const ASSISTANT_INSIGHT = { topQuality: 0.24, extraClue: 0.16, rareCount: 0.12, topValue: 0.3 };

export function createAiBidders(database, assistants = []) { return Array.from({ length: 3 }, (_, index) => ({ ...choose(database.characters), bidderId: `ai-${index}`, money: Math.floor(randomBetween(240000, 780000)), lastBid: 0, dialogue: '', assistant: assistants.length ? choose(assistants) : { id: 'independent', effect: 'extraClue' } })); }
export function createAiBidRemainingMarks(count, { currentRemaining = 60, afterPlayerBid = false } = {}) {
  const lowest = afterPlayerBid ? Math.max(0, currentRemaining - 4) : 0;
  const highest = afterPlayerBid ? Math.max(0, currentRemaining - 1) : 55;
  const pool = Array.from({ length: highest - lowest + 1 }, (_, index) => lowest + index).sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
}
export function estimateKnownWarehouseValue(warehouse) { return warehouse.items.reduce((total, item) => { if (item.knowledge.value) return total + item.value; const area = item.knowledge.size ? item.width * item.height : 1; return total + area * 4500 + (item.knowledge.category ? 1200 : 0); }, 0); }
export function estimateAiValuationRange(ai, warehouse, { lower = 0, upper = 0 } = {}) {
  const publicLower = Math.max(1, Number(lower) || estimateKnownWarehouseValue(warehouse) * 0.55);
  const publicUpper = Math.max(publicLower, Number(upper) || estimateKnownWarehouseValue(warehouse) * 1.45);
  const publicMidpoint = (publicLower + publicUpper) / 2;
  const actualTotal = warehouse.items.reduce((sum, item) => sum + item.value, 0);
  const insight = ASSISTANT_INSIGHT[ai.assistant?.effect] ?? 0.1;
  // 助理僅把 AI 的私有估值往真實值校正一部分，不會把情報寫回玩家畫面。
  const correctedMidpoint = publicMidpoint + (actualTotal - publicMidpoint) * insight;
  const spread = Math.max(800, (publicUpper - publicLower) * (0.5 - insight * 0.25));
  return { lower: Math.max(1, Math.round(correctedMidpoint - spread / 2)), upper: Math.max(1, Math.round(correctedMidpoint + spread / 2)) };
}
export function makeAiBid(ai, warehouse, database, { minimum = 1, playerPreviousBid = 0, valuationRange } = {}) { if (ai.money <= 0) ai.money = Math.floor(randomBetween(240000, 780000)); const [minimumMultiplier, maximumMultiplier] = ai.bidMultiplier; const range = estimateAiValuationRange(ai, warehouse, valuationRange); const valuation = randomBetween(range.lower, range.upper); const clueEstimate = valuation * randomBetween(minimumMultiplier, maximumMultiplier); const correctedEstimate = playerPreviousBid > 0 ? clueEstimate * 0.72 + playerPreviousBid * 0.28 : clueEstimate; const normalBid = Math.round(correctedEstimate / 100) * 100; const rawBid = Math.random() < database.specialShoutChance ? choose(database.specialShouts) : normalBid; const bid = Math.min(ai.money, Math.max(1, minimum, rawBid)); ai.lastBid = bid; ai.dialogue = choose(ai.dialogues).replaceAll('{{bid}}', bid.toLocaleString('en-US')); return bid; }
