const HOUR_MS = 3600000;

export function hourlyDisplayIncome(entries, qualityMap, displayMultiplier) {
  return entries.filter((entry) => entry.displayed).reduce((total, entry) => total + entry.item.value * (qualityMap[entry.item.quality]?.multiplier ?? 1) * displayMultiplier, 0);
}

export function previewDisplayIncome(profile, entries, qualityMap, config, now = Date.now()) {
  const cap = Math.max(0, Number(config.maxOfflineHours) || 168);
  const accruedHours = Math.min(cap, Math.max(0, Number(profile.showroomAccruedHours) || 0));
  const previous = Number(profile.showroomLastIncomeAt) || now;
  const elapsed = Math.min(cap - accruedHours, Math.max(0, now - previous) / HOUR_MS);
  const pending = Math.max(0, Number(profile.showroomPendingIncome) || 0);
  const total = pending + hourlyDisplayIncome(entries, qualityMap, config.displayMultiplier) * elapsed;
  return { amount: Math.floor(total), total, elapsedHours: accruedHours + elapsed, cap };
}

export function accrueDisplayIncome(profile, entries, qualityMap, config, now = Date.now()) {
  const preview = previewDisplayIncome(profile, entries, qualityMap, config, now);
  profile.showroomPendingIncome = preview.total;
  profile.showroomAccruedHours = preview.elapsedHours;
  profile.showroomLastIncomeAt = now;
  return preview;
}

export function claimDisplayIncome(profile, entries, qualityMap, config, now = Date.now()) {
  const preview = accrueDisplayIncome(profile, entries, qualityMap, config, now);
  if (preview.amount > 0 || preview.elapsedHours >= preview.cap) {
    profile.money += preview.amount;
    profile.showroomPendingIncome = 0;
    profile.showroomAccruedHours = 0;
    profile.showroomLastIncomeAt = now;
  }
  return { amount: preview.amount, elapsedHours: preview.elapsedHours };
}
