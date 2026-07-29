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
  overlay.innerHTML = `<section><p class="eyebrow">WAREHOUSE UNBOXING</p><h2>倉庫開箱</h2><p>由左至右逐一揭曉你的收藏品。</p><button class="unboxing-skip" type="button">跳過動畫，查看結算</button><div class="unboxing-strip">${items.map((item) => `<article><span>?</span><strong>${item.name}</strong><small>${item.quality} · $${item.value.toLocaleString('en-US')}</small></article>`).join('')}</div></section>`;
  const cards = [...overlay.querySelectorAll('.unboxing-strip article')]; let index = 0; let timer; const finish = () => { window.clearInterval(timer); cards.forEach((card) => card.classList.add('is-revealed')); overlay.querySelector('.unboxing-skip').textContent = '關閉結算'; overlay.querySelector('.unboxing-skip').onclick = () => overlay.remove(); };
  timer = window.setInterval(() => { if (index >= cards.length) { finish(); return; } cards[index].classList.add('is-revealed'); index += 1; }, 180);
  overlay.querySelector('.unboxing-skip').addEventListener('click', finish); document.body.append(overlay);
}
