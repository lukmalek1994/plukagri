/* ===================== INTERFEJS ===================== */
const $ = s => document.querySelector(s);
const nf2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nfq = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 6 });
const zl = (v, d = 2) => (v === null || v === undefined || isNaN(v)) ? '–' : (d ? nf2 : nf0).format(v) + ' zł';
const money = (v, cur) => (v === null || isNaN(v)) ? '–' : nf2.format(v) + ' ' + (cur || '');
const pct = v => (v === null || v === undefined || !isFinite(v)) ? '–' : (v * 100).toFixed(2).replace('.', ',') + '%';
const sgn = v => v > 0.0049 ? 'pos' : v < -0.0049 ? 'neg' : '';
const plus = v => (v > 0 ? '+' : '');
let C = null, ROUTE = 'kokpit', PARAM = '', RANGE = 'all', FILT = {};

function toast(msg) { let t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }

/* ---------- historia: dzienny zapis wartości ---------- */
const LS_INTRA = 'portfel_intraday_v1';
function snapshotIntraday() {
  if (!C || C.wartosc <= 0) return;
  const arr = lsGet(LS_INTRA, []), now = new Date(), last = arr[arr.length - 1];
  const w = Math.round(C.wartosc * 100) / 100, k = Math.round(C.kapital * 100) / 100;
  if (last && now - new Date(last.t) < 10 * 60000) { if (last.w === w && last.k === k) return; last.w = w; last.k = k; last.t = now.toISOString(); }
  else arr.push({ t: now.toISOString(), w, k });
  const cut = Date.now() - 3 * 864e5; lsSet(LS_INTRA, arr.filter(p => new Date(p.t).getTime() > cut));
}
function snapshot() {
  snapshotIntraday();
  if (!C || C.wartosc <= 0) return;
  const d = todayStr(), last = S.historia[S.historia.length - 1];
  const rec = { data: d, wartosc: Math.round(C.wartosc * 100) / 100, kapital: Math.round(C.kapital * 100) / 100 };
  if (last && last.data === d) { if (Math.abs(num(last.wartosc) - rec.wartosc) < 0.01 && Math.abs(num(last.kapital) - rec.kapital) < 0.01) return; Object.assign(last, rec); }
  else S.historia.push(rec);
  S.historia.sort((a, b) => String(a.data).localeCompare(String(b.data)));
  changed('historia');
}

/* ---------- nawigacja ---------- */
function go(route, param = '') { location.hash = param ? `${route}/${encodeURIComponent(param)}` : route; }
window.addEventListener('hashchange', () => { readHash(); render(); $('aside').classList.remove('open'); });
function readHash() { const h = decodeURIComponent(location.hash.slice(1) || 'kokpit'); const i = h.indexOf('/'); ROUTE = i < 0 ? h : h.slice(0, i); PARAM = i < 0 ? '' : h.slice(i + 1); }

function renderNav() {
  const it = (r, ic, label, p = '') => `<a class="${ROUTE === r && PARAM === p ? 'on' : ''}" onclick="go('${r}','${esc(p).replace(/'/g, "\\'")}')"><span class="ic">${ic}</span>${esc(label)}</a>`;
  const st = S.strategie.map(s => `<a class="${ROUTE === 'strategia' && PARAM === s.id ? 'on' : ''}" onclick="go('strategia','${s.id}')"><span class="dot" style="background:${esc(s.kolor || '#1565c0')}"></span>${esc(s.nazwa)}</a>`).join('');
  $('#nav').innerHTML = `
    ${it('kokpit', '◧', 'Kokpit')}${it('portfel', '▤', 'Portfel – pozycje')}
    <div class="nav-h">Strategie</div>${st}<a class="add" onclick="editStrategia()"><span class="ic">＋</span>Dodaj strategię</a>
    <div class="nav-h">Konta</div>${S.konta.map(k => `<a class="${ROUTE === 'konto' && PARAM === k.id ? 'on' : ''}" onclick="go('konto','${k.id}')"><span class="ic">${KICON[k.typ] || '▣'}</span>${esc(k.nazwa)}</a>`).join('')}<a class="add" onclick="editKonto()"><span class="ic">＋</span>Dodaj konto</a>
    <div class="nav-h">Operacje</div>${it('transakcje', '⇄', 'Transakcje')}${it('dywidendy', '◎', 'Dywidendy i odsetki')}${it('wplaty', '↧', 'Wpłaty i wypłaty')}
    <div class="nav-h">Analiza</div>${it('podatki', '§', 'Podatki PIT-38')}${it('inflacja', '↗', 'Inflacja')}
    <div class="nav-h">Konfiguracja</div>${it('instrumenty', '◇', 'Instrumenty i ceny')}${it('ustawienia', '⚙', 'Ustawienia i Google')}`;
}
const KICON = { 'Opodatkowane': '▣', 'IKE': '◈', 'IKZE': '◈', 'Poza PIT-38': '◇' };
function renderSyncBadge() {
  const b = $('#sync'); if (!b) return;
  b.className = 'badge ' + SYNC.state; b.innerHTML = `<i></i>${esc(SYNC.msg)}`;
}

function render() {
  C = calc(S);
  renderNav(); renderSyncBadge();
  const V = { kokpit: vKokpit, portfel: vPortfel, strategia: vStrategia, konto: vKonto, transakcje: vTransakcje, dywidendy: vDywidendy, wplaty: vWplaty,
    podatki: vPodatki, inflacja: vInflacja, instrumenty: vInstrumenty, ustawienia: vUstawienia }[ROUTE] || vKokpit;
  const [title, sub, body, actions] = V();
  $('#title').innerHTML = `${esc(title)}<small>${sub || ''}</small>`;
  $('#topActions').innerHTML = actions || `<button class="btn" onclick="editTransakcja()">＋ Transakcja</button>`;
  $('#view').innerHTML = body;
}

