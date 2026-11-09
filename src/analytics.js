/* ===================== ANALITYKA ===================== */
const DAY = 864e5;
const dnum = d => new Date(String(d).slice(0, 10) + 'T12:00:00').getTime();

/* XIRR: flows = [[dataStr, kwota]] (wpłata ujemna, wartość końcowa dodatnia) -> stopa roczna */
function xirr(flows) {
  flows = flows.filter(f => f[1] && isFinite(f[1])).sort((a, b) => dnum(a[0]) - dnum(b[0]));
  if (flows.length < 2 || !flows.some(f => f[1] > 0) || !flows.some(f => f[1] < 0)) return null;
  const t0 = dnum(flows[0][0]);
  if ((dnum(flows[flows.length - 1][0]) - t0) / DAY < 1) return null;
  const npv = r => flows.reduce((a, [d, v]) => a + v / Math.pow(1 + r, (dnum(d) - t0) / DAY / 365), 0);
  let lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2, fm = npv(mid); if (Math.abs(fm) < 1e-7) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
  return (lo + hi) / 2;
}
function xirrPortfel(SV, CV) {
  const fl = SV.wplaty.filter(w => w.data && has(w.kwotaPLN)).map(w => [w.data, -num(w.kwotaPLN)]);
  fl.push([todayStr(), CV.wartosc]);
  return xirr(fl);
}
function xirrStrategia(SV, CV, s) {
  const fl = [];
  CV.zamkniete.filter(r => r.strategia === s.nazwa).forEach(r => fl.push([r.data, r.przychodPLN]));
  SV.transakcje.filter(t => t.strategia === s.nazwa && t.typ === 'KUPNO' && t.data).forEach(t => {
    const cur = (SV.instrumenty.find(i => i.ticker === t.ticker) || {}).waluta || 'USD';
    const kurs = cur === 'PLN' ? 1 : (has(t.kurs) ? num(t.kurs) : CV.rateNow(cur));
    fl.push([t.data, -(num(t.ilosc) * num(t.cena) + num(t.prowizja)) * kurs]); });
  CV.dyw.filter(d => d.strategia === s.nazwa).forEach(d => fl.push([d.data, d.nettoPLN]));
  if (s.wartosc) fl.push([todayStr(), s.wartosc]);
  return xirr(fl);
}

/* historia -> stopy okresowe (TWR), indeks bez wpływu wpłat, obsunięcie */
function histPoints(SV) {
  return SV.historia.filter(x => x.data && has(x.wartosc)).map(x => ({ d: String(x.data).slice(0, 10), w: num(x.wartosc), k: num(x.kapital) }))
    .sort((a, b) => a.d.localeCompare(b.d));
}
function twrIndex(pts) {
  const out = []; let I = 1;
  pts.forEach((p, i) => {
    if (i === 0) { out.push({ d: p.d, i: 1 }); return; }
    const prev = pts[i - 1], flow = p.k - prev.k, base = prev.w + flow;
    if (base > 0 && p.w >= 0) I *= p.w / base;
    out.push({ d: p.d, i: I });
  });
  return out;
}
function twrStats(pts) {
  const idx = twrIndex(pts); if (idx.length < 2) return null;
  const tot = idx[idx.length - 1].i - 1, days = (dnum(idx[idx.length - 1].d) - dnum(idx[0].d)) / DAY;
  let peak = 1, maxDD = 0, ddFrom = null, ddTo = null, curPeakD = idx[0].d;
  const dd = idx.map(x => { if (x.i > peak) { peak = x.i; curPeakD = x.d; } const v = x.i / peak - 1; if (v < maxDD) { maxDD = v; ddFrom = curPeakD; ddTo = x.d; } return [x.d, v]; });
  return { tot, roczna: days >= 365 ? Math.pow(1 + tot, 365 / days) - 1 : null, days, dd, maxDD, ddFrom, ddTo, idx, aktualne: dd[dd.length - 1][1] };
}
function monthlyResults(pts) {
  const byM = {}; pts.forEach(p => { byM[p.d.slice(0, 7)] = p; });
  const months = Object.keys(byM).sort(); const out = [];
  months.forEach((m, i) => {
    const end = byM[m], start = i ? byM[months[i - 1]] : pts[0];
    if (!i && start.d === end.d) return;
    const dep = end.k - start.k, zysk = end.w - start.w - dep, base = start.w + Math.max(0, dep) / 2;
    out.push({ m, zysk, pct: base > 0 ? zysk / base : 0 });
  });
  return out;
}

