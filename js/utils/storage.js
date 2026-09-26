const SAVE_KEY = 'warehouse-auction-save-v1';

export const DEFAULT_PROFILE = Object.freeze({ name: '競標新手', money: 1000000, collection: [], hasChosenName: false, settings: { soundEnabled: true }, stats: { auctions: 0, wins: 0 }, auction: { selectedVenue: 'yard', selectedAssistant: 'surveyor', instruments: { sizeScanner: 0, qualityScanner: 0, valueProbe: 0 } } });

export function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    const profile = { ...DEFAULT_PROFILE, ...(saved?.profile ?? {}) };
    profile.settings = { ...DEFAULT_PROFILE.settings, ...(profile.settings ?? {}) };
    profile.stats = { ...DEFAULT_PROFILE.stats, ...(profile.stats ?? {}) };
    const { intel: _legacyIntel, ...savedAuction } = profile.auction ?? {};
    profile.auction = { ...DEFAULT_PROFILE.auction, ...savedAuction, instruments: { ...DEFAULT_PROFILE.auction.instruments, ...(savedAuction.instruments ?? {}) } };
    return profile;
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile) {
  const { intel: _legacyIntel, ...savedAuction } = profile.auction ?? {};
  const safeProfile = { ...DEFAULT_PROFILE, ...profile, settings: { ...DEFAULT_PROFILE.settings, ...(profile.settings ?? {}) }, stats: { ...DEFAULT_PROFILE.stats, ...(profile.stats ?? {}) }, auction: { ...DEFAULT_PROFILE.auction, ...savedAuction, instruments: { ...DEFAULT_PROFILE.auction.instruments, ...(savedAuction.instruments ?? {}) } } };
  localStorage.setItem(SAVE_KEY, JSON.stringify({ profile: safeProfile }));
  return safeProfile;
}

export function addCollectedItems(profile, items) {
  const timestamp = Date.now();
  const entries = items.map((item, index) => ({ instanceId: `${timestamp}-${index}-${Math.random().toString(36).slice(2, 7)}`, itemId: item.id, displayed: false, acquiredAt: timestamp }));
  profile.collection = [...(Array.isArray(profile.collection) ? profile.collection : []), ...entries];
  return entries;
}