/* ---------- elementy ---------- */
const kpi = (l, v, s = '', cls = '') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
function table(cols, rows, opts = {}) {
  if (!rows.length) return `<div class="empty">${opts.empty || 'Brak danych'}</div>`;
  const th = cols.map(c => `<th class="${c.n ? 'n' : ''}">${c.h}</th>`).join('');
  const tr = rows.map(r => `<tr class="${opts.click ? 'click' : ''}" ${opts.click ? `onclick="${opts.click(r)}"` : ''}>${cols.map(c => `<td class="${c.n ? 'n' : ''} ${c.cls ? c.cls(r) : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('');
  const foot = opts.foot ? `<tr>${opts.foot.map((f, i) => `<td class="${cols[i] && cols[i].n ? 'n' : ''}"><b>${f ?? ''}</b></td>`).join('')}</tr>` : '';
  return `<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>${tr}${foot}</tbody></table></div>`;
}
const pl = v => `<span class="${sgn(v)}">${plus(v)}${zl(v)}</span>`;
const pp = v => `<span class="${sgn(v)}">${plus(v)}${pct(v)}</span>`;
function warningsBox() {
  const w = [...C.warnings];
  const noPrice = [...new Set(C.pozycje.filter(p => p.brakCeny).map(p => p.ticker))];
  if (noPrice.length) w.push(`Brak ceny dla: <b>${noPrice.map(esc).join(', ')}</b> – uzupełnij w <a onclick="go('instrumenty')">Instrumenty i ceny</a>.`);
  const needFx = C.pozycje.some(p => p.waluta !== 'PLN') && !num(S.ustawienia.kursy.USD);
  if (needFx) w.push(`Brak bieżących kursów walut – <a onclick="pobierzKursy()">pobierz z NBP</a> lub wpisz w Ustawieniach.`);
  return w.length ? `<div class="alert">⚠ ${w.join('<br>⚠ ')}</div>` : '';
}
function histSeries() {
  if (RANGE === '1d') {
    const from = Date.now() - 864e5;
    let h = lsGet(LS_INTRA, []).filter(p => new Date(p.t).getTime() >= from).map(p => ({ d: localIso(p.t), w: p.w, k: p.k }));
    if (h.length < 2) { const d = S.historia.filter(x => x.data && has(x.wartosc)).slice(-2).map(x => ({ d: String(x.data).slice(0, 10), w: num(x.wartosc), k: num(x.kapital) })); if (d.length === 2) h = d; }
    return h;
  }
  let h = S.historia.filter(x => x.data && has(x.wartosc)).map(x => ({ d: String(x.data).slice(0, 10), w: num(x.wartosc), k: num(x.kapital) }));
  if (RANGE !== 'all' && h.length) { const days = { '1w': 7, '1m': 31, '3m': 92, '1r': 366, 'ytd': 0 }[RANGE];
    const from = RANGE === 'ytd' ? new Date().getFullYear() + '-01-01' : new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    h = h.filter(x => x.d >= from); }
  return h;
}
const localIso = t => { const d = new Date(t); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
function emptyMsg() { return { '1d': 'Wykres dzienny pojawi się po kilku aktualizacjach w ciągu dnia (otwórz aplikację ponownie za jakiś czas)', '1w': 'Wykres tygodniowy pojawi się po co najmniej dwóch dniach zapisów' }[RANGE] || 'Wykres pojawi się po kilku dniach zapisów historii'; }
function rangeSeg() { return `<div class="seg">${[['1d', '1D'], ['1w', '1T'], ['1m', '1M'], ['3m', '3M'], ['ytd', 'YTD'], ['1r', '1R'], ['all', 'Całość']].map(([k, l]) => `<button class="${RANGE === k ? 'on' : ''}" onclick="RANGE='${k}';render()">${l}</button>`).join('')}</div>`; }

/* ===================== WIDOKI ===================== */
function vKokpit() {
  const rok = new Date().getFullYear();
  const dywRok = C.dyw.filter(d => d.rok === rok);
  const dywRokNetto = dywRok.reduce((a, d) => a + d.nettoPLN, 0);
  const prev = S.historia.filter(h => String(h.data) < todayStr()).slice(-1)[0];
  const zmiana = prev ? C.wartosc - num(prev.wartosc) - (C.kapital - num(prev.kapital)) : null;
  const h = histSeries();
  const kursUsd = C.rateNow('USD');
  const kp = `<div class="kpis">
    ${kpi('Wartość portfela', zl(C.wartosc, 0), C.usd ? `≈ ${nf0.format(C.usd)} USD` : '', 'main')}
    ${kpi('Zysk / strata', pl(C.zysk), pp(C.zyskPct) + ' od wpłat')}
    ${kpi('Zysk realny (po inflacji)', pl(C.zyskRealny), pp(C.zyskRealnyPct) + (C.inflLast ? ` · inflacja PL do ${C.inflLast}` : ' · pobieram inflację…'))}
    ${kpi('Wpłacony kapitał', zl(C.kapital, 0), `po inflacji: ${zl(C.kapitalRealny, 0)}`)}
    ${kpi('Dywidendy ' + rok, zl(dywRokNetto), 'netto, ' + dywRok.length + ' wypłat')}
    ${kpi('Zmiana od ostatniego zapisu', zmiana === null ? '–' : pl(zmiana), prev ? 'vs ' + prev.data + ' (bez wpłat)' : 'historia zapisuje się codziennie')}
  </div>`;
  const short = ['1d', '1w', '1m'].includes(RANGE);
  const line = lineChart([
    { name: 'Wartość portfela', points: h.map(x => [x.d, x.w]) },
    ...(short ? [] : [{ name: 'Wpłacony kapitał', points: h.map(x => [x.d, x.k]), color: '#94a3b8', dash: true },
    { name: 'Kapitał po inflacji', points: h.map(x => [x.d, C.kapitalRealnyNa(x.d.slice(0, 10))]), color: '#F9A825', dash: true }]),
  ], { area: true, empty: emptyMsg(), zero: !['1d', '1w', '1m'].includes(RANGE) });
  const ret = lineChart([
    { name: 'Stopa zwrotu', points: h.filter(x => x.k).map(x => [x.d, (x.w - x.k) / x.k]) },
    { name: 'Realna (po inflacji)', points: h.filter(x => x.k).map(x => { const kr = C.kapitalRealnyNa(x.d.slice(0, 10)); return [x.d, kr ? (x.w - kr) / kr : 0]; }), color: '#7E57C2' },
  ], { pct: true, h: 200, empty: emptyMsg() });
  const klasy = donut(Object.entries(C.klasy), { center: [nf0.format(C.wartosc / 1000) + ' tys.', 'PLN'], empty: 'Dodaj pierwszą transakcję' });
  const waluty = donut(Object.entries(C.waluty), { empty: 'Brak pozycji' });
  const strat = C.strategie.filter(s => s.wartosc || s.zrealizowany || s.dywidendyNetto);
  const stratTbl = table([
    { h: 'Strategia', f: s => `<span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(s.kolor)};margin-right:7px"></span>${esc(s.nazwa)}` },
    { h: 'Wartość', n: 1, f: s => zl(s.wartosc, 0) },
    { h: 'Udział', f: s => `<div class="bar"><i style="width:${(s.udzial * 100).toFixed(1)}%;background:${esc(s.kolor)}"></i></div>` },
    { h: 'Wynik', n: 1, f: s => pl(s.wynik) }, { h: '%', n: 1, f: s => pp(s.koszt ? s.wynik / s.koszt : 0) },
  ], strat, { empty: 'Brak pozycji w strategiach', click: s => `go('strategia','${s.id}')` });
  const nowa = num(CFG.nowaWplata);
  const rozd = C.rozdziel(nowa);
  const model = table([
    { h: 'Koszyk', f: m => `<b>${esc(m.koszyk)}</b> <span class="mut">${esc(m.grupa || '')}</span>` },
    { h: 'Cel', n: 1, f: m => pct(m.celPct) }, { h: 'Teraz', n: 1, f: m => pct(m.udzial) },
    { h: '', f: m => `<div class="bar" style="position:relative"><i style="width:${Math.min(100, m.udzial * 100).toFixed(1)}%;background:#1565c0"></i><b style="position:absolute;top:-3px;left:${Math.min(99, m.celPct * 100)}%;width:2px;height:12px;background:#0f172a"></b></div>` },
    { h: 'Różnica', n: 1, f: m => Math.abs(m.roznica) < 1 ? '<span class="mut">–</span>' : `<span class="${m.roznica > 0 ? 'pos' : 'neg'}">${m.roznica > 0 ? 'dokup ' : 'nadwyżka '}${zl(Math.abs(m.roznica), 0)}</span>` },
    { h: 'Z nowej wpłaty', n: 1, f: (m) => nowa ? zl(rozd[C.model.indexOf(m)], 0) : '–' },
  ], C.model, { empty: 'Ustaw alokację docelową w Ustawieniach' });
  const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  const dm = months.map((_, i) => dywRok.filter(d => +d.data.slice(5, 7) === i + 1).reduce((a, d) => a + d.nettoPLN, 0));
  const top = C.pozycje.slice().sort((a, b) => b.wartoscPLN - a.wartoscPLN).slice(0, 8);
  const topTbl = table([
    { h: 'Instrument', f: p => `<b>${esc(p.ticker)}</b> <span class="mut">${esc(p.strategia)}</span>` },
    { h: 'Wartość', n: 1, f: p => zl(p.wartoscPLN, 0) }, { h: 'Udział', n: 1, f: p => pct(C.wartosc ? p.wartoscPLN / C.wartosc : 0) },
    { h: 'Zysk', n: 1, f: p => pl(p.zyskPLN) }, { h: '%', n: 1, f: p => pp(p.kosztPLN ? p.zyskPLN / p.kosztPLN : 0) },
  ], top, { empty: 'Brak otwartych pozycji', click: p => `go('portfel')` });
  const sub = `Stan na ${new Date().toLocaleDateString('pl-PL')}${kursUsd ? ' · USD/PLN ' + kursUsd.toFixed(4).replace('.', ',') : ''}${S.ustawienia.kursyData ? ' (NBP ' + S.ustawienia.kursyData + ')' : ''}`;
  const intro = !S.transakcje.length ? `<div class="alert info">👋 Zacznij od <a onclick="go('ustawienia')">Ustawień</a> (konta, połączenie z Google), potem dodaj <a onclick="editTransakcja()">pierwszą transakcję</a>. Ceny aktualizujesz w <a onclick="go('instrumenty')">Instrumentach</a>.</div>` : '';
  return ['Kokpit', sub, intro + warningsBox() + kp + `
    <div class="grid g2"><div class="card"><h3>Wartość portfela w czasie<span class="sp"></span>${rangeSeg()}</h3>${line}</div>
      <div class="card"><h3>Struktura – klasy aktywów</h3>${klasy}</div></div>
    <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Stopa zwrotu: nominalna i realna<span class="sp"></span>${rangeSeg()}</h3>${ret}</div>
      <div class="card"><h3>Ekspozycja walutowa</h3>${waluty}</div></div>
    <div class="card" style="margin-top:16px"><h3>Konta<span class="sp"></span><button class="btn sm ghost" onclick="editKonto()">＋ Konto</button></h3>${table([
      { h: 'Konto', f: k => `<b>${esc(k.nazwa)}</b>` }, { h: 'Typ', f: k => `<span class="tag">${esc(k.typ)}</span>` },
      { h: 'Pozycje', n: 1, f: k => zl(k.wartoscPozycji, 0) }, { h: 'Gotówka', n: 1, f: k => zl(k.gotowkaPLN, 0) }, { h: 'Razem', n: 1, f: k => `<b>${zl(k.razem, 0)}</b>` },
      { h: 'Udział', f: k => `<div class="bar"><i style="width:${C.wartosc ? (k.razem / C.wartosc * 100).toFixed(1) : 0}%;background:#1565c0"></i></div>` },
      { h: 'Wpłacono', n: 1, f: k => zl(k.kapital, 0) }, { h: 'Zysk', n: 1, f: k => k.zysk === null ? '–' : pl(k.zysk) }, { h: '%', n: 1, f: k => k.zyskPct === null ? '–' : pp(k.zyskPct) },
    ], C.konta, { click: k => `go('konto','${k.id}')` })}</div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Strategie<span class="sp"></span><small>kliknij, aby otworzyć</small></h3>${stratTbl}</div>
      <div class="card"><h3>Portfel 2.1 – rebalansing<span class="sp"></span><small>nowa wpłata</small><input class="cell" type="number" value="${nowa || ''}" placeholder="0 zł" onchange="CFG.nowaWplata=this.value;saveCfg();render()"></h3>${model}
        ${C.poza ? `<div class="mut" style="font-size:12.5px;margin-top:8px">Poza modelem: ${zl(C.poza, 0)} · gotówka: ${zl(C.gotowkaPLN, 0)}</div>` : ''}</div></div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Dywidendy i odsetki ${rok} <small>netto PLN</small></h3>${barChart(months, [{ name: 'Netto', values: dm, color: '#26A69A' }], { empty: 'Brak dywidend w tym roku', h: 200 })}</div>
      <div class="card"><h3>Największe pozycje</h3>${topTbl}</div></div>`];
}

function vPortfel() {
  const f = FILT.portfel || (FILT.portfel = { s: '', k: '', c: '' });
  let rows = C.pozycje.filter(p => (!f.s || p.strategia === f.s) && (!f.k || p.konto === f.k) && (!f.c || p.klasa === f.c)).sort((a, b) => b.wartoscPLN - a.wartoscPLN);
  const sel = (key, label, opts) => `<select onchange="FILT.portfel.${key}=this.value;render()"><option value="">${label}</option>${opts.map(o => `<option ${f[key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const tot = rows.reduce((a, p) => ({ w: a.w + p.wartoscPLN, k: a.k + p.kosztPLN }), { w: 0, k: 0 });
  const cols = [
    { h: 'Instrument', f: p => `<b>${esc(p.ticker)}</b><br><span class="mut" style="font-size:12px">${esc(p.nazwa)}</span>` },
    { h: 'Strategia', f: p => esc(p.strategia) }, { h: 'Konto', f: p => esc(p.konto) },
    { h: 'Ilość', n: 1, f: p => nfq.format(p.ilosc) }, { h: 'Śr. cena', n: 1, f: p => money(p.sredniaCena, p.waluta) },
    { h: 'Cena', n: 1, f: p => p.brakCeny ? '<span class="warn">brak</span>' : money(p.cena, p.waluta) },
    { h: 'Wartość', n: 1, f: p => money(p.wartosc, p.waluta) }, { h: 'Wartość PLN', n: 1, f: p => zl(p.wartoscPLN) },
    { h: 'Zysk (waluta)', n: 1, f: p => `<span class="${sgn(p.zysk)}">${plus(p.zysk)}${money(p.zysk, p.waluta)}</span><br>${pp(p.zyskPct)}` },
    { h: 'Zysk PLN', n: 1, f: p => pl(p.zyskPLN) }, { h: 'Udział', n: 1, f: p => pct(C.wartosc ? p.wartoscPLN / C.wartosc : 0) },
  ];
  return ['Portfel – pozycje', `${rows.length} otwartych pozycji`, `
    <div class="filters">${sel('s', 'Wszystkie strategie', S.strategie.map(s => s.nazwa))}${sel('k', 'Wszystkie konta', S.konta.map(k => k.nazwa))}${sel('c', 'Wszystkie klasy', [...new Set(C.pozycje.map(p => p.klasa))])}</div>
    <div class="kpis">${kpi('Wartość', zl(tot.w, 0))}${kpi('Koszt zakupu', zl(tot.k, 0))}${kpi('Zysk niezrealizowany', pl(tot.w - tot.k), pp(tot.k ? (tot.w - tot.k) / tot.k : 0))}</div>
    <div class="card">${table(cols, rows, { empty: 'Brak otwartych pozycji' })}</div>`];
}

function vStrategia() {
  const s = C.strategie.find(x => x.id === PARAM); if (!s) return ['Strategia', '', '<div class="empty">Nie znaleziono strategii</div>'];
  const poz = s.pozycje.slice().sort((a, b) => b.wartoscPLN - a.wartoscPLN);
  const struktura = donut(poz.map(p => [p.ticker, p.wartoscPLN]), { empty: 'Brak otwartych pozycji', center: [nf0.format(s.wartosc / 1000) + ' tys.', 'PLN'] });
  const txs = S.transakcje.filter(t => t.strategia === s.nazwa).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const wynikPct = s.koszt ? s.wynik / s.koszt : 0;
  const pozTbl = table([
    { h: 'Instrument', f: p => `<b>${esc(p.ticker)}</b> <span class="mut">${esc(p.nazwa)}</span>` },
    { h: 'Od', f: p => esc(p.od) }, { h: 'Ilość', n: 1, f: p => nfq.format(p.ilosc) },
    { h: 'Śr. cena', n: 1, f: p => money(p.sredniaCena, p.waluta) }, { h: 'Cena', n: 1, f: p => p.brakCeny ? '<span class="warn">brak</span>' : money(p.cena, p.waluta) },
    { h: 'Wartość PLN', n: 1, f: p => zl(p.wartoscPLN) }, { h: 'Zysk', n: 1, f: p => `<span class="${sgn(p.zysk)}">${plus(p.zysk)}${money(p.zysk, p.waluta)}</span>` },
    { h: '%', n: 1, f: p => pp(p.zyskPct) }, { h: 'Zysk PLN', n: 1, f: p => pl(p.zyskPLN) },
  ], poz, { empty: 'Brak otwartych pozycji – dodaj transakcję kupna' });
  const zamTbl = table([
    { h: 'Sprzedaż', f: r => esc(r.data) }, { h: 'Instrument', f: r => `<b>${esc(r.ticker)}</b>` }, { h: 'Ilość', n: 1, f: r => nfq.format(r.ilosc) },
    { h: 'Koszt', n: 1, f: r => money(r.koszt, r.waluta) }, { h: 'Przychód', n: 1, f: r => money(r.przychod, r.waluta) },
    { h: 'Zysk', n: 1, f: r => `<span class="${sgn(r.zysk)}">${plus(r.zysk)}${money(r.zysk, r.waluta)}</span>` },
    { h: 'Zysk PLN', n: 1, f: r => pl(r.zyskPLN) },
  ], s.zamkniete.slice().reverse(), { empty: 'Brak zamkniętych pozycji' });
  const dywTbl = table([
    { h: 'Data', f: d => esc(d.data) }, { h: 'Ticker', f: d => esc(d.ticker) }, { h: 'Brutto', n: 1, f: d => money(num(d.brutto), d.waluta) },
    { h: 'Netto PLN', n: 1, f: d => zl(d.nettoPLN) }, { h: '', f: d => `<a onclick="editDywidenda('${d.id}')">edytuj</a>` },
  ], s.dywidendy.slice().reverse(), { empty: 'Brak dywidend' });
  const txTbl = table(txCols(), txs.slice(0, 50), { empty: 'Brak transakcji' });
  return [s.nazwa, `${esc(s.konto)} · ${esc(s.typ)}${s.opis ? ' · ' + esc(s.opis) : ''}`, `
    <div class="kpis">${kpi('Wartość', zl(s.wartosc, 0), pct(s.udzial) + ' portfela', 'main')}${kpi('Zysk niezrealizowany', pl(s.niezreal), pp(s.niezrealPct))}
      ${kpi('Zysk zrealizowany', pl(s.zrealizowany), s.zamkniete.length + ' sprzedaży')}${kpi('Dywidendy netto', zl(s.dywidendyNetto), s.dywidendy.length + ' wypłat')}
      ${kpi('Wynik łączny', pl(s.wynik), pp(wynikPct) + ' od kosztu')}${s.wolne !== null ? kpi('Wolne środki', money(s.wolne, s.walutaKonta), 'z kapitału ' + money(num(s.kapital), s.walutaKonta)) : ''}</div>
    <div class="grid g2"><div class="card"><h3>Otwarte pozycje</h3>${pozTbl}</div><div class="card"><h3>Struktura strategii</h3>${struktura}</div></div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Zamknięte pozycje</h3>${zamTbl}</div>
      <div class="card"><h3>Dywidendy<span class="sp"></span><button class="btn sm ghost" onclick="editDywidenda(null,'${esc(s.nazwa)}')">＋ Dywidenda</button></h3>${dywTbl}</div></div>
    <div class="card" style="margin-top:16px"><h3>Transakcje strategii</h3>${txTbl}</div>`,
    `<button class="btn ghost" onclick="editStrategia('${s.id}')">Edytuj strategię</button><button class="btn" onclick="editTransakcja(null,'${esc(s.nazwa)}')">＋ Transakcja</button>`];
}

function vKonto() {
  const k = C.konta.find(x => x.id === PARAM); if (!k) return ['Konto', '', '<div class="empty">Nie znaleziono konta</div>'];
  const strat = C.strategie.filter(s => s.konto === k.nazwa);
  const poz = C.pozycje.filter(p => p.konto === k.nazwa).sort((a, b) => b.wartoscPLN - a.wartoscPLN);
  const wpl = S.wplaty.filter(w => w.konto === k.nazwa).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const opis = { 'Opodatkowane': 'wchodzi do PIT-38', 'IKE': 'bez podatku Belki (IKE)', 'IKZE': 'bez podatku Belki (IKZE)', 'Poza PIT-38': 'nie wchodzi do PIT-38' }[k.typ] || '';
  const struktura = donut(poz.map(p => [p.ticker, p.wartoscPLN]).concat(k.gotowkaPLN ? [['Gotówka', k.gotowkaPLN]] : []), { empty: 'Brak pozycji na tym koncie', center: [nf0.format(k.razem / 1000) + ' tys.', 'PLN'] });
  return [k.nazwa, `${esc(k.typ)} · ${esc(opis)} · waluta ${esc(k.waluta)}`, `
    <div class="kpis">${kpi('Wartość konta', zl(k.razem, 0), C.wartosc ? pct(k.razem / C.wartosc) + ' portfela' : '', 'main')}
      ${kpi('Pozycje', zl(k.wartoscPozycji, 0), poz.length + ' otwartych')}
      ${kpi('Gotówka u brokera', `<input class="cell" style="width:120px;font-size:16px" type="number" step="any" value="${esc(k.gotowka)}" placeholder="0" onchange="setGotowka('${k.id}',this.value)"> <span style="font-size:14px">${esc(k.waluta)}</span>`, k.waluta !== 'PLN' ? '≈ ' + zl(k.gotowkaPLN, 0) : 'wpisz saldo z brokera')}
      ${kpi('Wpłacony kapitał', zl(k.kapital, 0), wpl.length + ' wpłat')}
      ${kpi('Zysk / strata', k.zysk === null ? '–' : pl(k.zysk), k.zyskPct === null ? 'dodaj wpłaty, aby policzyć' : pp(k.zyskPct))}</div>
    <div class="grid g2"><div class="card"><h3>Strategie na tym koncie<span class="sp"></span><button class="btn sm ghost" onclick="editStrategiaNaKoncie('${esc(k.nazwa)}')">＋ Strategia</button></h3>${table([
      { h: 'Strategia', f: s => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(s.kolor)};margin-right:7px"></span>${esc(s.nazwa)}` },
      { h: 'Wartość', n: 1, f: s => zl(s.wartosc, 0) }, { h: 'Wynik', n: 1, f: s => pl(s.wynik) }, { h: '%', n: 1, f: s => pp(s.koszt ? s.wynik / s.koszt : 0) },
    ], strat, { empty: 'Żadna strategia nie jest przypisana do tego konta', click: s => `go('strategia','${s.id}')` })}</div>
      <div class="card"><h3>Struktura konta</h3>${struktura}</div></div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Pozycje</h3>${table([
      { h: 'Instrument', f: p => `<b>${esc(p.ticker)}</b> <span class="mut">${esc(p.strategia)}</span>` }, { h: 'Ilość', n: 1, f: p => nfq.format(p.ilosc) },
      { h: 'Wartość PLN', n: 1, f: p => zl(p.wartoscPLN) }, { h: 'Zysk PLN', n: 1, f: p => pl(p.zyskPLN) },
    ], poz, { empty: 'Brak otwartych pozycji' })}</div>
      <div class="card"><h3>Wpłaty i wypłaty<span class="sp"></span><button class="btn sm ghost" onclick="editWplata(null,'${esc(k.nazwa)}')">＋ Wpłata</button></h3>${table([
      { h: 'Data', f: w => esc(w.data) }, { h: 'Kwota PLN', n: 1, f: w => pl(num(w.kwotaPLN)) },
      { h: 'W walucie konta', n: 1, f: w => has(w.kwotaWal) ? nf2.format(num(w.kwotaWal)) : '–' }, { h: 'Notatka', f: w => esc(w.notatka) },
    ], wpl, { empty: 'Brak wpłat na to konto', click: w => `editWplata('${w.id}')` })}</div></div>`,
    `<button class="btn ghost" onclick="editKonto('${k.id}')">Edytuj / usuń konto</button><button class="btn" onclick="editWplata(null,'${esc(k.nazwa)}')">＋ Wpłata</button>`];
}
function setGotowka(id, v) { const k = S.konta.find(x => x.id === id); k.gotowka = v === '' ? '' : num(v); changed('konta'); render(); }
function editStrategiaNaKoncie(konto) { editStrategia(null, konto); }

function txCols() {
  return [
    { h: 'Data', f: t => esc(t.data) }, { h: 'Typ', f: t => `<span class="tag ${t.typ === 'KUPNO' ? 'buy' : 'sell'}">${esc(t.typ)}</span>` },
    { h: 'Strategia', f: t => esc(t.strategia) }, { h: 'Ticker', f: t => `<b>${esc(t.ticker)}</b>` },
    { h: 'Ilość', n: 1, f: t => nfq.format(num(t.ilosc)) }, { h: 'Cena', n: 1, f: t => nf2.format(num(t.cena)) },
    { h: 'Prowizja', n: 1, f: t => num(t.prowizja) ? nf2.format(num(t.prowizja)) : '–' },
    { h: 'Wartość', n: 1, f: t => nf2.format(num(t.ilosc) * num(t.cena)) },
    { h: 'Kurs NBP', n: 1, f: t => has(t.kurs) ? num(t.kurs).toFixed(4) : (((S.instrumenty.find(i => i.ticker === t.ticker) || {}).waluta || 'USD') === 'PLN' ? '–' : '<span class="warn">brak</span>') },
    { h: '', f: t => `<a onclick="event.stopPropagation();editTransakcja('${t.id}')">edytuj</a>` },
  ];
}
function vTransakcje() {
  const f = FILT.tx || (FILT.tx = { s: '', t: '', r: '' });
  const rows = S.transakcje.filter(t => (!f.s || t.strategia === f.s) && (!f.t || t.typ === f.t) && (!f.r || String(t.data).startsWith(f.r)))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const lata = [...new Set(S.transakcje.map(t => String(t.data).slice(0, 4)))].sort().reverse();
  const sel = (key, label, opts) => `<select onchange="FILT.tx.${key}=this.value;render()"><option value="">${label}</option>${opts.map(o => `<option ${f[key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  return ['Transakcje', `${rows.length} z ${S.transakcje.length}`, `
    <div class="filters">${sel('s', 'Wszystkie strategie', S.strategie.map(s => s.nazwa))}${sel('t', 'Kupno i sprzedaż', ['KUPNO', 'SPRZEDAŻ'])}${sel('r', 'Wszystkie lata', lata)}</div>
    <div class="card">${table(txCols(), rows, { empty: 'Brak transakcji – kliknij „＋ Transakcja”', click: t => `editTransakcja('${t.id}')` })}</div>`];
}

function vDywidendy() {
  const rows = C.dyw.slice().sort((a, b) => b.data.localeCompare(a.data));
  const byYear = {}; C.dyw.forEach(d => byYear[d.rok] = (byYear[d.rok] || 0) + d.nettoPLN);
  const years = Object.keys(byYear).sort();
  return ['Dywidendy i odsetki', 'Kwoty w walucie instrumentu, przeliczone kursem NBP z dnia przed wypłatą', `
    <div class="grid g2e"><div class="card"><h3>Netto PLN wg lat</h3>${barChart(years, [{ name: 'Netto', values: years.map(y => byYear[y]), color: '#26A69A' }], { empty: 'Brak dywidend', h: 190 })}</div>
    <div class="kpis" style="align-content:start">${kpi('Łącznie netto', zl(C.dywNetto))}${kpi('Liczba wypłat', rows.length)}${kpi('Do dopłaty w PL (' + new Date().getFullYear() + ')', zl(C.dyw.filter(d => d.rok === new Date().getFullYear()).reduce((a, d) => a + d.doplata, 0)))}</div></div>
    <div class="card" style="margin-top:16px">${table([
      { h: 'Data', f: d => esc(d.data) }, { h: 'Strategia', f: d => esc(d.strategia) }, { h: 'Ticker', f: d => `<b>${esc(d.ticker)}</b>` },
      { h: 'Brutto', n: 1, f: d => money(num(d.brutto), d.waluta) }, { h: 'Podatek u źródła', n: 1, f: d => money(num(d.podatek), d.waluta) },
      { h: 'Kurs', n: 1, f: d => d.waluta === 'PLN' ? '–' : (has(d.kurs) ? num(d.kurs).toFixed(4) : '<span class="warn">brak</span>') },
      { h: 'Netto PLN', n: 1, f: d => zl(d.nettoPLN) }, { h: 'Dopłata PL', n: 1, f: d => d.doplata ? zl(d.doplata) : '–' },
    ], rows, { empty: 'Brak dywidend – kliknij „＋ Dywidenda”', click: d => `editDywidenda('${d.id}')` })}</div>`,
    `<button class="btn" onclick="editDywidenda()">＋ Dywidenda</button>`];
}

function vWplaty() {
  const rows = S.wplaty.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  let acc = 0; const cum = S.wplaty.slice().filter(w => w.data).sort((a, b) => String(a.data).localeCompare(String(b.data))).map(w => [String(w.data), acc += num(w.kwotaPLN)]);
  return ['Wpłaty i wypłaty', 'Wypłatę wpisz jako kwotę ujemną', `
    <div class="grid g2"><div class="card"><h3>Wpłacony kapitał narastająco</h3>${lineChart([{ name: 'Kapitał', points: cum }], { area: true, empty: 'Dodaj co najmniej dwie wpłaty' })}</div>
    <div class="kpis" style="align-content:start;grid-template-columns:1fr">${kpi('Wpłacony kapitał', zl(C.kapital))}${kpi('W dzisiejszych złotych (po inflacji)', zl(C.kapitalRealny))}</div></div>
    <div class="card" style="margin-top:16px">${table([
      { h: 'Data', f: w => esc(w.data) }, { h: 'Konto', f: w => esc(w.konto) }, { h: 'Kwota PLN', n: 1, f: w => pl(num(w.kwotaPLN)) },
      { h: 'Kwota w walucie konta', n: 1, f: w => has(w.kwotaWal) ? nf2.format(num(w.kwotaWal)) : '–' }, { h: 'Notatka', f: w => esc(w.notatka) },
    ], rows, { empty: 'Brak wpłat', click: w => `editWplata('${w.id}')` })}</div>`,
    `<button class="btn" onclick="editWplata()">＋ Wpłata</button>`];
}

function vPodatki() {
  const rok = +(FILT.rok || new Date().getFullYear());
  const P = C.podatki(rok, num(CFG.strataPrev[rok]), num(CFG.kryptoPrev[rok]));
  const opts = C.lata.map(y => `<option ${y === rok ? 'selected' : ''}>${y}</option>`).join('');
  const line = (l, v, b) => `<tr><td>${b ? '<b>' + l + '</b>' : l}</td><td class="n">${b ? '<b>' + v + '</b>' : v}</td></tr>`;
  return ['Podatki – PIT-38', 'Konta „Opodatkowane”; FIFO w ramach rachunku; kursy NBP z dnia przed transakcją', `
    <div class="filters"><select onchange="FILT.rok=this.value;render()">${opts}</select></div>
    ${P.brakKursow ? '<div class="alert">⚠ Część transakcji nie ma kursu NBP – użyto bieżącego kursu. Uzupełnij kursy, aby wynik był zgodny z PIT-38.</div>' : ''}
    <div class="kpis">${kpi('Podatek do zapłaty', zl(P.razem, 0), 'za rok ' + rok, 'main')}${kpi('Dochód z papierów', pl(P.dochod))}${kpi('Dopłata od dywidend', zl(P.dywDoplata, 0))}${kpi('Podatek od krypto', zl(P.kPodatek, 0))}</div>
    <div class="grid g3">
      <div class="card"><h3>Papiery wartościowe</h3><table>${line('Przychód', zl(P.przychod))}${line('Koszty uzyskania', zl(P.koszty))}${line('Dochód / strata', zl(P.dochod))}
        <tr><td>Strata z lat ubiegłych</td><td class="n"><input class="cell" type="number" value="${CFG.strataPrev[rok] || ''}" onchange="CFG.strataPrev[${rok}]=this.value;saveCfg();render()"></td></tr>
        ${line('Podstawa opodatkowania', zl(P.podstawa, 0))}${line('Podatek ' + S.ustawienia.stawka + '%', zl(P.podatekPap, 0), 1)}</table></div>
      <div class="card"><h3>Dywidendy zagraniczne</h3><table>${line('Przychód brutto', zl(P.dywBrutto))}${line('Podatek pobrany za granicą', zl(P.dywPobrany))}${line('Do dopłaty w Polsce', zl(P.dywDoplata, 0), 1)}</table>
        <div class="mut" style="font-size:12px;margin-top:8px">USA z W-8BEN: 15% pobrane → dopłacasz 4%.</div></div>
      <div class="card"><h3>Kryptowaluty</h3><table>${line('Przychód', zl(P.kPrzych))}${line('Koszty zakupu w roku', zl(P.kKoszt))}
        <tr><td>Nadwyżka kosztów z lat ubiegłych</td><td class="n"><input class="cell" type="number" value="${CFG.kryptoPrev[rok] || ''}" onchange="CFG.kryptoPrev[${rok}]=this.value;saveCfg();render()"></td></tr>
        ${line('Dochód', zl(P.kDochod))}${line('Nadwyżka na kolejny rok', zl(P.kNadwyzka))}${line('Podatek', zl(P.kPodatek, 0), 1)}</table></div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Sprzedaże w ${rok} (FIFO)</h3>${table([
      { h: 'Data', f: r => esc(r.data) }, { h: 'Instrument', f: r => `<b>${esc(r.ticker)}</b>` }, { h: 'Strategia', f: r => esc(r.strategia) },
      { h: 'Ilość', n: 1, f: r => nfq.format(r.ilosc) }, { h: 'Przychód PLN', n: 1, f: r => zl(r.przychodPLN) }, { h: 'Koszt PLN', n: 1, f: r => zl(r.kosztPLN) },
      { h: 'Dochód PLN', n: 1, f: r => pl(r.zyskPLN) }, { h: '', f: r => r.kursOk ? '' : '<span class="warn">brak kursu</span>' },
    ], P.sprzedaze, { empty: 'Brak sprzedaży w tym roku', foot: ['Razem', '', '', '', zl(P.przychod), zl(P.koszty), zl(P.dochod), ''] })}</div>
    <div class="mut" style="font-size:12px;margin-top:10px">Porównaj z PIT-8C od brokera. To pomoc w rozliczeniu, nie doradztwo podatkowe.</div>`, ' '];
}

function vInflacja() {
  const rows = S.inflacja.slice().sort((a, b) => String(b.miesiac).localeCompare(String(a.miesiac)));
  const asc = rows.slice().reverse();
  const yoy = key => asc.map((r, i) => { if (i < 11) return null; const w = asc.slice(i - 11, i + 1); if (w.some(x => !has(x[key]))) return null;
    return [r.miesiac + '-01', w.reduce((a, x) => a * (1 + num(x[key]) / 100), 1) - 1]; }).filter(Boolean);
  const yPL = yoy('mm'), yUS = yoy('mmUS');
  const lastPL = yPL[yPL.length - 1], lastUS = yUS[yUS.length - 1];
  const yoyMap = (arr) => Object.fromEntries(arr.map(([d, v]) => [d.slice(0, 7), v]));
  const mPL = yoyMap(yPL), mUS = yoyMap(yUS);
  return ['Inflacja', `Pobierana automatycznie raz dziennie z FRED · Polska: Eurostat HICP · USA: BLS CPI-U${CFG.inflDay ? ' · aktualizacja ' + esc(CFG.inflDay) : ''}`, `
    <div class="kpis">${kpi('Inflacja r/r – Polska', lastPL ? pct(lastPL[1]) : '–', lastPL ? lastPL[0].slice(0, 7) : 'brak danych', 'main')}
      ${kpi('Inflacja r/r – USA', lastUS ? pct(lastUS[1]) : '–', lastUS ? lastUS[0].slice(0, 7) : 'brak danych')}
      ${kpi('Wzrost cen w PL od 2015', pct(C.inflNow - 1), C.inflLast ? 'do ' + C.inflLast : '')}
      ${kpi('Zysk realny portfela', pl(C.zyskRealny), pp(C.zyskRealnyPct) + ' ponad inflację PL')}</div>
    <div class="card"><h3>Inflacja r/r: Polska vs USA</h3>${lineChart([{ name: 'Polska', points: yPL, color: '#EF5350' }, { name: 'USA', points: yUS, color: '#1565C0' }], { pct: true, empty: 'Kliknij „Pobierz dane teraz”' })}</div>
    <div style="margin-top:16px"><button class="btn ghost" onclick="FILT.inflTab=!FILT.inflTab;render()">${FILT.inflTab ? '▲ Ukryj dane miesięczne' : '▼ Pokaż dane miesięczne'}</button></div>
    ${!FILT.inflTab ? '' : `<div class="card" style="margin-top:12px"><h3>Dane miesięczne<span class="sp"></span><small>możesz poprawić wartość ręcznie</small></h3>${table([
      { h: 'Miesiąc', f: r => esc(r.miesiac) },
      { h: 'Polska m/m %', n: 1, f: r => `<input class="cell" type="number" step="0.01" value="${esc(r.mm)}" onchange="setInfl('${esc(r.miesiac)}',this.value,'mm')">` },
      { h: 'Polska r/r', n: 1, f: r => mPL[r.miesiac] !== undefined ? pct(mPL[r.miesiac]) : '–' },
      { h: 'USA m/m %', n: 1, f: r => `<input class="cell" type="number" step="0.01" value="${esc(r.mmUS ?? '')}" onchange="setInfl('${esc(r.miesiac)}',this.value,'mmUS')">` },
      { h: 'USA r/r', n: 1, f: r => mUS[r.miesiac] !== undefined ? pct(mUS[r.miesiac]) : '–' },
    ], rows.slice(0, 120), { empty: 'Brak danych – kliknij „Pobierz dane teraz”' })}</div>`}
    <div class="mut" style="font-size:12px;margin-top:10px">Zysk realny liczony jest inflacją polską (portfel wyceniany w PLN). Dla Polski używany jest zharmonizowany wskaźnik HICP z Eurostatu – zwykle różni się od CPI GUS o kilka dziesiątych punktu procentowego. Dane pobierane z FRED (Federal Reserve Bank of St. Louis). Statystyki publikowane są z opóźnieniem ok. 2–6 tygodni, więc ostatni miesiąc zwykle jeszcze nie jest dostępny.</div>`,
    `<button class="btn" onclick="pobierzInflacjeTeraz()">↻ Pobierz dane teraz</button>`];
}
async function pobierzInflacjeTeraz() {
  toast('Pobieram dane o inflacji…');
  try { const r = await pobierzInflacje(false); if (!r) throw new Error('brak danych'); render();
    toast(`Inflacja zaktualizowana${r.pl ? ' · PL do ' + r.pl[0] : ''}${r.us ? ' · USA do ' + r.us[0] : ''}${r.errs.length ? ' · problem: ' + r.errs.join('; ') : ''}`); }
  catch (e) { toast(e.message); }
}
function vInstrumenty() {
  const rows = S.instrumenty;
  return ['Instrumenty i ceny', 'Cena ręczna ma pierwszeństwo przed ceną automatyczną z Google Finance', `
    <div class="alert info">💡 Po połączeniu z Google Sheets ceny liczą się same w arkuszu. Symbol: <b>LON:CSPX</b>, NASDAQ:AAPL, WSE:PKN (Google Finance) albo <b>YAHOO:GC=F</b> złoto, YAHOO:SI=F srebro, YAHOO:BTC-USD, YAHOO:CSPX.L (Yahoo – wymaga skryptu Portfel_Ceny.gs w arkuszu). Wpisz cenę ręcznie, gdy symbol nie działa – zostaw puste, aby używać automatycznej.</div>
    <div class="card">${table([
      { h: 'Ticker', f: i => `<b>${esc(i.ticker)}</b>` }, { h: 'Nazwa', f: i => esc(i.nazwa) }, { h: 'Klasa', f: i => esc(i.klasa) }, { h: 'Koszyk 2.1', f: i => esc(i.koszyk) },
      { h: 'Waluta', f: i => esc(i.waluta) }, { h: 'Symbol', f: i => `<span class="mut">${esc(i.symbol)}</span>` },
      { h: 'Cena auto', n: 1, f: i => has(i.cenaAuto) ? nf2.format(num(i.cenaAuto)) : '<span class="mut">–</span>' },
      { h: 'Cena ręczna', n: 1, f: i => `<input class="cell" type="number" step="any" value="${esc(i.cena)}" onclick="event.stopPropagation()" onchange="setCena('${i.id}',this.value)">` },
      { h: 'Data ceny', f: i => esc(i.dataCeny) },
      { h: 'Ilość w portfelu', n: 1, f: i => { const q = C.pozycje.filter(p => p.ticker === i.ticker).reduce((a, p) => a + p.ilosc, 0); return q ? nfq.format(q) : '–'; } },
      { h: '', f: i => `<a onclick="event.stopPropagation();editInstrument('${i.id}')">edytuj</a>` },
    ], rows, { empty: 'Brak instrumentów' })}</div>`,
    `${SYNC.token ? '<button class="btn ghost" onclick="refreshAutoPrices().then(()=>toast(\'Ceny odświeżone\'))">↻ Ceny z Google</button>' : ''}<button class="btn" onclick="editInstrument()">＋ Instrument</button>`];
}

function vUstawienia() {
  const u = S.ustawienia;
  const g = CFG.sheetId ? `<p>Arkusz: <a href="${esc(CFG.sheetUrl || ('https://docs.google.com/spreadsheets/d/' + CFG.sheetId))}" target="_blank">otwórz „Portfel – dane” ↗</a></p>` : '';
  const kontaTbl = table([
    { h: 'Konto', f: k => `<b>${esc(k.nazwa)}</b>` }, { h: 'Typ podatkowy', f: k => esc(k.typ) }, { h: 'Waluta', f: k => esc(k.waluta) },
    { h: 'Gotówka', n: 1, f: k => has(k.gotowka) ? money(num(k.gotowka), k.waluta) : '–' }, { h: 'Model 2.1', f: k => esc(k.model) },
    { h: 'Wartość', n: 1, f: k => zl(C.konta.find(x => x.id === k.id)?.razem || 0, 0) },
  ], S.konta, { click: k => `editKonto('${k.id}')` });
  const celeTbl = table([
    { h: 'Koszyk', f: c => `<b>${esc(c.koszyk)}</b>` }, { h: 'Grupa', f: c => esc(c.grupa) }, { h: 'Cel', n: 1, f: c => num(c.cel) + '%' },
  ], S.cele, { click: c => `editCel('${c.id}')`, foot: ['Suma', '', S.cele.reduce((a, c) => a + num(c.cel), 0) + '%'] });
  return ['Ustawienia', 'Konta, kursy walut, alokacja docelowa, połączenie z Google Sheets i kopia zapasowa', `
    <div class="grid g2e">
      <div class="card"><h3>Google Sheets</h3>
        <p class="mut" style="margin-top:0">Dane zapisują się w Twoim arkuszu Google (tylko Ty masz do niego dostęp). Instrukcja zdobycia Client ID jest w pliku README.</p>
        <div class="form"><label class="full">Google OAuth Client ID<input id="cid" value="${esc(CFG.clientId)}" placeholder="123456-abc.apps.googleusercontent.com"></label>
        <label class="full">ID arkusza (puste = aplikacja utworzy nowy)<input id="sid" value="${esc(CFG.sheetId)}" placeholder="z adresu docs.google.com/spreadsheets/d/<ID>/edit"><span class="help">Możesz wkleić ID własnego arkusza (z adresu między /d/ a /edit) – aplikacja sama doda w nim zakładki. Na drugim urządzeniu wklej to samo ID.</span></label></div>
        ${g}<div class="actions" style="justify-content:flex-start">
          <button class="btn" onclick="const nid=$('#sid').value.trim();if(nid!==CFG.sheetId){CFG.createdByApp=false;tokenClient=null;SYNC.token=null;}CFG.clientId=$('#cid').value.trim();CFG.sheetId=nid;saveCfg();googleConnect(true).then(ok=>{if(ok)toast('Połączono z Google Sheets');render()})">${SYNC.token ? 'Połącz ponownie' : 'Zaloguj przez Google'}</button>
          ${SYNC.token ? '<button class="btn ghost" onclick="buildSummary(true).then(()=>toast(\'Zakładka Podsumowanie w arkuszu odświeżona\')).catch(e=>toast(e.message))">▦ Odśwież Podsumowanie w arkuszu</button><button class="btn ghost" onclick="syncNow()">↻ Synchronizuj teraz</button><button class="btn danger" onclick="googleDisconnect();render()">Rozłącz</button>' : ''}</div></div>
      <div class="card"><h3>Kursy walut (bieżące, do wyceny)</h3>
        <div class="form">${Object.keys(u.kursy).map(c => `<label>${c}/PLN<input type="number" step="any" value="${esc(u.kursy[c])}" onchange="S.ustawienia.kursy['${c}']=this.value;changed('ustawienia');render()"></label>`).join('')}</div>
        <div class="actions" style="justify-content:flex-start"><button class="btn ghost" onclick="pobierzKursy()">↻ Pobierz z NBP</button><span class="mut">${u.kursyData ? 'Tabela NBP z ' + esc(u.kursyData) : ''}</span></div>
        <div class="form" style="margin-top:10px"><label>Stawka podatku Belki %<input type="number" value="${esc(u.stawka)}" onchange="S.ustawienia.stawka=num(this.value)||19;changed('ustawienia');render()"></label></div></div>
    </div>
    <div class="grid g2e" style="margin-top:16px">
      <div class="card"><h3>Konta<span class="sp"></span><button class="btn sm" onclick="editKonto()">＋ Konto</button></h3>${kontaTbl}
        <div class="mut" style="font-size:12px;margin-top:8px">„Opodatkowane” wchodzi do PIT-38. IKE/IKZE i „Poza PIT-38” są pomijane. Gotówkę u brokera aktualizuj ręcznie.</div></div>
      <div class="card"><h3>Portfel 2.1 – alokacja docelowa<span class="sp"></span><button class="btn sm" onclick="editCel()">＋ Koszyk</button></h3>${celeTbl}
        <div class="mut" style="font-size:12px;margin-top:8px">Koszyk przypisujesz instrumentowi w „Instrumenty i ceny”.</div></div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Kopia zapasowa</h3>
      <div class="row"><button class="btn ghost" onclick="exportJSON()">⬇ Eksport (plik JSON)</button><button class="btn ghost" onclick="exportCSV()">⬇ Transakcje do Excela (CSV)</button>
      <label class="btn ghost" style="cursor:pointer">⬆ Import z pliku<input type="file" accept=".json" style="display:none" onchange="importJSON(this.files[0])"></label>
      <span class="sp" style="flex:1"></span><button class="btn danger" onclick="resetAll()">Wyczyść dane w przeglądarce</button></div></div>`, ' '];
}

/* ===================== FORMULARZE ===================== */
function modal(title, fields, vals, onSave, onDelete, pre = '') {
  const f = fields.map(x => {
    const v = vals[x.k] ?? '';
    let inp;
    if (x.t === 'select') inp = `<select name="${x.k}">${x.o.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
    else if (x.t === 'textarea') inp = `<textarea name="${x.k}" rows="2">${esc(v)}</textarea>`;
    else inp = `<input name="${x.k}" type="${x.t || 'text'}" ${x.t === 'number' ? 'step="any"' : ''} value="${esc(v)}" ${x.ph ? `placeholder="${esc(x.ph)}"` : ''}>`;
    return `<label class="${x.full ? 'full' : ''}">${x.l}${inp}${x.help ? `<span class="help" id="help_${x.k}">${x.help}</span>` : ''}</label>`;
  }).join('');
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal"><h2>${esc(title)}</h2>${pre}<form class="form">${f}</form><div class="actions">${onDelete ? '<button class="btn danger" data-a="del">Usuń</button>' : ''}<span class="sp"></span><button class="btn ghost" data-a="cancel">Anuluj</button><button class="btn" data-a="save">Zapisz</button></div></div>`;
  document.body.appendChild(bg);
  const form = bg.querySelector('form');
  const read = () => { const o = {}; fields.forEach(x => { const el = form.elements[x.k]; let v = el.value.trim(); if (x.t === 'number' && v !== '') v = num(v); o[x.k] = v; }); return o; };
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  bg.querySelector('[data-a=cancel]').onclick = close;
  bg.querySelector('[data-a=save]').onclick = () => { const o = read(); const err = onSave(o); if (err) { toast(err); return; } close(); render(); };
  if (onDelete) bg.querySelector('[data-a=del]').onclick = () => { if (confirm('Usunąć?')) { onDelete(); close(); render(); } };
  form.addEventListener('submit', e => e.preventDefault());
  setTimeout(() => { const first = form.querySelector('input,select'); first && first.focus(); }, 30);
  return form;
}
const curOfTicker = t => (S.instrumenty.find(i => i.ticker === t) || {}).waluta || 'USD';
function wireNbp(form, dateKey, tickerKey) {
  const upd = async () => {
    const d = form.elements[dateKey].value, t = form.elements[tickerKey].value, cur = curOfTicker(t), help = form.querySelector('#help_kurs');
    if (cur === 'PLN') { form.elements.kurs.value = ''; help.textContent = 'Instrument w PLN – kurs niepotrzebny'; return; }
    if (!d) return; help.textContent = `Pobieranie kursu ${cur} z NBP…`;
    try { const k = await nbpRate(cur, d); form.elements.kurs.value = k; help.textContent = `Kurs średni NBP ${cur} z dnia roboczego przed ${d}`; }
    catch (e) { help.textContent = 'Nie udało się pobrać kursu – wpisz ręcznie'; }
  };
  form.elements[dateKey].addEventListener('change', upd); form.elements[tickerKey].addEventListener('change', upd);
  if (!form.elements.kurs.value) upd();
}
function editTransakcja(id, strategia) {
  const t = S.transakcje.find(x => x.id === id) || { data: todayStr(), typ: 'KUPNO', strategia: strategia || (S.strategie[0] || {}).nazwa, ticker: (S.instrumenty[0] || {}).ticker };
  if (!S.instrumenty.length) { toast('Najpierw dodaj instrument'); return editInstrument(); }
  const form = modal(id ? 'Edytuj transakcję' : 'Nowa transakcja', [
    { k: 'data', l: 'Data', t: 'date' }, { k: 'typ', l: 'Typ', t: 'select', o: ['KUPNO', 'SPRZEDAŻ'] },
    { k: 'strategia', l: 'Strategia', t: 'select', o: S.strategie.map(s => s.nazwa) },
    { k: 'ticker', l: 'Instrument', t: 'select', o: S.instrumenty.map(i => [i.ticker, `${i.ticker} – ${i.nazwa} (${i.waluta})`]) },
    { k: 'ilosc', l: 'Ilość', t: 'number' }, { k: 'cena', l: 'Cena za sztukę (waluta instrumentu)', t: 'number' },
    { k: 'prowizja', l: 'Prowizja (waluta instrumentu)', t: 'number', ph: '0' }, { k: 'kurs', l: 'Kurs NBP (D-1)', t: 'number', help: 'Pobiera się automatycznie z NBP' },
    { k: 'notatka', l: 'Notatka', full: 1 },
  ], t, o => {
    if (!o.data || !o.ticker || !(o.ilosc > 0)) return 'Uzupełnij datę, instrument i ilość';
    if (id) Object.assign(t, o); else S.transakcje.push({ id: uid(), ...o });
    changed('transakcje'); toast('Zapisano transakcję');
  }, id ? () => { S.transakcje = S.transakcje.filter(x => x.id !== id); changed('transakcje'); } : null);
  wireNbp(form, 'data', 'ticker');
}
function editDywidenda(id, strategia) {
  const d = S.dywidendy.find(x => x.id === id) || { data: todayStr(), strategia: strategia || (S.strategie[0] || {}).nazwa, ticker: (S.instrumenty[0] || {}).ticker };
  const form = modal(id ? 'Edytuj dywidendę' : 'Nowa dywidenda / odsetki', [
    { k: 'data', l: 'Data wypłaty', t: 'date' }, { k: 'strategia', l: 'Strategia', t: 'select', o: S.strategie.map(s => s.nazwa) },
    { k: 'ticker', l: 'Instrument', t: 'select', o: S.instrumenty.map(i => [i.ticker, `${i.ticker} (${i.waluta})`]) },
    { k: 'brutto', l: 'Kwota brutto (waluta instrumentu)', t: 'number' }, { k: 'podatek', l: 'Podatek pobrany u źródła', t: 'number', ph: 'np. 15% z USA' },
    { k: 'kurs', l: 'Kurs NBP (D-1)', t: 'number', help: 'Pobiera się automatycznie' }, { k: 'notatka', l: 'Notatka', full: 1 },
  ], d, o => {
    if (!o.data || !has(o.brutto)) return 'Uzupełnij datę i kwotę';
    if (id) Object.assign(d, o); else S.dywidendy.push({ id: uid(), ...o });
    changed('dywidendy'); toast('Zapisano dywidendę');
  }, id ? () => { S.dywidendy = S.dywidendy.filter(x => x.id !== id); changed('dywidendy'); } : null);
  wireNbp(form, 'data', 'ticker');
}
function editWplata(id, konto) {
  const w = S.wplaty.find(x => x.id === id) || { data: todayStr(), konto: konto || (S.konta[0] || {}).nazwa };
  modal(id ? 'Edytuj wpłatę' : 'Nowa wpłata / wypłata', [
    { k: 'data', l: 'Data', t: 'date' }, { k: 'konto', l: 'Konto', t: 'select', o: S.konta.map(k => k.nazwa) },
    { k: 'kwotaPLN', l: 'Kwota PLN (wypłata z minusem)', t: 'number' }, { k: 'kwotaWal', l: 'Kwota w walucie konta (opcjonalnie)', t: 'number' },
    { k: 'notatka', l: 'Notatka', full: 1 },
  ], w, o => {
    if (!o.data || !has(o.kwotaPLN)) return 'Uzupełnij datę i kwotę';
    if (id) Object.assign(w, o); else S.wplaty.push({ id: uid(), ...o });
    changed('wplaty'); toast('Zapisano wpłatę');
  }, id ? () => { S.wplaty = S.wplaty.filter(x => x.id !== id); changed('wplaty'); } : null);
}
function editStrategia(id, konto) {
  const s = S.strategie.find(x => x.id === id) || { kolor: PAL[S.strategie.length % PAL.length], konto: konto || (S.konta[0] || {}).nazwa };
  const old = s.nazwa;
  modal(id ? 'Edytuj strategię' : 'Nowa strategia', [
    { k: 'nazwa', l: 'Nazwa', full: 1 }, { k: 'konto', l: 'Konto', t: 'select', o: S.konta.map(k => k.nazwa) },
    { k: 'kolor', l: 'Kolor', t: 'color' }, { k: 'kapital', l: 'Kapitał przeznaczony (opcjonalnie, waluta konta)', t: 'number', full: 1 },
    { k: 'opis', l: 'Opis / zasady strategii', t: 'textarea', full: 1 },
  ], s, o => {
    if (!o.nazwa) return 'Podaj nazwę';
    if (S.strategie.some(x => x.nazwa === o.nazwa && x.id !== id)) return 'Strategia o tej nazwie już istnieje';
    if (id) { Object.assign(s, o); if (old !== o.nazwa) { S.transakcje.forEach(t => { if (t.strategia === old) t.strategia = o.nazwa; }); S.dywidendy.forEach(d => { if (d.strategia === old) d.strategia = o.nazwa; }); changed('transakcje', 'dywidendy'); } }
    else { const n = { id: uid(), ...o }; S.strategie.push(n); setTimeout(() => go('strategia', n.id), 0); }
    changed('strategie');
  }, id ? () => {
    if (S.transakcje.some(t => t.strategia === old) || S.dywidendy.some(d => d.strategia === old)) { toast('Strategia ma transakcje – najpierw je usuń lub przenieś'); return; }
    S.strategie = S.strategie.filter(x => x.id !== id); changed('strategie'); go('kokpit');
  } : null);
}
function editKonto(id) {
  const k = S.konta.find(x => x.id === id) || { typ: 'Opodatkowane', waluta: 'PLN', model: 'TAK' }; const old = k.nazwa;
  modal(id ? 'Edytuj konto' : 'Nowe konto', [
    { k: 'nazwa', l: 'Nazwa', full: 1 }, { k: 'typ', l: 'Typ podatkowy', t: 'select', o: ['Opodatkowane', 'IKE', 'IKZE', 'Poza PIT-38'] },
    { k: 'waluta', l: 'Waluta', t: 'select', o: ['PLN', 'USD', 'EUR', 'GBP', 'CHF'] }, { k: 'gotowka', l: 'Gotówka u brokera (waluta konta)', t: 'number' },
    { k: 'model', l: 'Wliczaj do modelu 2.1', t: 'select', o: ['TAK', 'NIE'] },
  ], k, o => {
    if (!o.nazwa) return 'Podaj nazwę';
    if (id) { Object.assign(k, o); if (old !== o.nazwa) { S.strategie.forEach(s => { if (s.konto === old) s.konto = o.nazwa; }); S.wplaty.forEach(w => { if (w.konto === old) w.konto = o.nazwa; }); changed('strategie', 'wplaty'); } }
    else { if (S.konta.some(x => x.nazwa === o.nazwa)) return 'Konto o tej nazwie już istnieje'; const n = { id: uid(), ...o }; S.konta.push(n); setTimeout(() => go('konto', n.id), 0); }
    changed('konta');
  }, id ? () => {
    const uzywa = S.strategie.filter(s => s.konto === old).map(s => s.nazwa);
    if (uzywa.length) { toast('Najpierw przypisz inne konto strategiom: ' + uzywa.join(', ')); return; }
    const w = S.wplaty.filter(x => x.konto === old).length;
    if (w && !confirm(`Na tym koncie jest ${w} wpłat – zostaną usunięte razem z kontem. Kontynuować?`)) return;
    S.wplaty = S.wplaty.filter(x => x.konto !== old); S.konta = S.konta.filter(x => x.id !== id); changed('konta', 'wplaty'); go('kokpit');
  } : null);
}
function editInstrument(id) {
  const i = S.instrumenty.find(x => x.id === id) || { klasa: 'Akcje/ETF', waluta: 'USD', koszyk: 'POZA MODELEM' }; const old = i.ticker;
  const pre = `<div class="search"><div class="row"><input id="sq" placeholder="Szukaj: nazwa lub ticker, np. cspx, orlen, złoto, bitcoin" style="flex:1">
    <button class="btn" id="sbtn" type="button">Szukaj</button></div><div id="sres" class="sres"></div></div>`;
  const form = modal(id ? 'Edytuj instrument' : 'Nowy instrument', [
    { k: 'ticker', l: 'Ticker' }, { k: 'nazwa', l: 'Nazwa' },
    { k: 'klasa', l: 'Klasa aktywów', t: 'select', o: KLASY },
    { k: 'waluta', l: 'Waluta notowań', t: 'select', o: ['USD', 'PLN', 'EUR', 'GBP', 'CHF'] },
    { k: 'koszyk', l: 'Koszyk Portfela 2.1', t: 'select', o: [...new Set(['POZA MODELEM', ...S.cele.map(c => c.koszyk), i.koszyk].filter(Boolean))] },
    { k: 'symbol', l: 'Symbol ceny', ph: 'uzupełni się po wyszukaniu – albo wpisz ręcznie' },
    { k: 'cena', l: 'Cena ręczna (opcjonalnie)', t: 'number' }, { k: 'dataCeny', l: 'Data ceny', t: 'date' },
  ], i, o => {
    if (!o.ticker) return 'Podaj ticker';
    if (S.instrumenty.some(x => x.ticker === o.ticker && x.id !== id)) return 'Taki ticker już istnieje';
    if (id) { Object.assign(i, o); if (old !== o.ticker) { S.transakcje.forEach(t => { if (t.ticker === old) t.ticker = o.ticker; }); S.dywidendy.forEach(d => { if (d.ticker === old) d.ticker = o.ticker; }); changed('transakcje', 'dywidendy'); } }
    else S.instrumenty.push({ id: uid(), cenaAuto: '', ...o });
    changed('instrumenty');
  }, id ? () => { if (S.transakcje.some(t => t.ticker === old)) { toast('Instrument ma transakcje'); return; } S.instrumenty = S.instrumenty.filter(x => x.id !== id); changed('instrumenty'); } : null, pre);
  wireSearch(form, !!id);
}
const KLASY = ['Akcje/ETF', 'Obligacje', 'Gotówka', 'Złoto', 'Srebro', 'Krypto', 'Nieruchomości', 'Inne'];
function guessKlasa(r) {
  const s = r.symbol.toUpperCase(), n = (r.nazwa || '').toLowerCase(), t = r.typ.toUpperCase();
  if (s.startsWith('GC=') || s.startsWith('XAU') || /gold|złot/.test(n)) return 'Złoto';
  if (s.startsWith('SI=') || s.startsWith('XAG') || /silver|srebr/.test(n)) return 'Srebro';
  if (t === 'CRYPTOCURRENCY') return 'Krypto';
  if (/treasury|bond|obligac/.test(n)) return 'Obligacje';
  if (/reit|real estate/.test(n)) return 'Nieruchomości';
  if (t === 'ETF' || t === 'EQUITY' || t === 'MUTUALFUND' || t === 'INDEX') return 'Akcje/ETF';
  return 'Inne';
}
function wireSearch(form, editing) {
  const box = form.closest('.modal'), q = box.querySelector('#sq'), out = box.querySelector('#sres'), btn = box.querySelector('#sbtn');
  const E = form.elements;
  const run = async () => {
    const v = q.value.trim() || E.nazwa.value.trim() || E.ticker.value.trim(); if (!v) return;
    q.value = v; btn.disabled = true; out.innerHTML = '<div class="mut">Szukam w Yahoo Finance… (kilka sekund)</div>';
    try {
      const res = await searchSymbols(v);
      if (!res.length) { out.innerHTML = '<div class="mut">Nic nie znaleziono – wpisz dane i symbol ręcznie poniżej.</div>'; E.ticker.focus(); return; }
      out.innerHTML = res.map((r, k) => `<div class="sr" data-k="${k}"><b>${esc(r.symbol)}</b><span>${esc(r.nazwa)}</span><i>${esc(r.gielda)} · ${esc(r.typ)}${r.waluta ? ' · ' + esc(r.waluta) : ''}${r.cena !== '' ? ' · ' + nf2.format(r.cena) : ''}</i></div>`).join('');
      out.querySelectorAll('.sr').forEach(el => el.onclick = () => {
        const r = res[+el.dataset.k];
        out.querySelectorAll('.sr').forEach(x => x.classList.remove('on')); el.classList.add('on');
        const base = r.symbol.replace(/\.[A-Z]{1,3}$/, '').replace(/=F$/, '').replace(/-USD$/, '');
        const map = { GC: 'ZŁOTO', SI: 'SREBRO' };
        if (!editing || !E.ticker.value) E.ticker.value = map[base] || base;
        E.nazwa.value = ({ GC: 'Złoto (1 oz)', SI: 'Srebro (1 oz)' })[base] || r.nazwa || E.nazwa.value;
        E.klasa.value = guessKlasa(r);
        if (['USD', 'PLN', 'EUR', 'GBP', 'CHF'].includes(r.waluta)) E.waluta.value = r.waluta;
        E.symbol.value = 'YAHOO:' + r.symbol;
        const kosz = [...E.koszyk.options].map(o => o.value).find(v => v === E.ticker.value); if (kosz) E.koszyk.value = kosz;
        toast('Uzupełniono dane – sprawdź i kliknij Zapisz');
      });
    } catch (e) { out.innerHTML = `<div class="warn">${esc(e.message)}. Możesz wpisać dane ręcznie.</div>`; }
    finally { btn.disabled = false; }
  };
  btn.onclick = run; q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  if (!SYNC.token) out.innerHTML = '<div class="mut">Wyszukiwanie działa po połączeniu z Google Sheets (plakietka u góry). Bez tego wpisz dane ręcznie.</div>';
}
function editCel(id) {
  const c = S.cele.find(x => x.id === id) || {};
  modal(id ? 'Edytuj koszyk' : 'Nowy koszyk', [{ k: 'koszyk', l: 'Koszyk' }, { k: 'grupa', l: 'Grupa (np. CORE)' }, { k: 'cel', l: 'Cel %', t: 'number' }], c, o => {
    if (!o.koszyk) return 'Podaj nazwę koszyka';
    if (id) Object.assign(c, o); else S.cele.push({ id: uid(), ...o }); changed('cele');
  }, id ? () => { S.cele = S.cele.filter(x => x.id !== id); changed('cele'); } : null);
}
function setCena(id, v) { const i = S.instrumenty.find(x => x.id === id); i.cena = v === '' ? '' : num(v); i.dataCeny = v === '' ? '' : todayStr(); changed('instrumenty'); render(); }
function addInflacja() {
  const last = S.inflacja.map(r => r.miesiac).sort().pop();
  let m; if (last) { const d = new Date(last + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); m = d.toISOString().slice(0, 7); } else { const d = new Date(); d.setMonth(d.getMonth() - 1); m = d.toISOString().slice(0, 7); }
  const v = prompt('Miesiąc (RRRR-MM):', m); if (!v || !/^\d{4}-\d{2}$/.test(v)) return;
  if (!S.inflacja.some(r => r.miesiac === v)) S.inflacja.push({ miesiac: v, mm: '' }); changed('inflacja'); render();
}
function setInfl(m, v, key = 'mm') { const r = S.inflacja.find(x => x.miesiac === m); r[key] = v === '' ? '' : num(v); changed('inflacja'); render(); }
function delInfl(m) { S.inflacja = S.inflacja.filter(x => x.miesiac !== m); changed('inflacja'); render(); }
async function pobierzKursy() { try { const d = await nbpCurrent(); toast('Kursy NBP z ' + d); render(); } catch (e) { toast(e.message); } }

/* ---------- eksport / import ---------- */
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function exportJSON() { download(`portfel-${todayStr()}.json`, JSON.stringify(S, null, 1), 'application/json'); }
function exportCSV() {
  const cols = TABLES.transakcje.cols; const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.map(c => q(c[1])).join(';'), ...S.transakcje.map(t => cols.map(([k]) => typeof t[k] === 'number' ? String(t[k]).replace('.', ',') : q(t[k])).join(';'))];
  download(`transakcje-${todayStr()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
}
function importJSON(file) {
  if (!file) return; const r = new FileReader();
  r.onload = () => { try { const d = JSON.parse(r.result); if (!d.transakcje || !d.strategie) throw new Error(); if (!confirm('Zastąpić obecne dane danymi z pliku?')) return;
    S = Object.assign(defaultState(), d); Object.keys(TABLES).forEach(t => DIRTY.add(t)); saveLocal(); scheduleSync(); render(); toast('Zaimportowano dane'); }
    catch (e) { toast('To nie jest plik eksportu Portfela'); } };
  r.readAsText(file);
}
function resetAll() { if (!confirm('Usunąć wszystkie dane z tej przeglądarki? (arkusz Google zostaje bez zmian)')) return; S = defaultState(); DIRTY = new Set(); saveLocal(); render(); }

/* ---------- start ---------- */
setInterval(() => { if (document.visibilityState === 'visible') { C = calc(S); snapshotIntraday(); if (ROUTE === 'kokpit' && RANGE === '1d') render(); } }, 15 * 60000);
function boot() {
  const MIG = { 'CURRENCY:XAUUSD': 'YAHOO:GC=F', 'CURRENCY:XAGUSD': 'YAHOO:SI=F', 'CURRENCY:BTCUSD': 'YAHOO:BTC-USD' };
  let mig = false; S.instrumenty.forEach(i => { if (MIG[i.symbol]) { i.symbol = MIG[i.symbol]; mig = true; } }); if (mig) changed('instrumenty');
  readHash(); render(); snapshot();
  if (CFG.clientId && CFG.connected) setSync('pending', 'Kliknij tutaj, aby połączyć z Google Sheets');
  else setSync('local', CFG.sheetId ? 'Kliknij, aby połączyć z Google Sheets' : 'Dane tylko w tej przeglądarce');
  if (CFG.inflDay !== todayStr() || CFG.inflSrc !== 'fred') pobierzInflacje(true).then(r => { if (r) { render(); snapshot(); } }).catch(() => {});
  const kd = S.ustawienia.kursyData; if (!kd || kd < todayStr().slice(0, 10) && navigator.onLine) nbpCurrent().then(() => { render(); snapshot(); }).catch(() => {});
}