/* notowania historyczne benchmarków (Yahoo przez arkusz, cache w przeglądarce) */
const BENCH = [
  { id: 'sp', label: 'S&P 500 (CSPX)', sym: 'CSPX.L', cur: 'USD', color: '#EF5350' },
  { id: 'msci', label: 'MSCI World (IWDA)', sym: 'IWDA.L', cur: 'USD', color: '#26A69A' },
  { id: 'wig', label: 'WIG20', sym: 'WIG20.WA', cur: 'PLN', color: '#8D6E63' },
  { id: 'edo', label: 'Obligacje EDO (inflacja + 2%)', sym: null, cur: 'PLN', color: '#F9A825' },
];
const FX_SYM = 'PLN=X';
const histCache = sym => lsGet('portfel_hist_' + sym, null);
async function fetchHist(sym) {
  const res = await sheetCompute('K1', `=YAHOO_HIST("${sym}|${Date.now()}")`, 'K1:L4000', 25);
  const rows = res.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(String(r[0])) && typeof r[1] === 'number').map(r => [r[0], r[1]]);
  if (!rows.length) throw new Error('brak notowań ' + sym);
  lsSet('portfel_hist_' + sym, { day: todayStr(), rows }); return rows;
}
let BENCH_BUSY = false;
async function odswiezBenchmarki(force) {
  if (BENCH_BUSY || CFG.demo) return; if (!SYNC.token || Date.now() > SYNC.exp) { if (force) toast('Połącz z Google Sheets, aby pobrać notowania'); return; }
  BENCH_BUSY = true; let ok = 0, err = '';
  try {
    for (const sym of [FX_SYM, ...BENCH.filter(b => b.sym).map(b => b.sym)]) {
      const c = histCache(sym); if (!force && c && c.day === todayStr()) { ok++; continue; }
      try { await fetchHist(sym); ok++; } catch (e) { err = e.message; }
    }
  } finally { BENCH_BUSY = false; }
  if (force) toast(err ? 'Część notowań nie pobrała się: ' + err : 'Notowania benchmarków zaktualizowane');
  render();
}
function priceAt(rows, d) {   // ostatnia cena z dnia <= d (lub pierwsza dostępna)
  if (!rows || !rows.length) return null;
  let lo = 0, hi = rows.length - 1; if (d < rows[0][0]) return rows[0][1];
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rows[mid][0] <= d) lo = mid; else hi = mid - 1; }
  return rows[lo][1];
}
function benchSeries(SV, dates) {
  const wpl = SV.wplaty.filter(w => w.data && has(w.kwotaPLN)).map(w => ({ d: String(w.data).slice(0, 10), v: num(w.kwotaPLN) }));
  if (!wpl.length) return [];
  const fx = (histCache(FX_SYM) || {}).rows;
  const infl = {}; (SV.inflacja || []).forEach(r => { if (has(r.mm)) infl[r.miesiac] = num(r.mm); });
  return BENCH.map(b => {
    let valAt;
    if (!b.sym) {   // EDO: każda wpłata rośnie o inflację + 2% rocznie (miesięcznie)
      const growth = (from, to) => { let f = 1, m = from.slice(0, 7); const end = to.slice(0, 7);
        while (m < end) { const [y, mm] = m.split('-').map(Number); const nx = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
          f *= (1 + (infl[m] || 0) / 100) * Math.pow(1.02, 1 / 12); m = nx; } return f; };
      valAt = d => wpl.filter(w => w.d <= d).reduce((a, w) => a + w.v * growth(w.d, d), 0);
    } else {
      const rows = (histCache(b.sym) || {}).rows; if (!rows || (b.cur === 'USD' && !fx)) return { ...b, brak: true, points: [] };
      const pPLN = d => priceAt(rows, d) * (b.cur === 'USD' ? priceAt(fx, d) : 1);
      const units = wpl.map(w => ({ d: w.d, u: w.v / pPLN(w.d) }));
      valAt = d => units.filter(x => x.d <= d).reduce((a, x) => a + x.u, 0) * pPLN(d);
    }
    return { ...b, points: dates.map(d => [d, valAt(d)]), dzis: valAt(todayStr()) };
  });
}

/* wpływ waluty: zysk z ceny instrumentu vs z kursu */
function fxEffect(CV) {
  return CV.pozycje.filter(p => p.waluta !== 'PLN' && p.koszt > 0).map(p => {
    const avgRate = p.kosztPLN / p.koszt, now = CV.rateNow(p.waluta);
    return { ...p, avgRate, now, efektCena: (p.wartosc - p.koszt) * avgRate, efektKurs: p.wartosc * (now - avgRate) };
  });
}

