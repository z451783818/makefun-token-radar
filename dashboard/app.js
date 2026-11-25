// Token launch radar — dashboard logic. Reads window.RADAR (data.js), no network.
(function () {
  const D = window.RADAR;
  if (!D) { document.getElementById('meta').textContent = 'No data: data.js is missing.'; return; }
  const $ = (id) => document.getElementById(id);
  const money = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + n;
  const pct = (n) => n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const watch = new Set(D.watchlist);

  // Header + funnel.
  $('meta').innerHTML = '<b>' + D.rows.length + ' protocols ranked</b> · snapshot ' + esc(D.snapshot_as_of) +
    '<br>Base multiple ' + D.model.base_multiple.toFixed(4) + ' from ' + D.model.comparables + ' live-token comparables' +
    '<br>Model ' + esc(D.model_version) + ' · ' + esc(D.snapshot_source.split(',')[0]);
  const f = D.funnel;
  $('funnel').innerHTML = ['<span><b>' + f.snapshot + '</b> in snapshot</span>',
    '<span><b>' + f.live_token + '</b> live-token</span>',
    '<span><b>' + f.no_token + '</b> no token recorded</span>',
    '<span><b>' + f.excluded + '</b> excluded</span>',
    '<span><b>' + f.board + '</b> on the board</span>',
    '<span><b>' + f.watchlist + '</b> watchlist</span>'].join('');

  // Filter controls.
  const cats = [...new Set(D.rows.map((r) => r.category).filter(Boolean))].sort();
  cats.forEach((c) => $('cat').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'));
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  chains.forEach((c) => $('chain').insertAdjacentHTML('beforeend', '<option>' + esc(c) + '</option>'));
  const TVL_STEPS = [0, 5e6, 1e7, 2.5e7, 5e7, 1e8, 2.5e8, 5e8, 1e9, 2.5e9];
  $('tvl').addEventListener('input', (e) => { $('tvlLabel').textContent = money(TVL_STEPS[+e.target.value]); render(); });
  let sortKey = 'rank', sortDir = 1;
  document.querySelectorAll('#board th[data-sort]').forEach((th) => th.addEventListener('click', () => {
    const k = th.dataset.sort;
    if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === 'name' || k === 'category' ? 1 : -1; }
    render();
  }));

  function filtered() {
    const q = $('q').value.trim().toLowerCase();
    const cat = $('cat').value, chain = $('chain').value, w = $('watch').checked;
    const minTvl = TVL_STEPS[+$('tvl').value];
    let rows = D.rows.filter((r) =>
      (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
      (!cat || r.category === cat) && (!chain || r.chains.includes(chain)) &&
      (!w || watch.has(r.slug)) && r.tvl_usd >= minTvl);
    rows = rows.slice().sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1; if (bv === null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * sortDir;
    });
    return rows;
  }

  function render() {
    const rows = filtered();
    $('count').textContent = rows.length + ' of ' + D.rows.length + ' rows';
    $('rows').innerHTML = rows.map((r) => '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
      '<td><b>' + esc(r.name) + '</b>' + (watch.has(r.slug) ? '<span class="badge">WATCH</span>' : '') + '<br><span style="color:var(--muted)">' + esc(r.slug) + '</span></td>' +
      '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 3).join(', ')) + '</td>' +
      '<td class="num">' + money(r.tvl_usd) + '</td>' +
      '<td class="num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</td>' +
      '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td><td>›</td></tr>').join('');
    document.querySelectorAll('#rows tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.slug)));
  }
  ['q', 'cat', 'chain', 'watch'].forEach((id) => $(id).addEventListener('input', render));

  // Detail drawer: recomputes the implied value from the row's own figures and checks it against the board.
  function openDetail(slug) {
    const r = D.rows.find((x) => x.slug === slug);
    if (!r) return;
    const m = D.model;
    const growthPct = Math.max(m.growth_floor, Math.min(m.growth_cap, r.change_7d ?? 0));
    const growthMul = 1 + (m.growth_weight * growthPct) / 100;
    const age = r.age_days ?? m.unknown_age_days;
    const maturityMul = m.maturity_floor + (m.maturity_range * Math.min(age, m.maturity_days)) / m.maturity_days;
    const breadthMul = 1 + m.breadth_step * Math.min(Math.max(r.chains.length - 1, 0), m.breadth_cap);
    const recomputed = Math.max(1, Math.round(r.tvl_usd * r.base_multiple * growthMul * maturityMul * breadthMul));
    const ok = recomputed === r.implied_value_usd;
    $('detail').innerHTML = '<h2>' + esc(r.name) + (watch.has(r.slug) ? '<span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p style="color:var(--muted)">' + esc(r.slug) + ' · ' + esc(r.category || 'uncategorised') + ' · ' + esc(r.chains.join(', ')) + '</p>' +
      '<dl class="kv"><dt>Implied value</dt><dd><b>' + money(r.implied_value_usd) + '</b></dd>' +
      '<dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + pct(r.change_7d) + '</dd>' +
      '<dt>Listed</dt><dd>' + esc(r.listed_at || 'not recorded') + (r.age_days === null ? '' : ' (' + r.age_days + ' days)') + '</dd>' +
      '<dt>Token recorded</dt><dd>None — no market cap, no CoinGecko id, no symbol in the snapshot</dd></dl>' +
      '<h3>How the value is built</h3><dl class="kv">' +
      '<dt>Base</dt><dd>' + money(r.tvl_usd) + ' × ' + r.base_multiple.toFixed(4) + ' = ' + money(Math.round(r.tvl_usd * r.base_multiple)) + '</dd>' +
      '<dt>Growth ×' + growthMul.toFixed(3) + '</dt><dd>' + growthPct.toFixed(1) + '% over 7 days (clamped ' + m.growth_floor + '…+' + m.growth_cap + ')</dd>' +
      '<dt>Maturity ×' + maturityMul.toFixed(3) + '</dt><dd>' + age + ' days old</dd>' +
      '<dt>Breadth ×' + breadthMul.toFixed(3) + '</dt><dd>' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</dd></dl>' +
      '<div class="check-line">' + (ok ? '✓ Recomputed from these figures in this page: ' + money(recomputed) + ' — matches board.json.' : '⚠ Recomputed ' + money(recomputed) + ' does not match the board value.') + '</div>' +
      '<h3>Farm plan</h3><ol>' + r.farm_steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
      '<p class="note">Costs are starting points for a first position, not advice. A protocol that records no token may never issue one.</p>';
    $('drawer').classList.remove('hidden');
  }
  $('close').addEventListener('click', () => $('drawer').classList.add('hidden'));

  // Live token tab.
  $('liveRows').innerHTML = D.live.map((p, i) => '<tr><td class="num">' + (i + 1) + '</td><td><b>' + esc(p.name) + '</b><br><span style="color:var(--muted)">' + esc(p.slug) + '</span></td>' +
    '<td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
    '<td class="num">' + (p.mcap_usd / p.tvl_usd).toFixed(3) + '</td></tr>').join('');

  // Model tab.
  $('modelVersion').textContent = '(' + esc(D.model_version) + ')';
  $('formula').textContent = 'implied = max(1, round(TVL × BASE × growth × maturity × breadth))\n' +
    '  BASE     = median market-cap / TVL of the snapshot\'s live-token protocols\n' +
    '             = ' + D.model.base_multiple.toFixed(4) + ' from ' + D.model.comparables + ' comparables on this snapshot\n' +
    '  growth   = 1 + ' + D.model.growth_weight + ' × clamp(change_7d, ' + D.model.growth_floor + ', +' + D.model.growth_cap + ') / 100\n' +
    '  maturity = ' + D.model.maturity_floor + ' + ' + D.model.maturity_range + ' × min(age_days, ' + D.model.maturity_days + ') / ' + D.model.maturity_days + '\n' +
    '  breadth  = 1 + ' + D.model.breadth_step + ' × min(chains − 1, ' + D.model.breadth_cap + ')\n' +
    '  age      = snapshot date − listed_at; unknown listed_at counts as ' + D.model.unknown_age_days + ' days';
  $('funnelRows').innerHTML = [
    ['Protocols in the snapshot', f.snapshot, 'Every protocol at or above $5M TVL in the sealed DefiLlama fetch.'],
    ['Live-token protocols', f.live_token, 'The snapshot records a token (market cap, CoinGecko id or symbol): set aside, shown on the Live tab.'],
    ['No token recorded', f.no_token, 'No market cap, no CoinGecko id, no symbol.'],
    ['Excluded', f.excluded, 'Exchanges, bridges, liquid-staking / restaking products, versioned pools and wrapped or staked products of tokens that already trade.'],
    ['Rows on the board', f.board, 'Every survivor, ranked by implied value. The whole watchlist is in here.'],
  ].map((r) => '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td><td>' + r[2] + '</td></tr>').join('');
  const byCat = {};
  D.rows.forEach((r) => { const c = r.category || 'Uncategorised'; byCat[c] = byCat[c] || { n: 0, v: 0 }; byCat[c].n++; byCat[c].v += r.implied_value_usd; });
  const total = D.rows.reduce((a, r) => a + r.implied_value_usd, 0);
  $('catRows').innerHTML = Object.entries(byCat).sort((a, b) => b[1].v - a[1].v)
    .map(([c, x]) => '<tr><td>' + esc(c) + '</td><td class="num">' + x.n + '</td><td class="num">' + money(x.v) + '</td><td class="num">' + (100 * x.v / total).toFixed(1) + '%</td></tr>').join('');

  // Tabs.
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
    $('tab-' + t.dataset.tab).classList.remove('hidden');
  }));

  render();
})();
