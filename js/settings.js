import { exportSave, parseSave } from './save.js';
import { playSound } from './utils/audio.js';
import { DEFAULT_PROFILE } from './utils/storage.js';

function cleanName(value) { return value.trim().replace(/\s+/g, ' ').slice(0, 16); }

export async function createSettings({ profile, onProfileChange }) {
  const config = await fetch('data/gameConfig.json').then((response) => response.json());
  const nameInput = document.querySelector('#settings-name-input'); const soundInput = document.querySelector('#sound-enabled-input'); const feedback = document.querySelector('#settings-feedback');
  document.querySelector('#name-change-cost').textContent = `$${config.nameChangeCost.toLocaleString('en-US')}`;
  function render() { nameInput.value = profile.name; soundInput.checked = profile.settings.soundEnabled; }
  function show(message) { feedback.textContent = message; }
  function saveName() {
    const name = cleanName(nameInput.value); if (!name) return show('請輸入名稱。');
    const cost = profile.hasChosenName && name !== profile.name ? config.nameChangeCost : 0;
    if (cost > profile.money) return show('資產不足，無法修改名稱。');
    profile.money -= cost; profile.name = name; profile.hasChosenName = true; onProfileChange(profile); render(); playSound('bid'); show(cost ? `名稱已更新，扣除 $${cost.toLocaleString('en-US')}。` : '名稱已儲存。');
  }
  function saveSound() { profile.settings.soundEnabled = soundInput.checked; onProfileChange(profile); if (soundInput.checked) playSound('reveal'); show(soundInput.checked ? '音效已開啟。' : '音效已關閉。'); }
  function exportCurrent() { const blob = new Blob([exportSave(profile)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `warehouse-auction-save-${Date.now()}.json`; link.click(); URL.revokeObjectURL(link.href); show('存檔已匯出。'); }
  async function importCurrent(event) { const file = event.target.files?.[0]; if (!file) return; try { Object.assign(profile, parseSave(await file.text())); profile.settings = { ...DEFAULT_PROFILE.settings, ...(profile.settings ?? {}) }; profile.stats = { ...DEFAULT_PROFILE.stats, ...(profile.stats ?? {}) }; profile.hasChosenName = Boolean(profile.hasChosenName); onProfileChange(profile); render(); show('存檔已匯入。'); } catch (error) { show(error.message); } finally { event.target.value = ''; } }
  const nameButton = document.querySelector('#save-name-button'); const exportButton = document.querySelector('#export-save-button'); const importInput = document.querySelector('#import-save-input'); const resetMoneyButton = document.querySelector('#reset-money-button');
  const resetMoney = () => { if (!window.confirm('確定要將資產重製為 $1,000,000 嗎？收藏不會刪除。')) return; profile.money = 1000000; onProfileChange(profile); show('玩家資產已重製為 $1,000,000。'); };
  nameButton.addEventListener('click', saveName); soundInput.addEventListener('change', saveSound); exportButton.addEventListener('click', exportCurrent); importInput.addEventListener('change', importCurrent); resetMoneyButton.addEventListener('click', resetMoney); render();
  return { destroy: () => { nameButton.removeEventListener('click', saveName); soundInput.removeEventListener('change', saveSound); exportButton.removeEventListener('click', exportCurrent); importInput.removeEventListener('change', importCurrent); resetMoneyButton.removeEventListener('click', resetMoney); } };
}

export function openFirstNameDialog(profile, onProfileChange) {
  if (profile.hasChosenName) return;
  const modal = document.querySelector('#player-name-modal'); const form = document.querySelector('#player-name-form'); const input = document.querySelector('#onboarding-name-input'); const startButton = document.querySelector('#onboarding-start-button');
  modal.hidden = false;
  let completed = false;
  const complete = () => { if (completed) return; const name = cleanName(input.value); if (!name) { window.requestAnimationFrame(() => input.focus()); return; } completed = true; profile.name = name; profile.hasChosenName = true; modal.hidden = true; onProfileChange(profile); startButton.removeEventListener('click', complete); input.removeEventListener('keydown', handleKeydown); playSound('reveal'); };
  const handleKeydown = (event) => { if (event.key === 'Enter') { event.preventDefault(); complete(); } };
  startButton.addEventListener('click', complete); input.addEventListener('keydown', handleKeydown);
  window.requestAnimationFrame(() => input.focus());
}