/* koszty: prowizje, podatek u źródła, podatek PIT-38 (szacunek) */
function costs(SV, CV) {
  const byYear = {};
  const add = (y, k, v) => { byYear[y] = byYear[y] || { prowizje: 0, zrodlo: 0, pit: 0 }; byYear[y][k] += v; };
  SV.transakcje.filter(t => t.data && num(t.prowizja)).forEach(t => {
    const cur = (SV.instrumenty.find(i => i.ticker === t.ticker) || {}).waluta || 'USD';
    add(+String(t.data).slice(0, 4), 'prowizje', num(t.prowizja) * (cur === 'PLN' ? 1 : (has(t.kurs) ? num(t.kurs) : CV.rateNow(cur)))); });
  CV.dyw.forEach(d => add(d.rok, 'zrodlo', d.podatekPLN + d.doplata));
  CV.lata.forEach(y => { const P = CV.podatki(y); if (P.podatekPap + P.kPodatek) add(y, 'pit', P.podatekPap + P.kPodatek); });
  return byYear;
}

/* dochód pasywny: ostatnie 12 miesięcy i prognoza */
function passiveIncome(SV, CV) {
  const from = new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10);
  const last = CV.dyw.filter(d => d.data >= from);
  const months = []; for (let i = 11; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const byMonth = months.map(m => last.filter(d => d.data.slice(0, 7) === m).reduce((a, d) => a + d.nettoPLN, 0));
  const tickers = [...new Set(last.map(d => d.ticker))].map(t => {
    const sum = last.filter(d => d.ticker === t).reduce((a, d) => a + d.nettoPLN, 0);
    const brutto = last.filter(d => d.ticker === t).reduce((a, d) => a + d.bruttoPLN, 0);
    const poz = CV.pozycje.filter(p => p.ticker === t), koszt = poz.reduce((a, p) => a + p.kosztPLN, 0), wart = poz.reduce((a, p) => a + p.wartoscPLN, 0);
    return { ticker: t, netto: sum, brutto, koszt, wart, yoc: koszt ? brutto / koszt : null, yld: wart ? brutto / wart : null, trzymane: poz.length > 0 };
  }).sort((a, b) => b.netto - a.netto);
  const prognoza = tickers.filter(t => t.trzymane).reduce((a, t) => a + t.netto, 0);
  const nextMonths = months.map(m => { const [y, mm] = m.split('-').map(Number); return `${y + 1}-${String(mm).padStart(2, '0')}`; });
  const fc = months.map(m => last.filter(d => d.data.slice(0, 7) === m && CV.pozycje.some(p => p.ticker === d.ticker)).reduce((a, d) => a + d.nettoPLN, 0));
  return { months, byMonth, tickers, sum12: byMonth.reduce((a, b) => a + b, 0), prognoza, nextMonths, fc };
}

/* symulator przyszłości (procent składany) */
function simulate(o) {
  const r = Math.pow(1 + o.stopa / 100, 1 / 12) - 1, inf = Math.pow(1 + o.inflacja / 100, 1 / 12);
  let V = o.start, dep = o.wplata, wplacone = o.start; const pts = []; let goalM = null;
  for (let m = 0; m <= o.lata * 12; m++) {
    if (m > 0) { V = V * (1 + r) + dep; wplacone += dep; if (m % 12 === 0) dep *= 1 + o.wzrost / 100; }
    const real = V / Math.pow(inf, m);
    if (goalM === null && o.cel > 0 && real >= o.cel) goalM = m;
    pts.push({ m, V, real, wplacone });
  }
  return { pts, goalM };
}

/* mapa portfela (treemap, algorytm squarified) */
function treemap(items, W, H) {
  items = items.filter(i => i.v > 0).sort((a, b) => b.v - a.v);
  const total = items.reduce((a, i) => a + i.v, 0); if (!total) return [];
  const scale = W * H / total; const out = [];
  const nodes = items.map(i => ({ ...i, a: i.v * scale }));
  let x = 0, y = 0, w = W, h = H;
  const worst = (row, side) => { const s = row.reduce((a, n) => a + n.a, 0), mx = Math.max(...row.map(n => n.a)), mn = Math.min(...row.map(n => n.a)); return Math.max(side * side * mx / (s * s), s * s / (side * side * mn)); };
  let row = [];
  const layout = (row) => {
    const s = row.reduce((a, n) => a + n.a, 0);
    if (w >= h) { const cw = s / h; let cy = y; row.forEach(n => { const ch = n.a / cw; out.push({ ...n, x, y: cy, w: cw, h: ch }); cy += ch; }); x += cw; w -= cw; }
    else { const ch = s / w; let cx = x; row.forEach(n => { const cw = n.a / ch; out.push({ ...n, x: cx, y, w: cw, h: ch }); cx += cw; }); y += ch; h -= ch; }
  };
  for (const n of nodes) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else { layout(row); row = [n]; }
  }
  if (row.length) layout(row);
  return out;
}
