export function playGameAnimation(type, text) {
  const old = document.querySelector('#game-fx'); old?.remove();
  const overlay = document.createElement('div'); overlay.id = 'game-fx'; overlay.className = `game-fx game-fx-${type}`;
  overlay.innerHTML = `<div class="fx-crate">▣</div><strong>${text}</strong><span>${type === 'win' ? '✦ ✦ ✦' : '◈ ◈ ◈'}</span>`;
  document.body.append(overlay);
  window.setTimeout(() => overlay.remove(), type === 'win' ? 2100 : 1200);
}

export function playUnboxingAnimation(items) {
  document.querySelector('#unboxing-fx')?.remove();
  const overlay = document.createElement('div'); overlay.id = 'unboxing-fx'; overlay.className = 'unboxing-fx';
  const totalValue = items.reduce((total, item) => total + item.value, 0);
  overlay.innerHTML = `<section role="dialog" aria-modal="true" aria-label="倉庫開箱結算"><div class="unboxing-header"><div><p class="eyebrow">WAREHOUSE UNBOXING</p><h2>倉庫開箱</h2><p>由左至右逐一揭曉 ${items.length} 件藏品，總價值 $${totalValue.toLocaleString('en-US')}。</p></div><button class="unboxing-skip" type="button">跳過動畫</button></div><div class="unboxing-strip">${items.map((item) => `<article><span class="unboxing-card-back">?</span><span class="unboxing-item-image" aria-hidden="true">${item.image}</span><strong>${item.name}</strong><small>${item.quality} · $${item.value.toLocaleString('en-US')}</small></article>`).join('')}</div></section>`;
  const cards = [...overlay.querySelectorAll('.unboxing-strip article')]; let index = 0; let timer; let finished = false; const skipButton = overlay.querySelector('.unboxing-skip'); const finish = () => { if (finished) return; finished = true; window.clearInterval(timer); cards.forEach((card) => card.classList.add('is-revealed')); skipButton.textContent = '關閉結算'; };
  timer = window.setInterval(() => { if (index >= cards.length) { finish(); return; } cards[index].classList.add('is-revealed'); index += 1; }, 180);
  skipButton.addEventListener('click', () => { if (finished) overlay.remove(); else finish(); }); document.body.append(overlay);
}
