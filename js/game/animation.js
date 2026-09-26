export function playGameAnimation(type, text) {
  const old = document.querySelector('#game-fx'); old?.remove();
  const overlay = document.createElement('div'); overlay.id = 'game-fx'; overlay.className = `game-fx game-fx-${type}`;
  overlay.innerHTML = `<div class="fx-crate">▣</div><strong>${text}</strong><span>${type === 'win' ? '✦ ✦ ✦' : '◈ ◈ ◈'}</span>`;
  document.body.append(overlay);
  window.setTimeout(() => overlay.remove(), type === 'win' ? 2100 : 1200);
}

export function playUnboxingAnimation(items, { title = '倉庫開箱', description = null } = {}) {
  document.querySelector('#unboxing-fx')?.remove();
  const overlay = document.createElement('div'); overlay.id = 'unboxing-fx'; overlay.className = 'unboxing-fx';
  const totalValue = items.reduce((total, item) => total + item.value, 0);
  overlay.innerHTML = `<section role="dialog" aria-modal="true" aria-label="倉庫開箱結算"><div class="unboxing-header"><div><p class="eyebrow">WAREHOUSE UNBOXING</p><h2>${title}</h2><p>${description ?? `由左至右逐一揭曉 ${items.length} 件藏品，總價值 $${totalValue.toLocaleString('en-US')}。`}</p></div><button class="unboxing-skip" type="button">跳過動畫</button></div><div class="unboxing-strip">${items.map((item) => `<article><span class="unboxing-card-back">?</span><span class="unboxing-item-image" aria-hidden="true" hidden>${item.image || '📦'}</span><strong>${item.name}</strong><small>${item.quality} · $${item.value.toLocaleString('en-US')}</small></article>`).join('')}</div></section>`;
  const cards = [...overlay.querySelectorAll('.unboxing-strip article')]; let index = 0; let timer; let finished = false; const skipButton = overlay.querySelector('.unboxing-skip'); const revealCard = (card) => { card.classList.add('is-revealed'); card.querySelector('.unboxing-card-back').hidden = true; card.querySelector('.unboxing-item-image').hidden = false; }; const finish = () => { if (finished) return; finished = true; window.clearInterval(timer); cards.forEach(revealCard); skipButton.textContent = '關閉結算'; };
  timer = window.setInterval(() => { if (index >= cards.length) { finish(); return; } revealCard(cards[index]); index += 1; }, 180);
  skipButton.addEventListener('click', () => { if (finished) overlay.remove(); else finish(); }); document.body.append(overlay);
}

export function playConditionDraw(options, selected) {
  document.querySelector('#condition-draw-fx')?.remove();
  const overlay = document.createElement('div'); overlay.id = 'condition-draw-fx'; overlay.className = 'condition-draw-fx';
  const choices = [...options].sort(() => Math.random() - 0.5).slice(0, 4);
  if (!choices.some((entry) => entry.id === selected.id)) choices[Math.floor(Math.random() * choices.length)] = selected;
  overlay.innerHTML = `<section role="status"><p class="eyebrow">WAREHOUSE CONDITION</p><h2>正在抽選倉庫條件</h2><div class="condition-draw-list">${choices.map((entry) => `<span data-condition-id="${entry.id}">${entry.title}</span>`).join('')}</div><strong>分析倉庫環境中…</strong></section>`;
  document.body.append(overlay);
  return new Promise((resolve) => { window.setTimeout(() => { overlay.querySelector(`[data-condition-id="${selected.id}"]`)?.classList.add('is-selected'); overlay.querySelector('strong').textContent = selected.title; window.setTimeout(() => { overlay.remove(); resolve(); }, 850); }, 1100); });
}

export function playClueAnimation(title, itemCount = 0) {
  document.querySelector('#clue-fx')?.remove();
  const overlay = document.createElement('div'); overlay.id = 'clue-fx'; overlay.className = 'clue-fx';
  overlay.innerHTML = `<div><span>◈</span><small>NEW INTEL</small><strong>${title}</strong><em>${itemCount ? `已標記 ${itemCount} 件物品` : '倉庫情報已更新'}</em></div>`;
  document.body.append(overlay);
  window.setTimeout(() => overlay.remove(), 1450);
}
