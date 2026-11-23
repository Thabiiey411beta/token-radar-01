// Token Radar dashboard: renders window.RADAR (written by main.ts from the sealed snapshot).
// No network, no fetch: the data is in data.js beside this page. Deep links: #/p/<slug> for
// a protocol's detail, #/f/watchlist for the watchlist filter, #/live and #/model for the tabs.
(function () {
  var R = window.RADAR;
  if (!R) { document.body.innerHTML = '<p style="padding:24px">No data: run main.ts to write data.js.</p>'; return; }
  var watch = {};
  (R.watchlist || []).forEach(function (s) { watch[s] = true; });

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Stats strip.
  document.getElementById('stats').innerHTML =
    '<div class="stat"><b>' + R.board_size + '</b><span>pre-token</span></div>' +
    '<div class="stat"><b>' + R.watchlist_size + '</b><span>watchlist</span></div>' +
    '<div class="stat"><b>' + R.live_size + '</b><span>live set aside</span></div>' +
    '<div class="stat"><b>' + money(R.floor_usd) + '</b><span>watchlist floor</span></div>';
  document.getElementById('asof').textContent = R.as_of;

  // Filter options.
  var cats = {}, chains = {};
  R.rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  function fill(sel, values) {
    values.sort().forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o);
    });
  }
  fill(document.getElementById('cat'), Object.keys(cats));
  fill(document.getElementById('chain'), Object.keys(chains));

  var q = document.getElementById('q'), cat = document.getElementById('cat'),
      chain = document.getElementById('chain'), watchonly = document.getElementById('watchonly'),
      farmonly = document.getElementById('farmonly'), sort = document.getElementById('sort'),
      rowsEl = document.getElementById('rows'), countEl = document.getElementById('count'),
      detailEl = document.getElementById('detail');
  var selected = null;

  function filtered() {
    var term = q.value.trim().toLowerCase();
    var list = R.rows.filter(function (r) {
      if (term && r.name.toLowerCase().indexOf(term) < 0 && r.slug.indexOf(term) < 0) return false;
      if (cat.value && r.category !== cat.value) return false;
      if (chain.value && r.chains.indexOf(chain.value) < 0) return false;
      if (watchonly.checked && !watch[r.slug]) return false;
      if (farmonly.checked && r.farmability < 0.5) return false;
      return true;
    });
    var k = sort.value;
    if (k === 'tvl') list.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (k === 'growth') list.sort(function (a, b) { return (b.change_7d || -9999) - (a.change_7d || -9999); });
    else if (k === 'implied') list.sort(function (a, b) { return b.implied_value_usd - a.implied_value_usd; });
    return list;
  }

  function render() {
    var list = filtered();
    countEl.textContent = list.length + ' of ' + R.rows.length + ' pre-token protocols' +
      (watchonly.checked ? ' · watchlist only' : '') + (farmonly.checked ? ' · farmable only' : '');
    rowsEl.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (selected === r.slug ? 'sel' : '') + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td>' + esc(r.name) + (watch[r.slug] ? ' <span class="star" title="On the watchlist">★</span>' : '') + '<br><span class="why">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + money(r.implied_value_usd) + '</td>' +
        '<td>' + (r.farmability >= 0.5 ? '<span class="badge farm">farmable</span>' : '<span class="badge nofarm">no farm</span>') + '</td></tr>';
    }).join('');
    rowsEl.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }

  function showDetail(slug) {
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    selected = slug;
    if (!r) { detailEl.hidden = true; render(); return; }
    var base = r.tvl_usd * 0.3;
    detailEl.innerHTML =
      '<h2>#' + r.rank + ' ' + esc(r.name) + (watch[r.slug] ? ' <span class="star">★ watchlist</span>' : '') + '</h2>' +
      '<p class="meta">' + esc(r.category || 'No category') + ' · ' + esc(r.chains.join(', ') || 'no chains listed') +
      ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + (r.change_7d === null ? 'not reported' : (r.change_7d > 0 ? '+' : '') + r.change_7d + '%') +
      ' · tracked since ' + (r.listed_at || 'unknown') + (r.age_days === null ? '' : ' (' + r.age_days + ' days)') + '</p>' +
      '<div class="breakdown">' +
      '<div><b>' + money(base) + '</b><span>base · TVL × 0.30</span></div>' +
      '<div><b>× ' + r.growth_multiplier.toFixed(2) + '</b><span>growth · 7-day change</span></div>' +
      '<div><b>× ' + r.maturity_multiplier.toFixed(2) + '</b><span>maturity · age</span></div>' +
      '<div><b>× ' + r.farmability + '</b><span>farmability</span></div>' +
      '<div><b>× ' + r.breadth_multiplier.toFixed(2) + '</b><span>breadth · ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</span></div>' +
      '<div><b>' + money(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '</div>' +
      '<p class="why">Farmability ' + r.farmability + ': ' + esc(r.farm_reason) + '.</p>' +
      '<h3>Farm plan — six steps</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    detailEl.hidden = false;
    render();
    window.scrollTo(0, detailEl.getBoundingClientRect().top + window.scrollY);
  }

  // Live tokens tab.
  document.getElementById('liverows').innerHTML = R.live.map(function (p) {
    return '<tr><td>' + esc(p.name) + '<br><span class="why">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + (p.mcap_usd === null ? '—' : money(p.mcap_usd)) + '</td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // Tabs + routing.
  var tabs = { board: 'tab-board', live: 'tab-live', model: 'tab-model' };
  function showTab(name) {
    Object.keys(tabs).forEach(function (t) {
      document.getElementById(tabs[t]).hidden = t !== name;
    });
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === name);
    });
  }
  function route() {
    var h = location.hash || '#/';
    if (h === '#/live') { showTab('live'); return; }
    if (h === '#/model') { showTab('model'); return; }
    showTab('board');
    if (h === '#/f/watchlist') { watchonly.checked = true; selected = null; detailEl.hidden = true; render(); return; }
    var m = h.match(/^#\/p\/(.+)$/);
    if (m) { showDetail(decodeURIComponent(m[1])); return; }
    selected = null; detailEl.hidden = true; render();
  }
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tab');
      location.hash = t === 'board' ? '#/' : '#/' + t;
    });
  });
  document.querySelectorAll('#board th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-k');
      sort.value = k === 'name' || k === 'category' ? 'rank' : k;
      render();
    });
  });
  [q, cat, chain, watchonly, farmonly, sort].forEach(function (el) {
    el.addEventListener('input', function () { selected = null; detailEl.hidden = true; render(); });
    el.addEventListener('change', function () { selected = null; detailEl.hidden = true; render(); });
  });
  window.addEventListener('hashchange', route);
  route();
})();
