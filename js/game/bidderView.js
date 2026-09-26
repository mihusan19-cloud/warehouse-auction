export function bidderStatus(bidder, bidders, rankOnly = false) {
  if (bidder.lastBid == null) return '等待出價';
  if (!bidder.revealed) return '已完成喊價';
  if (bidder.lastBid === 0) return '放棄本回合';
  if (rankOnly) {
    const rank = 1 + bidders.filter((other) => other.lastBid != null && other.lastBid > bidder.lastBid).length;
    return `第 ${rank} 名`;
  }
  return `$${bidder.lastBid.toLocaleString('en-US')}`;
}
