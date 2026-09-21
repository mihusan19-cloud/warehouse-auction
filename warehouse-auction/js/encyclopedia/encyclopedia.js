const QUALITY_RANK = { '垃圾': 0, '普通': 1, '稀有': 2, '史詩': 3, '傳說': 4, '神話': 5 };

export function materializeCatalog(data) {
  return data.series.flatMap((series) => series.names.map((name, index) => {
    const [width, height] = data.sizeCycle[index % data.sizeCycle.length];
    return { id: `${series.id}-${String(index + 1).padStart(2, '0')}`, name, image: series.image, quality: data.qualityCycle[index % data.qualityCycle.length], value: series.baseValue + series.valueStep * index, width, height, series: series.name, description: data.descriptionTemplate.replace('{series}', series.name).replace('{name}', name) };
  }));
}

export async function loadCatalog() {
  const response = await fetch('data/items.json');
  if (!response.ok) throw new Error('無法載入物品目錄。');
  return materializeCatalog(await response.json());
}

export async function createEncyclopedia({ profile }) {
  const [catalog, qualitiesData] = await Promise.all([loadCatalog(), fetch('data/qualities.json').then((response) => response.json())]);
  const qualityMap = Object.fromEntries(qualitiesData.qualities.map((quality) => [quality.id, quality]));
  const search = document.querySelector('#catalog-search');
  const filters = { quality: 'all', collection: 'all', sort: 'name-asc' };
  const grid = document.querySelector('#catalog-grid');
  const count = document.querySelector('#catalog-visible-count');
  const menus = [];
  function createMenu(id, choices, filterKey) {
    const root = document.querySelector(`#${id}`); const button = document.createElement('button'); const list = document.createElement('div'); button.type = 'button'; button.className = 'catalog-select-button'; list.className = 'catalog-select-list'; root.replaceChildren(button, list);
    function close() { root.classList.remove('is-open'); }
    function update() { button.textContent = choices.find((choice) => choice.value === filters[filterKey])?.label ?? ''; }
    choices.forEach((choice) => { const option = document.createElement('button'); option.type = 'button'; option.textContent = choice.label; option.addEventListener('click', () => { filters[filterKey] = choice.value; update(); close(); render(); }); list.append(option); });
    button.addEventListener('click', (event) => { event.stopPropagation(); menus.forEach((menu) => menu.close()); root.classList.toggle('is-open'); }); update(); menus.push({ close });
  }
  createMenu('catalog-quality', [{ value: 'all', label: '全部品質' }, ...qualitiesData.qualities.map((entry) => ({ value: entry.id, label: entry.label }))], 'quality');
  createMenu('catalog-collection', [{ value: 'all', label: '全部狀態' }, { value: 'owned', label: '已收藏' }, { value: 'missing', label: '尚未收藏' }], 'collection');
  createMenu('catalog-sort', [{ value: 'name-asc', label: '名稱 A→Z' }, { value: 'value-desc', label: '價值：高至低' }, { value: 'value-asc', label: '價值：低至高' }, { value: 'quality-desc', label: '品質：高至低' }], 'sort');
  function isOwned(item) { return Array.isArray(profile.collection) && profile.collection.some((entry) => typeof entry === 'string' ? entry === item.id : entry.itemId === item.id); }
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = catalog.filter((item) => {
      const matchesSearch = !query || `${item.name} ${item.series} ${item.description}`.toLocaleLowerCase().includes(query);
      const matchesQuality = filters.quality === 'all' || item.quality === filters.quality;
      const matchesCollection = filters.collection === 'all' || (filters.collection === 'owned' ? isOwned(item) : !isOwned(item));
      return matchesSearch && matchesQuality && matchesCollection;
    });
    filtered.sort((left, right) => {
      if (filters.sort === 'value-desc') return right.value - left.value;
      if (filters.sort === 'value-asc') return left.value - right.value;
      if (filters.sort === 'quality-desc') return QUALITY_RANK[right.quality] - QUALITY_RANK[left.quality] || right.value - left.value;
      return left.name.localeCompare(right.name, 'zh-Hant');
    });
    count.textContent = String(filtered.length);
    grid.replaceChildren(...filtered.map((item) => {
      const itemQuality = qualityMap[item.quality];
      const card = document.createElement('article'); card.className = 'catalog-card'; card.style.setProperty('--quality-color', itemQuality.color);
      card.innerHTML = `<div class="catalog-image" aria-hidden="true">${item.image}</div><div class="catalog-card-main"><span class="quality-tag">${item.quality}</span><h3>${item.name}</h3><p>${item.description}</p><div class="catalog-meta"><span>${item.series}</span><span>${item.width} × ${item.height} 格</span></div><strong class="catalog-value">$${item.value.toLocaleString('en-US')}</strong>${isOwned(item) ? '<span class="owned-tag">已收藏</span>' : '<span class="missing-tag">尚未收藏</span>'}</div>`;
      return card;
    }));
  }
  const closeMenus = () => menus.forEach((menu) => menu.close());
  search.addEventListener('input', render); document.addEventListener('click', closeMenus);
  render();
  return { destroy: () => { search.removeEventListener('input', render); document.removeEventListener('click', closeMenus); }, catalog };
}
