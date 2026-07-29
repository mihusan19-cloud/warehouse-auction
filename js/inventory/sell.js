export function sellCollectionItems(profile, instanceIds, catalog) {
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const selected = new Set(instanceIds);
  const entries = profile.collection.filter((entry) => typeof entry === 'object' && selected.has(entry.instanceId));
  if (!entries.length) return { sold: 0, value: 0, message: '請先選取要出售的收藏品。' };
  if (entries.some((entry) => entry.displayed)) return { sold: 0, value: 0, message: '展示中的物品必須先下架才能出售。' };
  const value = entries.reduce((total, entry) => total + (catalogById.get(entry.itemId)?.value ?? 0), 0);
  profile.collection = profile.collection.filter((entry) => typeof entry !== 'object' || !selected.has(entry.instanceId));
  profile.money += value;
  return { sold: entries.length, value, message: `已出售 ${entries.length} 件物品，獲得 $${value.toLocaleString('en-US')}。` };
}
