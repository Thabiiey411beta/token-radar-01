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
    '<div class="stat"><b>' + money(R.floor_usd) + '</b><span>watchlist floor</span></div>' +
    (R.validation ? '<div class="stat"><b>' + R.validation.brier.toFixed(3) + '</b><span>Brier score</span></div>' : '');
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
      '<p class="why">Farm cost: <b>$' + r.farm_cost_usd.toFixed(2) + '</b> — the plan\u2019s capital plus its gas, priced from the plan itself' +
      (r.farmability < 0.5 ? ' ($0: there is no position to farm here).' : '.') + '</p>' +
      '<h3>Farm plan — six steps</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    detailEl.hidden = false;
    render();
    window.scrollTo(0, 0);
  }

  // Live tokens tab.
  document.getElementById('liverows').innerHTML = R.live.map(function (p) {
    return '<tr><td>' + esc(p.name) + '<br><span class="why">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + (p.mcap_usd === null ? '—' : money(p.mcap_usd)) + '</td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // Validation tab: the numbers radar-3 is judged on, rendered from data.js.
  (function renderValidation() {
    var v = R.validation;
    var el = document.getElementById('validation');
    if (!v || !el) return;
    function num(n, d) { return (n === null || n === undefined) ? '—' : n.toFixed(d === undefined ? 3 : d); }
    var html = '<p><b>Verdict.</b> ' + esc(v.verdict) + '</p>' +
      '<p class="note">Outcome: ' + esc(v.outcome) + ' ' + esc(v.probability_map) + '</p>' +
      '<h3>Leave-one-out stability</h3>' +
      '<p>Rebuild the board 40 times, once with each watchlist protocol removed, and watch the top 20. ' +
      'Mean absolute rank move <b>' + num(v.loo.mean_abs_displacement, 2) + '</b> places, worst move <b>' +
      v.loo.max_abs_displacement + '</b>, mean Kendall tau <b>' + num(v.loo.mean_tau) + '</b> (worst ' +
      num(v.loo.min_tau) + '). A ranking that reshuffles on one name is not a ranking.</p>' +
      '<h3>Walk-forward check</h3>' +
      '<p>Split the dated protocols at the median listing date, <b>' + esc(v.walk_forward.cutoff) + '</b> (' +
      v.walk_forward.early_n + ' listed before, ' + v.walk_forward.late_n + ' after). Fitting the base multiple and ' +
      'growth weight on the early half picks base <b>' + v.walk_forward.calibrated_base_multiple + '</b> and growth ' +
      '<b>' + v.walk_forward.calibrated_growth_weight + '</b> (early Brier ' + num(v.walk_forward.early_brier_calibrated) +
      ' vs radar-3\u2019s ' + num(v.walk_forward.early_brier_radar3) + '). On the later-listed half the fitted constants score ' +
      '<b>' + num(v.walk_forward.late_brier_calibrated) + '</b> against radar-3\u2019s <b>' + num(v.walk_forward.late_brier_radar3) +
      '</b> — a gain of ' + num(v.walk_forward.late_brier_radar3 - v.walk_forward.late_brier_calibrated) +
      ', within noise, so chasing it would be fitting the proxy, not the launch.</p>' +
      '<h3>Brier score — ' + num(v.brier) + ' vs ' + num(v.base_rate_brier) + ' for always predicting the base rate</h3>' +
      '<p>' + v.scored_n + ' pre-token protocols report a 7-day change; ' + (v.prevalence * 100).toFixed(1) +
      '% are in the top quartile (7d at or above ' + (v.threshold_7d > 0 ? '+' : '') + v.threshold_7d +
      '%). Skill over the base rate: <b>' + num(v.skill) + '</b> (1 is perfect, 0 is the base rate).</p>' +
      '<table class="plain"><thead><tr><th>Category</th><th>n</th><th>Brier</th><th>Base rate</th></tr></thead><tbody>' +
      v.per_category.map(function (c) {
        return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.n + '</td><td class="num">' +
          num(c.brier) + '</td><td class="num">' + num(c.base_rate_brier) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="note">Only categories with 10 or more scored protocols are listed; the rest count in the overall score only.</p>' +
      '<h3>Tested but not kept</h3>' +
      '<table class="plain"><thead><tr><th>Variant</th><th>Base</th><th>Growth</th><th>Maturity</th><th>Farm floor</th><th>Brier</th><th>LOO move</th><th>LOO tau</th><th>Why</th></tr></thead><tbody>' +
      v.variants.map(function (t) {
        return '<tr><td>' + esc(t.label) + '</td><td class="num">' + t.base_multiple + '</td><td class="num">' +
          t.growth_weight + '</td><td>' + esc(t.maturity) + '</td><td class="num">' + t.farm_floor + '</td><td class="num">' +
          num(t.brier) + '</td><td class="num">' + num(t.loo_mean_abs_displacement, 2) + '</td><td class="num">' +
          num(t.loo_mean_tau) + '</td><td>' + esc(t.reason) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h3>Costed verdicts — farming the top 10 costs $' + v.top10_farm_cost_usd.toFixed(2) + '</h3>' +
      '<table class="plain"><thead><tr><th>#</th><th>Protocol</th><th>Farm cost</th></tr></thead><tbody>' +
      v.top10.map(function (t) {
        return '<tr><td class="num">' + t.rank + '</td><td>' + esc(t.name) + '<br><span class="why">' + esc(t.slug) +
          '</span></td><td class="num">$' + t.farm_cost_usd.toFixed(2) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="note">Farm cost is the plan\u2019s own capital plus its gas across the hold; a row that cannot be farmed costs $0.</p>';
    el.innerHTML = html;
  })();

  // Tabs + routing.
  var tabs = { board: 'tab-board', live: 'tab-live', model: 'tab-model', validation: 'tab-validation' };
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
    if (h === '#/validation') { showTab('validation'); return; }
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
