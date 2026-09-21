export function exportSave(profile) {
  return JSON.stringify({ format: 'warehouse-auction-save', version: 1, exportedAt: new Date().toISOString(), profile }, null, 2);
}

export function parseSave(text) {
  const data = JSON.parse(text);
  if (data?.format !== 'warehouse-auction-save' || !data.profile || typeof data.profile !== 'object') throw new Error('這不是有效的《倉庫盲盒競標》存檔。');
  if (!Number.isFinite(Number(data.profile.money)) || !Array.isArray(data.profile.collection)) throw new Error('存檔內容不完整。');
  return data.profile;
}
