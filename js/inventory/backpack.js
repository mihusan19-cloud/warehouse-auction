export function collectionEntries(profile, catalog) {
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  return (Array.isArray(profile.collection) ? profile.collection : []).filter((entry) => typeof entry === 'object' && catalogById.has(entry.itemId)).map((entry) => ({ ...entry, item: catalogById.get(entry.itemId) }));
}

export function setDisplayState(profile, instanceId, displayed, limit) {
  const entry = profile.collection.find((candidate) => typeof candidate === 'object' && candidate.instanceId === instanceId);
  if (!entry) return { changed: false, message: '找不到這件收藏品。' };
  const currentCount = profile.collection.filter((candidate) => typeof candidate === 'object' && candidate.displayed).length;
  if (displayed && currentCount >= limit) return { changed: false, message: `展示館最多展示 ${limit} 件物品。` };
  entry.displayed = displayed;
  return { changed: true };
}
