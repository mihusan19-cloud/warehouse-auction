export function hourlyDisplayIncome(entries, qualityMap, displayMultiplier) {
  return entries.filter((entry) => entry.displayed).reduce((total, entry) => total + entry.item.value * (qualityMap[entry.item.quality]?.multiplier ?? 1) * displayMultiplier, 0);
}

export function settleOfflineIncome(profile, entries, qualityMap, config, now = Date.now()) {
  const previous = Number(profile.showroomLastIncomeAt) || now;
  const elapsedHours = Math.min(config.maxOfflineHours, Math.max(0, now - previous) / 3600000);
  const amount = Math.floor(hourlyDisplayIncome(entries, qualityMap, config.displayMultiplier) * elapsedHours);
  profile.showroomLastIncomeAt = now;
  profile.money += amount;
  return { amount, elapsedHours };
}
