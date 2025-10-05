async function load() {
  const res = await fetch('manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('manifest.json not found');
  const list = await res.json();
  const grid = document.getElementById('grid');
  const tpl = document.getElementById('card-tpl');

  function render(items) {
    grid.innerHTML = '';
    items.forEach(g => {
      const node = tpl.content.cloneNode(true);
      const a = node.querySelector('.card');
      a.href = g.entry;
      a.target = '_blank';
      a.rel = 'noopener';
      node.querySelector('.card__title').textContent = g.title;
      const meta = [g.year, g.system].filter(Boolean).join(' • ');
      node.querySelector('.card__meta').textContent = meta;
      grid.appendChild(node);
    });
  }

  const input = document.getElementById('search');
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    const filtered = list.filter(g =>
      [g.title, (g.tags||[]).join(' '), g.system, String(g.year||'')]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
    render(filtered);
  });

  render(list);
}
load().catch(err => {
  document.getElementById('grid').textContent = 'Failed to load manifest.json';
  console.error(err);
});
