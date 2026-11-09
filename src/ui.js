/* ===================== INTERFEJS ===================== */
const $ = s => document.querySelector(s);
const nf2 = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nfq = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 6 });
/* waluta prezentacji: kwoty z silnika są w PLN po dzisiejszym kursie -> dzielimy przez bieżący kurs */
const WAL = () => (C && C.waluta) || 'PLN';
const WSYM = { PLN: 'zł', USD: 'USD', EUR: 'EUR' };
const WL = () => WAL() === 'PLN' ? 'PLN' : WAL();
const zlPLN = (v, d = 2) => (v === null || v === undefined || isNaN(v)) ? '–' : (d ? nf2 : nf0).format(v) + ' zł';
const zl = (v, d = 2) => { if (v === null || v === undefined || isNaN(v)) return '–'; const w = WAL(); if (w === 'PLN' || !C.kursX) return zlPLN(v, d); return (d ? nf2 : nf0).format(v / C.kursX) + ' ' + WSYM[w]; };
const calcOpts = () => ({ waluta: CFG.waluta || 'PLN', fx: typeof FXH !== 'undefined' ? FXH : {} });
const calcPLN = () => (C && C.waluta === 'PLN') ? C : calc(S);
function ustawWalute(w) {
  CFG.waluta = w; saveCfg(); render();
  if (w !== 'PLN') pobierzFxHist(w).then(ch => { if (ch) render(); }).catch(e => toast('Nie udało się pobrać kursów historycznych NBP – liczę po bieżącym kursie'));
}
const walutaSeg = () => `<div class="seg wal" title="Waluta prezentacji – kwoty liczone po kursach NBP z dnia operacji, inflacja kraju waluty">${['PLN', 'USD', 'EUR'].map(w => `<button class="${(CFG.waluta || 'PLN') === w ? 'on' : ''}" onclick="ustawWalute('${w}')">${w}</button>`).join('')}</div>`;
const money = (v, cur) => (v === null || isNaN(v)) ? '–' : nf2.format(v) + ' ' + (cur || '');
const pct = v => (v === null || v === undefined || !isFinite(v)) ? '–' : (v * 100).toFixed(2).replace('.', ',') + '%';
const sgn = v => v > 0.0049 ? 'pos' : v < -0.0049 ? 'neg' : '';
const plus = v => (v > 0 ? '+' : '');
let C = null, ROUTE = 'kokpit', PARAM = '', RANGE = 'all', FILT = {};

function toast(msg) { let t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2600); }

/* ---------- historia: dzienny zapis wartości ---------- */
const LS_INTRA_REAL = 'portfel_intraday_v1';
let LS_INTRA = CFG.demo ? 'portfel_intraday_demo' : LS_INTRA_REAL;
function snapshotIntraday() {
  if (!C) return; const CP = calcPLN(); if (CP.wartosc <= 0) return;
  const arr = lsGet(LS_INTRA, []), now = new Date(), last = arr[arr.length - 1];
  const w = Math.round(CP.wartosc * 100) / 100, k = Math.round(CP.kapital * 100) / 100, kk = kontaMap(CP);
  if (last && now - new Date(last.t) < 10 * 60000) { if (last.w === w && last.k === k) return; last.w = w; last.k = k; last.kk = kk; last.t = now.toISOString(); }
  else arr.push({ t: now.toISOString(), w, k, kk });
  const cut = Date.now() - 3 * 864e5; lsSet(LS_INTRA, arr.filter(p => new Date(p.t).getTime() > cut));
}
function kontaMap(CV = calcPLN()) { const m = {}; CV.konta.forEach(k => { if (k.razem) m[k.nazwa] = Math.round(k.razem * 100) / 100; }); return m; }
function stratMap(CV = calcPLN()) { const m = {}; CV.strategie.forEach(s => { if (s.wartosc) m[s.nazwa] = Math.round(s.wartosc * 100) / 100; }); return m; }
function snapshot() {
  snapshotIntraday();
  if (!C) return; const CP = calcPLN(); if (CP.wartosc <= 0) return;
  const d = todayStr(), last = S.historia[S.historia.length - 1];
  const rec = { data: d, wartosc: Math.round(CP.wartosc * 100) / 100, kapital: Math.round(CP.kapital * 100) / 100, konta: JSON.stringify(kontaMap(CP)), strat: JSON.stringify(stratMap(CP)) };
  if (last && last.data === d) { if (Math.abs(num(last.wartosc) - rec.wartosc) < 0.01 && Math.abs(num(last.kapital) - rec.kapital) < 0.01 && last.konta === rec.konta && last.strat === rec.strat) return; Object.assign(last, rec); }
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
  const stLink = s => `<a class="sub ${ROUTE === 'strategia' && PARAM === s.id ? 'on' : ''}" draggable="true" data-drag="strategie" data-id="${s.id}" title="Przeciągnij na inne konto lub zmień kolejność" onclick="go('strategia','${s.id}')"><span class="dot" style="background:${esc(s.kolor || '#1565c0')}"></span>${esc(s.nazwa)}</a>`;
  CFG.navClosed = CFG.navClosed || {};
  const tree = S.konta.map(k => {
    const ss = S.strategie.filter(s => s.konto === k.nazwa), open = !CFG.navClosed[k.id];
    return `<a class="acc ${ROUTE === 'konto' && PARAM === k.id ? 'on' : ''}" draggable="true" data-drag="konta" data-id="${k.id}" title="Przeciągnij, aby zmienić kolejność" onclick="go('konto','${k.id}')">
        <span class="chev ${open && ss.length ? 'open' : ''} ${ss.length ? '' : 'noch'}" onclick="event.stopPropagation();toggleNav('${k.id}')">${ss.length ? '▸' : ''}</span><span class="ic">${KICON[k.typ] || '▣'}</span><span class="nm">${esc(k.nazwa)}</span>${ss.length ? `<span class="cnt">${ss.length}</span>` : ''}</a>
      ${open ? ss.map(stLink).join('') : ''}`;
  }).join('');
  const sieroty = S.strategie.filter(s => !S.konta.some(k => k.nazwa === s.konto));
  $('#nav').innerHTML = `
    ${it('kokpit', '◧', 'Kokpit')}${it('portfel', '▤', 'Portfel – pozycje')}
    <div class="nav-h">Konta i strategie</div>${tree}
    ${sieroty.length ? `<div class="nav-h">Strategie bez konta</div>${sieroty.map(stLink).join('')}` : ''}
    <a class="add" onclick="editKonto()"><span class="ic">＋</span>Dodaj konto</a><a class="add" onclick="editStrategia()"><span class="ic">＋</span>Dodaj strategię</a>
    <div class="nav-h">Analizy</div>${it('waluta', '¤', 'Wpływ waluty')}${it('porownanie', '⚖', 'Porównanie strategii')}${it('koszty', '−', 'Koszty i podatki')}${it('dochod', '◎', 'Dochód pasywny')}${it('podatki', '§', 'Podatki PIT-38')}${it('inflacja', '↗', 'Inflacja')}
    <div class="nav-h">Planowanie</div>${it('symulator', '➚', 'Symulator przyszłości')}${it('fire', '🔥', 'FIRE – ile brakuje')}${it('mapa', '▦', 'Mapa portfela')}${it('alerty', '🔔', 'Alerty' + (() => { const n = C ? alertyAktywne().filter(x => x.e.stan === 'osiągnięty' || x.e.stan === 'blisko').length : 0; return n ? ` (${n})` : ''; })())}
    <div class="nav-h">Operacje</div>${it('transakcje', '⇄', 'Transakcje')}${it('dywidendy', '◈', 'Dywidendy i odsetki')}${it('wplaty', '↧', 'Wpłaty i wypłaty')}
    <div class="nav-h">Konfiguracja</div>${it('instrumenty', '◇', 'Instrumenty i ceny')}${it('import', '⤓', 'Import')}${it('ustawienia', '⚙', 'Ustawienia i Google')}`;
}
function toggleNav(id) { CFG.navClosed = CFG.navClosed || {}; CFG.navClosed[id] = !CFG.navClosed[id]; saveCfg(); renderNav(); }
const KICON = { 'Opodatkowane': '▣', 'IKE': '◈', 'IKZE': '◈', 'Poza PIT-38': '◇' };
function renderSyncBadge() {
  const b = $('#sync'); if (!b) return;
  b.className = 'badge ' + SYNC.state; b.innerHTML = `<i></i>${esc(SYNC.msg)}`;
}

function render() {
  C = calc(S, calcOpts());
  renderNav(); renderSyncBadge();
  const V = { kokpit: vKokpit, portfel: vPortfel, strategia: vStrategia, konto: vKonto, transakcje: vTransakcje, dywidendy: vDywidendy, wplaty: vWplaty,
    podatki: vPodatki, inflacja: vInflacja, waluta: vWaluta, porownanie: vPorownanie, koszty: vKoszty, dochod: vDochod, symulator: vSymulator, fire: vFire, mapa: vMapa, import: vImport, alerty: vAlerty, instrumenty: vInstrumenty, ustawienia: vUstawienia }[ROUTE] || vKokpit;
  const [title, sub, body, actions] = V();
  $('#title').innerHTML = `${esc(title)}<small>${sub || ''}</small>`;
  $('#topActions').innerHTML = walutaSeg() + (actions || `<button class="btn" onclick="editTransakcja()">＋ Transakcja</button>`);
  $('#view').innerHTML = demoBanner() + body;
  alertyPowiadom();
}

/* ---------- elementy ---------- */
const kpi = (l, v, s = '', cls = '') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
function table(cols, rows, opts = {}) {
  if (!rows.length) return `<div class="empty">${opts.empty || 'Brak danych'}</div>`;
  const th = cols.map(c => `<th class="${c.n ? 'n' : ''}">${c.h}</th>`).join('');
  const X = opts.expand;   // { key: r => klucz, sub: r => [wiersze], cols: [kolumny wierszy podrzędnych] }
  const tr = rows.map(r => {
    const k = X && X.key(r), open = X && ROZW.has(k), subs = X ? X.sub(r) : [];
    const klik = X && subs.length ? `data-k="${esc(k)}" onclick="if(!event.target.closest('a,button,input,select'))toggleRozw(this.dataset.k)"` : (opts.click ? `onclick="${opts.click(r)}"` : '');
    const main = `<tr class="${opts.click || (X && subs.length) ? 'click' : ''} ${open ? 'open' : ''}" ${klik} ${opts.drag ? `draggable="true" data-drag="${opts.drag}" data-id="${r.id}"` : ''}>${cols.map((c, i) => `<td class="${c.n ? 'n' : ''} ${c.cls ? c.cls(r) : ''}">${i === 0 && X ? `<span class="chev">${subs.length ? (open ? '▾' : '▸') : ''}</span>` : ''}${c.f(r)}</td>`).join('')}</tr>`;
    return main + (open ? subs.map(s => `<tr class="sub">${X.cols.map(c => `<td class="${c.n ? 'n' : ''}">${c.f(s)}</td>`).join('')}</tr>`).join('') : '');
  }).join('');
  const foot = opts.foot ? `<tr>${opts.foot.map((f, i) => `<td class="${cols[i] && cols[i].n ? 'n' : ''}"><b>${f ?? ''}</b></td>`).join('')}</tr>` : '';
  return `<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>${tr}${foot}</tbody></table></div>`;
}
const pl = v => `<span class="${sgn(v)}">${plus(v)}${zl(v)}</span>`;
const plPLN = v => `<span class="${sgn(v)}">${plus(v)}${zlPLN(v)}</span>`;
const ROZW = new Set();
function toggleRozw(k) { ROZW.has(k) ? ROZW.delete(k) : ROZW.add(k); render(); }
const lotKey = p => 'poz|' + p.strategia + '|' + p.ticker;
const lotSub = p => p.loty.length > 1 || (p.loty[0] && p.loty[0].ilosc < p.loty[0].ilosc0 - 1e-9) ? p.loty.map(l => ({ ...l, _p: p })) : [];
const lotOpis = l => `<span class="mut">↳ zakup${l._p && ROUTE === 'portfel' ? ' ' + esc(l.data) : ''}</span>${l.notatka && !/^XTB#/.test(l.notatka) ? ` <span style="font-size:12.5px">${esc(String(l.notatka).replace(/\s*XTB#\S+/, ''))}</span>` : ''}${l.ilosc < l.ilosc0 - 1e-9 ? ` <span class="mut" style="font-size:11px" title="część tego zakupu została już sprzedana">(z ${nfq.format(l.ilosc0)})</span>` : ''}`;
const lotAkcje = l => `<span class="akcje"><a onclick="zamknijPozycje('${esc(l._p.strategia)}','${esc(l._p.ticker)}',${l.ilosc},'${l.id}')">zamknij</a> · <a onclick="editTransakcja('${l.id}')">edytuj</a></span>`;
const osKupno = p => `${money(p.koszt, p.waluta)}<br><span class="mut" style="font-size:11px">wartość kupna</span>`;
const osInput = (ticker, l) => `<input class="cell" type="number" step="0.01" style="width:110px" value="${l.lz ? '' : r2(l.wartosc)}" placeholder="wpisz z banku" title="Aktualna wartość obligacji z tego zakupu (z banku / obligacjeskarbowe.pl)" onclick="event.stopPropagation()" onchange="setLotOS('${esc(ticker)}','${l.id}',this.value)">${l.lz ? '<br><span class="mut" style="font-size:11px">na razie = kupno</span>' : ''}`;
// pozycja z jednym zakupem: pole od razu w wierszu; kilka zakupów: suma na górze, pola w wierszach zakupów
const osWartosc = p => lotSub(p).length ? `<b>${money(p.wartosc, p.waluta)}</b><br><span class="mut" style="font-size:11px">suma zakupów ↓</span>` : osInput(p.ticker, p.loty[0]);
const qtyOf = t => C.pozycje.filter(p => p.ticker === t).reduce((a, p) => a + p.ilosc, 0);
function setLotOS(ticker, lotId, v) {
  const tx = S.transakcje.find(x => x.id === lotId), ins = S.instrumenty.find(x => x.ticker === ticker); if (!tx) return;
  const loty = C.pozycje.filter(p => p.ticker === ticker).flatMap(p => p.loty), lot = loty.find(l => l.id === lotId); if (!lot) return;
  // zakupy wyceniane dotąd wspólną wartością: utrwal ich wartość, żeby nie zmieniła się po wpisaniu tej
  loty.forEach(l => { const t = S.transakcje.find(x => x.id === l.id); if (t && l.id !== lotId && !has(t.wartoscAkt) && !l.lz && l.ilosc) t.wartoscAkt = r2(l.wartosc * l.ilosc0 / l.ilosc); });
  tx.wartoscAkt = v === '' || v === null ? '' : num(v) * lot.ilosc0 / lot.ilosc;
  // „Cena ręczna” instrumentu = średnia z wpisanych wartości (dla zakładki Podsumowanie w arkuszu)
  const ps = calc(S, calcOpts()).pozycje.filter(p => p.ticker === ticker), q = ps.reduce((a, p) => a + p.ilosc, 0), w = ps.reduce((a, p) => a + p.wartosc, 0);
  if (ins && q) { ins.cena = w / q; ins.dataCeny = todayStr(); }
  changed('transakcje', 'instrumenty'); render(); toast('Zapisano aktualną wartość');
}
const pozAkcje = p => `<button class="btn sm ghost akcje" onclick="zamknijPozycje('${esc(p.strategia)}','${esc(p.ticker)}',${p.ilosc},'')">Zamknij</button>`;
function zamknijPozycje(strategia, ticker, ilosc, zakup) {
  const p = C.pozycje.find(x => x.strategia === strategia && x.ticker === ticker) || {};
  editTransakcja(null, strategia, { typ: 'SPRZEDAŻ', ticker, ilosc: +ilosc.toFixed(8), cena: p.cena ? +p.cena.toFixed(4) : '', zakup: zakup || '', wartosc: !p.os ? '' : (l => l ? r2(l.wartosc * ilosc / l.ilosc) : r2(p.wartosc * ilosc / p.ilosc))(zakup && p.loty.find(x => x.id === zakup)) });
}
function cofnijSprzedaz(id) {
  const t = S.transakcje.find(x => x.id === id); if (!t) return;
  if (!confirm(`Cofnąć sprzedaż ${t.ticker} z ${t.data} (${nfq.format(num(t.ilosc))} szt.)?\n\nTransakcja sprzedaży zostanie usunięta, a pozycja wróci do otwartych.`)) return;
  S.transakcje = S.transakcje.filter(x => x.id !== id); changed('transakcje'); toast('Cofnięto sprzedaż'); render();
}
const zamSub = r => r.loty && r.loty.length ? r.loty.map(l => ({ ...l, _r: r })) : [];
const zamLotKP = l => l._r.koszt ? l._r.kosztPLN * (l.q * l.uc) / l._r.koszt : 0, zamLotPP = l => l._r.ilosc ? l._r.przychodPLN * l.q / l._r.ilosc : 0;
const zamKey = r => 'zam|' + r.id;
const zamSubCols = (n) => { const c = [
  { f: l => `<span class="mut">↳ z zakupu ${esc(l.data)}</span>` }, { f: () => '' }, { n: 1, f: l => nfq.format(l.q) },
  // część sprzedaży przypadająca na ten zakup – w walucie prezentacji (koszt wg udziału w koszcie, przychód wg ilości)
  { n: 1, f: l => zl(zamLotKP(l)) }, { n: 1, f: l => zl(zamLotPP(l)) },
  { n: 1, f: l => pl(zamLotPP(l) - zamLotKP(l)) }]; while (c.length < n) c.push({ f: () => '' }); return c; };
const pp = v => `<span class="${sgn(v)}">${plus(v)}${pct(v)}</span>`;
function warningsBox() {
  const w = [...C.warnings];
  const noPrice = [...new Set(C.pozycje.filter(p => p.brakCeny).map(p => p.ticker))];
  if (noPrice.length) w.push(`Brak ceny dla: <b>${noPrice.map(esc).join(', ')}</b> – uzupełnij w <a onclick="go('instrumenty')">Instrumenty i ceny</a>.`);
  const needFx = C.pozycje.some(p => p.waluta !== 'PLN') && !num(S.ustawienia.kursy.USD);
  if (needFx) w.push(`Brak bieżących kursów walut – <a onclick="pobierzKursy()">pobierz z NBP</a> lub wpisz w Ustawieniach.`);
  return w.length ? `<div class="alert">⚠ ${w.join('<br>⚠ ')}</div>` : '';
}
function histSeries(SV = S, konto = '') {
  if (RANGE === '1d') {
    const from = Date.now() - 864e5;
    let h = lsGet(LS_INTRA, []).filter(p => new Date(p.t).getTime() >= from && (!konto || (p.kk && p.kk[konto] !== undefined)))
      .map(p => ({ d: localIso(p.t), w: C.histX(konto ? p.kk[konto] : p.w, todayStr()), k: C.kapital }));
    if (h.length < 2) { const d = histPoints(SV).slice(-2); if (d.length === 2) h = d; }
    return h;
  }
  let h = histPoints(SV);
  if (RANGE !== 'all' && h.length) { const days = { '1w': 7, '1m': 31, '3m': 92, '1r': 366, 'ytd': 0 }[RANGE];
    const from = RANGE === 'ytd' ? new Date().getFullYear() + '-01-01' : new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    h = h.filter(x => x.d >= from); }
  return h;
}
const localIso = t => { const d = new Date(t); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
function emptyMsg() { return { '1d': 'Wykres dzienny pojawi się po kilku aktualizacjach w ciągu dnia (otwórz aplikację ponownie za jakiś czas)', '1w': 'Wykres tygodniowy pojawi się po co najmniej dwóch dniach zapisów' }[RANGE] || 'Wykres pojawi się po kilku dniach zapisów historii'; }
function rangeSeg() { return `<div class="seg">${[['1d', '1D'], ['1w', '1T'], ['1m', '1M'], ['3m', '3M'], ['ytd', 'YTD'], ['1r', '1R'], ['all', 'Całość']].map(([k, l]) => `<button class="${RANGE === k ? 'on' : ''}" onclick="RANGE='${k}';render()">${l}</button>`).join('')}</div>`; }

/* ---------- wycinek danych dla jednego konta (kokpit konta) ---------- */
let CFULL_W = 0; const Cfull_wartosc = () => CFULL_W;
function subsetState(kn) {
  const strat = S.strategie.filter(s => s.konto === kn), names = new Set(strat.map(s => s.nazwa));
  const wpl = S.wplaty.filter(w => w.konto === kn);
  const kapAt = d => wpl.filter(w => String(w.data) <= d).reduce((a, w) => a + num(w.kwotaPLN), 0);
  const hist = S.historia.map(h => { let m = h.konta; try { if (typeof m === 'string') m = m ? JSON.parse(m) : null; } catch (e) { m = null; }
    if (!m || m[kn] === undefined) return null; return { data: h.data, wartosc: m[kn], kapital: kapAt(String(h.data).slice(0, 10)) }; }).filter(Boolean);
  return { ...S, strategie: strat, konta: S.konta.filter(k => k.nazwa === kn).map(k => ({ ...k, model: 'TAK' })),
    transakcje: S.transakcje.filter(t => names.has(t.strategia)), dywidendy: S.dywidendy.filter(d => names.has(d.strategia)),
    wplaty: wpl, historia: hist, cele: S.cele.filter(c => c.konto === kn).map(c => ({ ...c, konto: '' })) };
}

/* ===================== WIDOKI ===================== */
function vKokpit() {
  let KK = FILT.kokpitKonto || ''; if (KK && !S.konta.some(k => k.nazwa === KK)) KK = FILT.kokpitKonto = '';
  const Cfull = C, SV = KK ? subsetState(KK) : S; CFULL_W = Cfull.wartosc;
  if (KK) C = calc(SV, calcOpts());
  try { return vKokpitInner(SV, KK); } finally { C = Cfull; }
}
function vKokpitInner(SV, KK) {
  const rok = new Date().getFullYear();
  const dywRok = C.dyw.filter(d => d.rok === rok);
  const dywRokNetto = dywRok.reduce((a, d) => a + d.nettoPLN, 0);
  const prev = SV.historia.filter(h => String(h.data) < todayStr()).slice(-1)[0];
  const zmiana = prev ? C.wartosc - C.histX(num(prev.wartosc), String(prev.data).slice(0, 10)) - (C.kapital - C.kapitalNa(String(prev.data).slice(0, 10))) : null;
  const h = histSeries(SV, KK);
  const kursUsd = C.rateNow('USD');
  const kp = `<div class="kpis">
    ${kpi(KK ? 'Wartość konta' : 'Wartość portfela', zl(C.wartosc, 0), (WAL() !== 'PLN' ? `≈ ${zlPLN(C.wartosc, 0)}` : C.usd ? `≈ ${nf0.format(C.usd)} USD` : '') + (KK && Cfull_wartosc() ? ` · ${pct(C.wartosc / Cfull_wartosc())} całości` : ''), 'main')}
    ${kpi('Zysk / strata', pl(C.zysk), pp(C.zyskPct) + ' od wpłat')}
    ${kpi('Zysk realny (po inflacji)', pl(C.zyskRealny), pp(C.zyskRealnyPct) + (C.inflLast ? ` · inflacja ${{ PLN: 'PL', USD: 'USA', EUR: 'strefy euro' }[WAL()]} do ${C.inflLast}` : (WAL() === 'EUR' ? ' · pobieram inflację strefy euro…' : ' · pobieram inflację…')))}
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
  const klasy = donut(Object.entries(C.klasy), { center: [nf0.format(C.wartosc / (C.kursX || 1) / 1000) + ' tys.', WL()], empty: 'Dodaj pierwszą transakcję' });
  const waluty = donut(Object.entries(C.waluty), { empty: 'Brak pozycji' });
  const strat = C.strategie.filter(s => s.wartosc || s.zrealizowany || s.dywidendyNetto);
  const stratTbl = table([
    { h: 'Strategia', f: s => `<span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(s.kolor)};margin-right:7px"></span>${esc(s.nazwa)}` },
    { h: 'Wartość', n: 1, f: s => zl(s.wartosc, 0) },
    { h: 'Udział', f: s => `<div class="bar"><i style="width:${(s.udzial * 100).toFixed(1)}%;background:${esc(s.kolor)}"></i></div>` },
    { h: 'Wynik', n: 1, f: s => pl(s.wynik) }, { h: '%', n: 1, f: s => pp(s.koszt ? s.wynik / s.koszt : 0) },
  ], strat, { empty: 'Brak pozycji w strategiach', click: s => `go('strategia','${s.id}')` });
  const modele = KK ? [['', KK]] : [['', 'Cały portfel'], ...S.konta.filter(k => S.cele.some(c => c.konto === k.nazwa)).map(k => [k.nazwa, k.nazwa])];
  if (!modele.some(m => m[0] === (FILT.model || ''))) FILT.model = '';
  const modelSel = modele.length > 1 ? `<select style="padding:4px 8px;font-size:12.5px" onchange="FILT.model=this.value;render()">${modele.map(([v, l]) => `<option value="${esc(v)}" ${v === (FILT.model || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : '';
  const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  const dm = months.map((_, i) => dywRok.filter(d => +d.data.slice(5, 7) === i + 1).reduce((a, d) => a + d.nettoPLN, 0));
  const top = C.pozycje.slice().sort((a, b) => b.wartoscPLN - a.wartoscPLN).slice(0, 8);
  const topTbl = table([
    { h: 'Instrument', f: p => `<b>${esc(p.ticker)}</b> <span class="mut">${esc(p.strategia)}</span>` },
    { h: 'Wartość', n: 1, f: p => zl(p.wartoscPLN, 0) }, { h: 'Udział', n: 1, f: p => pct(C.wartosc ? p.wartoscPLN / C.wartosc : 0) },
    { h: 'Zysk', n: 1, f: p => pl(p.zyskPLN) }, { h: '%', n: 1, f: p => pp(p.kosztPLN ? p.zyskPLN / p.kosztPLN : 0) },
  ], top, { empty: 'Brak otwartych pozycji', click: p => `go('portfel')` });
  const sub = `Stan na ${new Date().toLocaleDateString('pl-PL')}${kursUsd ? ' · USD/PLN ' + kursUsd.toFixed(4).replace('.', ',') : ''}${S.ustawienia.kursyData ? ' (NBP ' + S.ustawienia.kursyData + ')' : ''}`;
  const intro = !S.transakcje.length && !CFG.demo && !KK ? `<div class="alert info">👋 Chcesz najpierw zobaczyć, jak to wygląda? <a onclick="wejdzDemo()"><b>Wczytaj przykładowy portfel</b></a> (Twoje dane wrócą jednym kliknięciem).<br>Albo zacznij od <a onclick="go('ustawienia')">Ustawień</a> (konta, połączenie z Google), potem dodaj <a onclick="editTransakcja()">pierwszą transakcję</a>. Ceny aktualizujesz w <a onclick="go('instrumenty')">Instrumentach</a>.</div>` : '';
  const widok = `<select class="viewsel" onchange="FILT.kokpitKonto=this.value;render()"><option value="">📊 Cały portfel</option>${S.konta.map(k => `<option value="${esc(k.nazwa)}" ${k.nazwa === KK ? 'selected' : ''}>${esc(k.nazwa)}</option>`).join('')}</select>`;
  const noHist = KK && !SV.historia.length ? `<div class="alert info">Historia wartości tego konta zbiera się od dziś (zapis raz dziennie). Wykresy w czasie zapełnią się w kolejnych dniach.</div>` : '';
  return [KK ? 'Kokpit – ' + KK : 'Kokpit', sub, intro + noHist + (KK ? '' : alertyBox()) + warningsBox() + kp + `
    <div class="grid g2"><div class="card"><h3>${KK ? 'Wartość konta' : 'Wartość portfela'} w czasie<span class="sp"></span>${rangeSeg()}</h3>${line}</div>
      <div class="card"><h3>Struktura – klasy aktywów</h3>${klasy}</div></div>
    <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Stopa zwrotu: nominalna i realna<span class="sp"></span>${rangeSeg()}</h3>${ret}</div>
      <div class="card"><h3>Ekspozycja walutowa</h3>${waluty}</div></div>
    ${kokpitRynek(SV, KK)}
    <div class="card" style="margin-top:16px"><h3>Konta<span class="sp"></span><button class="btn sm ghost" onclick="editKonto()">＋ Konto</button></h3>${table([
      { h: 'Konto', f: k => `<b>${esc(k.nazwa)}</b>` }, { h: 'Typ', f: k => `<span class="tag">${esc(k.typ)}</span>` },
      { h: 'Pozycje', n: 1, f: k => zl(k.wartoscPozycji, 0) }, { h: 'Gotówka', n: 1, f: k => zl(k.gotowkaPLN, 0) }, { h: 'Razem', n: 1, f: k => `<b>${zl(k.razem, 0)}</b>` },
      { h: 'Udział', f: k => `<div class="bar"><i style="width:${C.wartosc ? (k.razem / C.wartosc * 100).toFixed(1) : 0}%;background:#1565c0"></i></div>` },
      { h: 'Wpłacono', n: 1, f: k => zl(k.kapital, 0) }, { h: 'Zysk', n: 1, f: k => k.zysk === null ? '–' : pl(k.zysk) }, { h: '%', n: 1, f: k => k.zyskPct === null ? '–' : pp(k.zyskPct) },
    ], C.konta, { click: k => `go('konto','${k.id}')` })}</div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Strategie<span class="sp"></span><small>kliknij, aby otworzyć</small></h3>${stratTbl}</div>
      <div class="card"><h3>Portfel docelowy<span class="sp"></span>${modelSel}</h3>${KK ? modelCard('', KK) : modelCard(FILT.model || '')}</div></div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Dywidendy i odsetki ${rok} <small>netto ${WL()}</small></h3>${barChart(months, [{ name: 'Netto', values: dm, color: '#26A69A' }], { empty: 'Brak dywidend w tym roku', h: 200 })}</div>
      <div class="card"><h3>Największe pozycje</h3>${topTbl}</div></div>`, `${widok}<button class="btn" onclick="editTransakcja()">＋ Transakcja</button>`];
}

function vPortfel() {
  const f = FILT.portfel || (FILT.portfel = { s: '', k: '', c: '' });
  let rows = C.pozycje.filter(p => (!f.s || p.strategia === f.s) && (!f.k || p.konto === f.k) && (!f.c || p.klasa === f.c)).sort((a, b) => b.wartoscPLN - a.wartoscPLN);
  const sel = (key, label, opts) => `<select onchange="FILT.portfel.${key}=this.value;render()"><option value="">${label}</option>${opts.map(o => `<option ${f[key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const tot = rows.reduce((a, p) => ({ w: a.w + p.wartoscPLN, k: a.k + p.kosztPLN }), { w: 0, k: 0 });
  const cols = [
    { h: 'Instrument', f: p => `<b>${esc(p.ticker)}</b><br><span class="mut" style="font-size:12px">${esc(p.nazwa)}</span>` },
    { h: 'Strategia', f: p => `${esc(p.strategia)}<br><span class="mut" style="font-size:12px">${esc(p.konto)}</span>` },
    { h: 'Ilość', n: 1, f: p => nfq.format(p.ilosc) }, { h: 'Śr. cena', n: 1, f: p => p.os ? osKupno(p) : money(p.sredniaCena, p.waluta) },
    { h: 'Cena', n: 1, f: p => p.os ? osWartosc(p) : p.brakCeny ? '<span class="warn">brak</span>' : money(p.cena, p.waluta) },
    { h: 'Wartość ' + WL(), n: 1, f: p => zl(p.wartoscPLN) },
    { h: 'Zysk ' + WL(), n: 1, f: p => `${pl(p.zyskPLN)}<br>${pp(p.kosztPLN ? p.zyskPLN / p.kosztPLN : 0)}` }, { h: 'Udział', n: 1, f: p => pct(C.wartosc ? p.wartoscPLN / C.wartosc : 0) }, { h: '', f: pozAkcje },
  ];
  const subCols = [
    { f: lotOpis }, { f: () => '' }, { n: 1, f: l => nfq.format(l.ilosc) }, { n: 1, f: l => l._p.os ? money(l.koszt, l._p.waluta) : money(l.cenaZakupu, l._p.waluta) },
    { n: 1, f: l => l._p.os ? osInput(l._p.ticker, l) : l._p.brakCeny ? '' : money(l._p.cena, l._p.waluta) }, { n: 1, f: l => zl(l.wartoscPLN) },
    { n: 1, f: l => `${pl(l.zyskPLN)}<br>${pp(l.kosztPLN ? l.zyskPLN / l.kosztPLN : 0)}` }, { f: () => '' }, { f: lotAkcje }];
  return ['Portfel – pozycje', `${rows.length} otwartych pozycji`, `
    <div class="filters">${sel('s', 'Wszystkie strategie', S.strategie.map(s => s.nazwa))}${sel('k', 'Wszystkie konta', S.konta.map(k => k.nazwa))}${sel('c', 'Wszystkie klasy', [...new Set(C.pozycje.map(p => p.klasa))])}</div>
    <div class="kpis">${kpi('Wartość', zl(tot.w, 0))}${kpi('Koszt zakupu', zl(tot.k, 0))}${kpi('Zysk niezrealizowany', pl(tot.w - tot.k), pp(tot.k ? (tot.w - tot.k) / tot.k : 0))}</div>
    <div class="card">${table(cols, rows, { empty: 'Brak otwartych pozycji', expand: { key: lotKey, sub: lotSub, cols: subCols } })}</div>`];
}

function vStrategia() {
  const s = C.strategie.find(x => x.id === PARAM); if (!s) return ['Strategia', '', '<div class="empty">Nie znaleziono strategii</div>'];
  const poz = s.pozycje.slice().sort((a, b) => b.wartoscPLN - a.wartoscPLN);
  const struktura = donut(poz.map(p => [p.ticker, p.wartoscPLN]), { empty: 'Brak otwartych pozycji', center: [nf0.format(s.wartosc / (C.kursX || 1) / 1000) + ' tys.', WL()] });
  const txs = S.transakcje.filter(t => t.strategia === s.nazwa).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const wynikPct = s.koszt ? s.wynik / s.koszt : 0;
  const pozTbl = table([
    { h: 'Instrument', f: p => `<b>${esc(p.ticker)}</b> <span class="mut">${esc(p.nazwa)}</span>` },
    { h: 'Od', f: p => esc(p.od) }, { h: 'Ilość', n: 1, f: p => nfq.format(p.ilosc) },
    { h: 'Śr. cena', n: 1, f: p => p.os ? osKupno(p) : money(p.sredniaCena, p.waluta) }, { h: 'Cena', n: 1, f: p => p.os ? osWartosc(p) : p.brakCeny ? '<span class="warn">brak</span>' : money(p.cena, p.waluta) },
    { h: 'Wartość ' + WL(), n: 1, f: p => zl(p.wartoscPLN) },
    { h: 'Zysk ' + WL(), n: 1, f: p => pl(p.zyskPLN) }, { h: '%', n: 1, f: p => pp(p.kosztPLN ? p.zyskPLN / p.kosztPLN : 0) }, { h: '', f: pozAkcje },
  ], poz, { empty: 'Brak otwartych pozycji – dodaj transakcję kupna', expand: { key: lotKey, sub: lotSub, cols: [
    { f: lotOpis }, { f: l => esc(l.data) }, { n: 1, f: l => nfq.format(l.ilosc) }, { n: 1, f: l => l._p.os ? money(l.koszt, l._p.waluta) : money(l.cenaZakupu, l._p.waluta) },
    { n: 1, f: l => l._p.os ? osInput(l._p.ticker, l) : l._p.brakCeny ? '' : money(l._p.cena, l._p.waluta) }, { n: 1, f: l => zl(l.wartoscPLN) },
    { n: 1, f: l => pl(l.zyskPLN) }, { n: 1, f: l => pp(l.kosztPLN ? l.zyskPLN / l.kosztPLN : 0) }, { f: lotAkcje }] } });
  const zamTbl = table([
    { h: 'Sprzedaż', f: r => esc(r.data) }, { h: 'Instrument', f: r => `<b>${esc(r.ticker)}</b>` }, { h: 'Ilość', n: 1, f: r => nfq.format(r.ilosc) },
    { h: 'Koszt ' + WL(), n: 1, f: r => zl(r.kosztPLN) }, { h: 'Przychód ' + WL(), n: 1, f: r => zl(r.przychodPLN) },
    { h: 'Zysk ' + WL(), n: 1, f: r => `${pl(r.zyskPLN)}<br>${pp(r.kosztPLN ? r.zyskPLN / r.kosztPLN : 0)}` }, { h: '', f: r => `<span class="akcje"><button class="btn sm ghost" onclick="cofnijSprzedaz('${r.id}')">↶ Cofnij</button> <a onclick="editTransakcja('${r.id}')">edytuj</a></span>` },
  ], s.zamkniete.slice().reverse(), { empty: 'Brak zamkniętych pozycji', expand: { key: zamKey, sub: zamSub, cols: zamSubCols(7) } });
  const dywTbl = table([
    { h: 'Data', f: d => esc(d.data) }, { h: 'Ticker', f: d => esc(d.ticker) }, { h: 'Brutto', n: 1, f: d => money(num(d.brutto), d.waluta) },
    { h: 'Netto ' + WL(), n: 1, f: d => zl(d.nettoPLN) }, { h: '', f: d => `<a onclick="editDywidenda('${d.id}')">edytuj</a>` },
  ], s.dywidendy.slice().reverse(), { empty: 'Brak dywidend' });
  const txTbl = table(txCols(), txs.slice(0, 50), { empty: 'Brak transakcji' });
  return [s.nazwa, `${esc(s.konto)} · ${esc(s.typ)}${s.opis ? ' · ' + esc(s.opis) : ''}`, `
    <div class="kpis">${kpi('Wartość', zl(s.wartosc, 0), pct(s.udzial) + ' portfela', 'main')}${kpi('Zysk niezrealizowany', pl(s.niezreal), pp(s.niezrealPct))}
      ${kpi('Zysk zrealizowany', pl(s.zrealizowany), s.zamkniete.length + ' sprzedaży')}${kpi('Dywidendy netto', zl(s.dywidendyNetto), s.dywidendy.length + ' wypłat')}
      ${kpi('Wynik łączny', pl(s.wynik), pp(wynikPct) + ' od kosztu')}${s.wolne !== null ? kpi('Wolne środki', money(s.wolne, s.walutaKonta), 'z kapitału ' + money(num(s.kapital), s.walutaKonta)) : ''}</div>
    <div class="card"><h3>Otwarte pozycje <small>kliknij pozycję, aby zobaczyć poszczególne zakupy</small></h3>${pozTbl}</div>
    <div class="card" style="margin-top:16px"><h3>Zamknięte pozycje <small>rozwiń, aby zobaczyć, z których zakupów pochodzi sprzedaż · „cofnij” usuwa sprzedaż</small></h3>${zamTbl}</div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Dywidendy<span class="sp"></span><button class="btn sm ghost" onclick="editDywidenda(null,'${esc(s.nazwa)}')">＋ Dywidenda</button></h3>${dywTbl}</div><div class="card"><h3>Struktura strategii</h3>${struktura}</div></div>
    <div class="card" style="margin-top:16px"><h3>Transakcje strategii</h3>${txTbl}</div>`,
    `<button class="btn ghost" onclick="editStrategia('${s.id}')">Edytuj strategię</button><button class="btn" onclick="editTransakcja(null,'${esc(s.nazwa)}')">＋ Transakcja</button>`];
}

function vKonto() {
  const k = C.konta.find(x => x.id === PARAM); if (!k) return ['Konto', '', '<div class="empty">Nie znaleziono konta</div>'];
  const strat = C.strategie.filter(s => s.konto === k.nazwa);
  const poz = C.pozycje.filter(p => p.konto === k.nazwa).sort((a, b) => b.wartoscPLN - a.wartoscPLN);
  const wpl = S.wplaty.filter(w => w.konto === k.nazwa).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const opis = { 'Opodatkowane': 'wchodzi do PIT-38', 'IKE': 'bez podatku Belki (IKE)', 'IKZE': 'bez podatku Belki (IKZE)', 'Poza PIT-38': 'nie wchodzi do PIT-38' }[k.typ] || '';
  const struktura = donut(poz.map(p => [p.ticker, p.wartoscPLN]).concat(k.gotowkaPLN ? [['Gotówka', k.gotowkaPLN]] : []), { empty: 'Brak pozycji na tym koncie', center: [nf0.format(k.razem / (C.kursX || 1) / 1000) + ' tys.', WL()] });
  return [k.nazwa, `${esc(k.typ)} · ${esc(opis)} · waluta ${esc(k.waluta)}`, `
    <div class="kpis">${kpi('Wartość konta', zl(k.razem, 0), C.wartosc ? pct(k.razem / C.wartosc) + ' portfela' : '', 'main')}
      ${kpi('Pozycje', zl(k.wartoscPozycji, 0), poz.length + ' otwartych')}
      ${kpi('Gotówka na koncie', `${money(k.gotowkaKwota, k.waluta)}`, (k.gotowkaAuto ? 'liczona: wpłaty − zakupy + sprzedaże + dywidendy' : '<span class="warn">wpisana ręcznie</span>') + (k.waluta !== WAL() ? ' · ≈ ' + zl(k.gotowkaPLN, 0) : '') +
        `<br><a onclick="korektaGotowki('${k.id}')">${k.gotowkaAuto ? 'wpisz saldo ręcznie' : 'wróć do liczenia automatycznego'}</a>`)}
      ${kpi('Wpłacony kapitał', zl(k.kapital, 0), wpl.length + ' wpłat')}
      ${kpi('Zysk / strata', k.zysk === null ? '–' : pl(k.zysk), k.zyskPct === null ? 'dodaj wpłaty, aby policzyć' : pp(k.zyskPct))}</div>
    <div class="grid g2"><div class="card"><h3>Strategie na tym koncie<span class="sp"></span><button class="btn sm ghost" onclick="editStrategiaNaKoncie('${esc(k.nazwa)}')">＋ Strategia</button></h3>${table([
      { h: 'Strategia', f: s => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(s.kolor)};margin-right:7px"></span>${esc(s.nazwa)}` },
      { h: 'Wartość', n: 1, f: s => zl(s.wartosc, 0) }, { h: 'Wynik', n: 1, f: s => pl(s.wynik) }, { h: '%', n: 1, f: s => pp(s.koszt ? s.wynik / s.koszt : 0) },
    ], strat, { empty: 'Żadna strategia nie jest przypisana do tego konta', click: s => `go('strategia','${s.id}')` })}</div>
      <div class="card"><h3>Struktura konta</h3>${struktura}</div></div>
    <div class="card" style="margin-top:16px"><h3>Portfel docelowy konta</h3>${modelCard(k.nazwa)}</div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Pozycje <small>kliknij, aby rozwinąć zakupy</small></h3>${table([
      { h: 'Instrument', f: p => `<b>${esc(p.ticker)}</b> <span class="mut">${esc(p.strategia)}</span>` }, { h: 'Ilość', n: 1, f: p => nfq.format(p.ilosc) },
      { h: 'Wartość ' + WL(), n: 1, f: p => zl(p.wartoscPLN) }, { h: 'Zysk ' + WL(), n: 1, f: p => `${pl(p.zyskPLN)}<br>${pp(p.kosztPLN ? p.zyskPLN / p.kosztPLN : 0)}` }, { h: '', f: pozAkcje },
    ], poz, { empty: 'Brak otwartych pozycji', expand: { key: lotKey, sub: lotSub, cols: [
      { f: l => `${lotOpis(l)} <span class="mut">${esc(l.data)}</span>` }, { n: 1, f: l => nfq.format(l.ilosc) }, { n: 1, f: l => zl(l.wartoscPLN) },
      { n: 1, f: l => `${pl(l.zyskPLN)}<br>${pp(l.kosztPLN ? l.zyskPLN / l.kosztPLN : 0)}` }, { f: lotAkcje }] } })}</div>
      <div class="card"><h3>Wpłaty i wypłaty<span class="sp"></span><button class="btn sm ghost" onclick="editWplata(null,'${esc(k.nazwa)}')">＋ Wpłata</button></h3>${table([
      { h: 'Data', f: w => esc(w.data) }, { h: 'Kwota PLN', n: 1, f: w => plPLN(num(w.kwotaPLN)) },
      { h: 'W walucie konta', n: 1, f: w => has(w.kwotaWal) ? nf2.format(num(w.kwotaWal)) : '–' }, { h: 'Notatka', f: w => esc(w.notatka) },
    ], wpl, { empty: 'Brak wpłat na to konto', click: w => `editWplata('${w.id}')` })}</div></div>`,
    `${(() => { const sk = S.konta.find(x => x.id === k.id) || {}, on = num(sk.przew) > 0, walutowe = poz.some(p => p.waluta !== (sk.waluta || 'PLN'));
      return walutowe || on ? `<button class="btn ${on ? '' : 'ghost'}" title="Instrumenty w innej walucie niż konto wyceniane jak w XTB: po odjęciu prowizji za przewalutowanie" onclick="togglePrzew('${k.id}')">${on ? '✓ ' : ''}Przewalutowanie ${on ? nf2.format(num(sk.przew)).replace(/,00$/, '') + '%' : 'wył.'}</button>` : ''; })()}<button class="btn ghost" onclick="editKonto('${k.id}')">Edytuj / usuń konto</button><button class="btn" onclick="editWplata(null,'${esc(k.nazwa)}')">＋ Wpłata</button>`];
}
function setGotowka(id, v) { const k = S.konta.find(x => x.id === id); k.gotowka = v === '' ? '' : num(v); changed('konta'); render(); }
function korektaGotowki(id) {
  const k = S.konta.find(x => x.id === id), ck = C.konta.find(x => x.id === id);
  if (has(k.gotowka)) { k.gotowka = ''; changed('konta'); render(); toast('Gotówka liczona automatycznie'); return; }
  const v = prompt(`Saldo gotówki na koncie ${k.nazwa} (${k.waluta}) – np. z XTB.\nWyliczone przez aplikację: ${nf2.format(ck.gotowkaWyliczona)}`, nf2.format(ck.gotowkaWyliczona).replace(/\s/g, ''));
  if (v === null) return; setGotowka(id, String(v).replace(',', '.'));
}
function editStrategiaNaKoncie(konto) { editStrategia(null, konto); }

function modelCard(konto, link = konto) {
  const M = C.modelFor(konto), key = 'nowa_' + (link || '_'), nowa = num(CFG[key]), rozd = M.rozdziel(nowa);
  if (!M.rows.length) return `<div class="empty">Brak portfela docelowego${link ? ' dla tego konta' : ''}.<br><a onclick="FILT.celeKonto='${esc(link)}';go('ustawienia')">Ustaw koszyki i cele →</a></div>`;
  const tbl = table([
    { h: 'Koszyk', f: m => `<b>${esc(m.koszyk)}</b> <span class="mut">${esc(m.grupa || '')}</span>${m.lista.length > 1 || m.lista[0] !== m.koszyk ? `<br><span class="mut" style="font-size:11.5px">${esc(m.lista.join(' + '))}</span>` : ''}` },
    { h: 'Cel', n: 1, f: m => pct(m.celPct) }, { h: 'Teraz', n: 1, f: m => pct(m.udzial) },
    { h: '', f: m => `<div class="bar" style="position:relative"><i style="width:${Math.min(100, m.udzial * 100).toFixed(1)}%;background:#1565c0"></i><b style="position:absolute;top:-3px;left:${Math.min(99, m.celPct * 100)}%;width:2px;height:12px;background:#0f172a"></b></div>` },
    { h: 'Różnica', n: 1, f: m => Math.abs(m.roznica) < 1 ? '<span class="mut">–</span>' : `<span class="${m.roznica > 0 ? 'pos' : 'neg'}">${m.roznica > 0 ? 'dokup ' : 'nadwyżka '}${zl(Math.abs(m.roznica), 0)}</span>` },
    { h: 'Z nowej wpłaty', n: 1, f: m => nowa ? zl(rozd[M.rows.indexOf(m)], 0) : '–' },
  ], M.rows);
  return `<div class="row" style="margin-bottom:8px;font-size:12.5px"><span class="mut">Nowa wpłata do rozdzielenia:</span><input class="cell" type="number" value="${nowa || ''}" placeholder="0 zł" onchange="CFG['${key}']=this.value;saveCfg();render()">
    <span class="sp" style="flex:1"></span><a onclick="FILT.celeKonto='${esc(link)}';go('ustawienia')">edytuj cele</a></div>${tbl}
    <div class="mut" style="font-size:12.5px;margin-top:8px">${M.sumaCel !== 100 ? `<span class="warn">⚠ Suma celów: ${M.sumaCel}% (powinno być 100%)</span> · ` : ''}Poza portfelem docelowym: ${zl(M.poza, 0)} · gotówka: ${zl(M.gotowka, 0)}</div>`;
}

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
    <div class="card">${table(txCols(), rows, { empty: 'Brak transakcji – kliknij „＋ Transakcja”', click: t => `editTransakcja('${t.id}')` })}</div>`, `<button class="btn ghost" onclick="go('import')">⤓ Import</button><button class="btn" onclick="editTransakcja()">＋ Transakcja</button>`];
}

function vDywidendy() {
  const rows = C.dyw.slice().sort((a, b) => b.data.localeCompare(a.data));
  const byYear = {}; C.dyw.forEach(d => byYear[d.rok] = (byYear[d.rok] || 0) + d.nettoPLN);
  const years = Object.keys(byYear).sort();
  return ['Dywidendy i odsetki', 'Kwoty w walucie instrumentu, przeliczone kursem NBP z dnia przed wypłatą', `
    <div class="grid g2e"><div class="card"><h3>Netto ${WL()} wg lat</h3>${barChart(years, [{ name: 'Netto', values: years.map(y => byYear[y]), color: '#26A69A' }], { empty: 'Brak dywidend', h: 190 })}</div>
    <div class="kpis" style="align-content:start">${kpi('Łącznie netto', zl(C.dywNetto))}${kpi('Liczba wypłat', rows.length)}${kpi('Do dopłaty w PL (' + new Date().getFullYear() + ')', zl(C.dyw.filter(d => d.rok === new Date().getFullYear()).reduce((a, d) => a + d.doplata, 0)))}</div></div>
    <div class="card" style="margin-top:16px">${table([
      { h: 'Data', f: d => esc(d.data) }, { h: 'Strategia', f: d => esc(d.strategia) }, { h: 'Ticker', f: d => `<b>${esc(d.ticker)}</b>` },
      { h: 'Brutto', n: 1, f: d => money(num(d.brutto), d.waluta) }, { h: 'Podatek u źródła', n: 1, f: d => money(num(d.podatek), d.waluta) },
      { h: 'Kurs', n: 1, f: d => d.waluta === 'PLN' ? '–' : (has(d.kurs) ? num(d.kurs).toFixed(4) : '<span class="warn">brak</span>') },
      { h: 'Netto ' + WL(), n: 1, f: d => zl(d.nettoPLN) }, { h: 'Dopłata PL', n: 1, f: d => d.doplata ? zlPLN(d.doplata) : '–' },
    ], rows, { empty: 'Brak dywidend – kliknij „＋ Dywidenda”', click: d => `editDywidenda('${d.id}')` })}</div>`,
    `<button class="btn" onclick="editDywidenda()">＋ Dywidenda</button>`];
}

function vWplaty() {
  const fk = FILT.wplKonto || '', rok = String(new Date().getFullYear());
  const lista = S.wplaty.filter(w => !fk || w.konto === fk);
  const rows = lista.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  let acc = 0; const cum = lista.filter(w => w.data).sort((a, b) => String(a.data).localeCompare(String(b.data))).map(w => [String(w.data), acc += num(w.kwotaPLN)]);
  // podsumowanie na konta
  const per = S.konta.map(k => { const ws = S.wplaty.filter(w => w.konto === k.nazwa), v = w => num(w.kwotaPLN);
    return { konto: k.nazwa, typ: k.typ, wpl: ws.filter(w => v(w) > 0).reduce((a, w) => a + v(w), 0), wyp: ws.filter(w => v(w) < 0).reduce((a, w) => a + v(w), 0),
      rok: ws.filter(w => String(w.data).startsWith(rok)).reduce((a, w) => a + v(w), 0), n: ws.length, ost: ws.map(w => String(w.data)).sort().pop() || '' }; })
    .map(r => ({ ...r, netto: r.wpl + r.wyp })).filter(r => r.n);
  const T = per.reduce((a, r) => ({ wpl: a.wpl + r.wpl, wyp: a.wyp + r.wyp, netto: a.netto + r.netto, rok: a.rok + r.rok, n: a.n + r.n }), { wpl: 0, wyp: 0, netto: 0, rok: 0, n: 0 });
  const sumaF = lista.reduce((a, w) => a + num(w.kwotaPLN), 0);
  const perTbl = table([
    { h: 'Konto', f: r => `<b>${esc(r.konto)}</b> <span class="mut" style="font-size:12px">${esc(r.typ || '')}</span>${fk === r.konto ? ' <span class="tag">wybrane</span>' : ''}` },
    { h: 'Wpłacono', n: 1, f: r => zlPLN(r.wpl) }, { h: 'Wypłacono', n: 1, f: r => r.wyp ? plPLN(r.wyp) : '<span class="mut">–</span>' },
    { h: 'Netto', n: 1, f: r => `<b>${zlPLN(r.netto)}</b>` }, { h: 'W ' + rok, n: 1, f: r => r.rok ? zlPLN(r.rok) : '<span class="mut">–</span>' },
    { h: 'Udział', n: 1, f: r => pct(T.netto ? r.netto / T.netto : 0) }, { h: 'Wpłat', n: 1, f: r => r.n }, { h: 'Ostatnia', f: r => esc(r.ost) },
  ], per.sort((a, b) => b.netto - a.netto), { empty: 'Brak wpłat', click: r => `FILT.wplKonto=FILT.wplKonto===${esc(JSON.stringify(r.konto))}?'':${esc(JSON.stringify(r.konto))};render()`,
    foot: ['Razem', zlPLN(T.wpl), T.wyp ? zlPLN(T.wyp) : '–', zlPLN(T.netto), T.rok ? zlPLN(T.rok) : '–', '100%', T.n, ''] });
  return ['Wpłaty i wypłaty', 'Wypłatę wpisz jako kwotę ujemną', `
    <div class="kpis">${kpi('Wpłacony kapitał', zlPLN(C.kapital), `${T.n} operacji na ${per.length} kontach`, 'main')}${kpi('Wpłacono', zlPLN(T.wpl))}${kpi('Wypłacono', T.wyp ? plPLN(T.wyp) : zlPLN(0))}${kpi('Wpłaty w ' + rok, zlPLN(T.rok))}${kpi('W dzisiejszych złotych', zlPLN(C.kapitalRealny), 'po inflacji')}</div>
    <div class="card"><h3>Podział na konta <small>kliknij konto, aby pokazać tylko jego wpłaty</small></h3>${perTbl}</div>
    <div class="card" style="margin-top:16px"><h3>Wpłacony kapitał narastająco <small>${fk ? esc(fk) + ' · <a onclick="FILT.wplKonto=\'\';render()">pokaż wszystkie konta</a>' : 'wszystkie konta'}</small></h3>${lineChart([{ name: fk || 'Kapitał', points: cum }], { area: true, pln: true, empty: 'Dodaj co najmniej dwie wpłaty' })}</div>
    <div class="card" style="margin-top:16px"><h3>Operacje <small>${fk ? esc(fk) + ' · ' : ''}${rows.length} poz. · razem ${zlPLN(sumaF)}</small></h3>${table([
      { h: 'Data', f: w => esc(w.data) }, { h: 'Konto', f: w => esc(w.konto) }, { h: 'Kwota PLN', n: 1, f: w => plPLN(num(w.kwotaPLN)) },
      { h: 'Kwota w walucie konta', n: 1, f: w => has(w.kwotaWal) ? nf2.format(num(w.kwotaWal)) : '–' }, { h: 'Notatka', f: w => esc(w.notatka) },
    ], rows, { empty: 'Brak wpłat', click: w => `editWplata('${w.id}')` })}</div>`,
    `<button class="btn" onclick="editWplata(null${fk ? `,'${esc(fk)}'` : ''})">＋ Wpłata</button>`];
}

function vPodatki() {
  const rok = +(FILT.rok || new Date().getFullYear());
  const P = C.podatki(rok, num(CFG.strataPrev[rok]), num(CFG.kryptoPrev[rok]));
  const opts = C.lata.map(y => `<option ${y === rok ? 'selected' : ''}>${y}</option>`).join('');
  const line = (l, v, b) => `<tr><td>${b ? '<b>' + l + '</b>' : l}</td><td class="n">${b ? '<b>' + v + '</b>' : v}</td></tr>`;
  return ['Podatki – PIT-38', 'Konta „Opodatkowane”; FIFO w ramach rachunku; kursy NBP z dnia przed transakcją', `
    <div class="filters"><select onchange="FILT.rok=this.value;render()">${opts}</select></div>
    ${P.brakKursow ? '<div class="alert">⚠ Część transakcji nie ma kursu NBP – użyto bieżącego kursu. Uzupełnij kursy, aby wynik był zgodny z PIT-38.</div>' : ''}
    <div class="kpis">${kpi('Podatek do zapłaty', zlPLN(P.razem, 0), 'za rok ' + rok, 'main')}${kpi('Dochód z papierów', plPLN(P.dochod))}${kpi('Dopłata od dywidend', zlPLN(P.dywDoplata, 0))}${kpi('Podatek od krypto', zlPLN(P.kPodatek, 0))}</div>
    <div class="grid g3">
      <div class="card"><h3>Papiery wartościowe</h3><table>${line('Przychód', zlPLN(P.przychod))}${line('Koszty uzyskania', zlPLN(P.koszty))}${line('Dochód / strata', zlPLN(P.dochod))}
        <tr><td>Strata z lat ubiegłych</td><td class="n"><input class="cell" type="number" value="${CFG.strataPrev[rok] || ''}" onchange="CFG.strataPrev[${rok}]=this.value;saveCfg();render()"></td></tr>
        ${line('Podstawa opodatkowania', zlPLN(P.podstawa, 0))}${line('Podatek ' + S.ustawienia.stawka + '%', zlPLN(P.podatekPap, 0), 1)}</table></div>
      <div class="card"><h3>Dywidendy zagraniczne</h3><table>${line('Przychód brutto', zlPLN(P.dywBrutto))}${line('Podatek pobrany za granicą', zlPLN(P.dywPobrany))}${line('Do dopłaty w Polsce', zlPLN(P.dywDoplata, 0), 1)}</table>
        <div class="mut" style="font-size:12px;margin-top:8px">USA z W-8BEN: 15% pobrane → dopłacasz 4%.</div></div>
      <div class="card"><h3>Kryptowaluty</h3><table>${line('Przychód', zlPLN(P.kPrzych))}${line('Koszty zakupu w roku', zlPLN(P.kKoszt))}
        <tr><td>Nadwyżka kosztów z lat ubiegłych</td><td class="n"><input class="cell" type="number" value="${CFG.kryptoPrev[rok] || ''}" onchange="CFG.kryptoPrev[${rok}]=this.value;saveCfg();render()"></td></tr>
        ${line('Dochód', zlPLN(P.kDochod))}${line('Nadwyżka na kolejny rok', zlPLN(P.kNadwyzka))}${line('Podatek', zlPLN(P.kPodatek, 0), 1)}</table></div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Sprzedaże w ${rok} (FIFO)</h3>${table([
      { h: 'Data', f: r => esc(r.data) }, { h: 'Instrument', f: r => `<b>${esc(r.ticker)}</b>` }, { h: 'Strategia', f: r => esc(r.strategia) },
      { h: 'Ilość', n: 1, f: r => nfq.format(r.ilosc) }, { h: 'Przychód PLN', n: 1, f: r => zlPLN(r.przychodPLN) }, { h: 'Koszt ' + WL(), n: 1, f: r => zlPLN(r.kosztPLN) },
      { h: 'Dochód PLN', n: 1, f: r => plPLN(r.zyskPLN) }, { h: '', f: r => r.kursOk ? '' : '<span class="warn">brak kursu</span>' },
    ], P.sprzedaze, { empty: 'Brak sprzedaży w tym roku', foot: ['Razem', '', '', '', zlPLN(P.przychod), zlPLN(P.koszty), zlPLN(P.dochod), ''] })}</div>
    <div class="mut" style="font-size:12px;margin-top:10px">Porównaj z PIT-8C od brokera. To pomoc w rozliczeniu, nie doradztwo podatkowe.</div>`, ' '];
}

function vInflacja() {
  const rows = S.inflacja.slice().sort((a, b) => String(b.miesiac).localeCompare(String(a.miesiac)));
  const asc = rows.slice().reverse();
  const yoy = key => asc.map((r, i) => { if (i < 11) return null; const w = asc.slice(i - 11, i + 1); if (w.some(x => !has(x[key]))) return null;
    return [r.miesiac + '-01', w.reduce((a, x) => a * (1 + num(x[key]) / 100), 1) - 1]; }).filter(Boolean);
  const yPL = yoy('mm'), yUS = yoy('mmUS'), yEA = yoy('mmEA');
  const lastPL = yPL[yPL.length - 1], lastUS = yUS[yUS.length - 1], lastEA = yEA[yEA.length - 1];
  const KRAJ = { PLN: 'PL', USD: 'USA', EUR: 'strefy euro' }[WAL()];
  const yoyMap = (arr) => Object.fromEntries(arr.map(([d, v]) => [d.slice(0, 7), v]));
  const mPL = yoyMap(yPL), mUS = yoyMap(yUS);
  return ['Inflacja', `Pobierana automatycznie raz dziennie z FRED · Polska: Eurostat HICP · USA: BLS CPI-U · strefa euro: Eurostat HICP${CFG.inflDay ? ' · aktualizacja ' + esc(CFG.inflDay) : ''}`, `
    <div class="kpis">${kpi('Inflacja r/r – Polska', lastPL ? pct(lastPL[1]) : '–', lastPL ? lastPL[0].slice(0, 7) : 'brak danych', 'main')}
      ${kpi('Inflacja r/r – USA', lastUS ? pct(lastUS[1]) : '–', lastUS ? lastUS[0].slice(0, 7) : 'brak danych')}
      ${kpi('Inflacja r/r – strefa euro', lastEA ? pct(lastEA[1]) : '–', lastEA ? lastEA[0].slice(0, 7) : 'brak danych')}
      ${kpi(`Wzrost cen (${KRAJ}) od 2015`, pct(C.inflNow - 1), C.inflLast ? 'do ' + C.inflLast : '')}
      ${kpi('Zysk realny portfela', pl(C.zyskRealny), pp(C.zyskRealnyPct) + ` ponad inflację ${KRAJ} (widok w ${WAL()})`)}</div>
    <div class="card"><h3>Inflacja r/r: Polska, USA, strefa euro</h3>${lineChart([{ name: 'Polska', points: yPL, color: '#EF5350' }, { name: 'USA', points: yUS, color: '#1565C0' }, ...(yEA.length ? [{ name: 'Strefa euro', points: yEA, color: '#F9A825' }] : [])], { pct: true, empty: 'Kliknij „Pobierz dane teraz”' })}</div>
    <div style="margin-top:16px"><button class="btn ghost" onclick="FILT.inflTab=!FILT.inflTab;render()">${FILT.inflTab ? '▲ Ukryj dane miesięczne' : '▼ Pokaż dane miesięczne'}</button></div>
    ${!FILT.inflTab ? '' : `<div class="card" style="margin-top:12px"><h3>Dane miesięczne<span class="sp"></span><small>możesz poprawić wartość ręcznie</small></h3>${table([
      { h: 'Miesiąc', f: r => esc(r.miesiac) },
      { h: 'Polska m/m %', n: 1, f: r => `<input class="cell" type="number" step="0.01" value="${esc(r.mm)}" onchange="setInfl('${esc(r.miesiac)}',this.value,'mm')">` },
      { h: 'Polska r/r', n: 1, f: r => mPL[r.miesiac] !== undefined ? pct(mPL[r.miesiac]) : '–' },
      { h: 'USA m/m %', n: 1, f: r => `<input class="cell" type="number" step="0.01" value="${esc(r.mmUS ?? '')}" onchange="setInfl('${esc(r.miesiac)}',this.value,'mmUS')">` },
      { h: 'USA r/r', n: 1, f: r => mUS[r.miesiac] !== undefined ? pct(mUS[r.miesiac]) : '–' },
    ], rows.slice(0, 120), { empty: 'Brak danych – kliknij „Pobierz dane teraz”' })}</div>`}
    <div class="mut" style="font-size:12px;margin-top:10px">Zysk realny liczony jest inflacją kraju wybranej waluty (przełącznik PLN / USD / EUR u góry): PLN – Polska, USD – USA, EUR – strefa euro. Dla Polski używany jest zharmonizowany wskaźnik HICP z Eurostatu – zwykle różni się od CPI GUS o kilka dziesiątych punktu procentowego. Dane pobierane z FRED (Federal Reserve Bank of St. Louis). Statystyki publikowane są z opóźnieniem ok. 2–6 tygodni, więc ostatni miesiąc zwykle jeszcze nie jest dostępny.</div>`,
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
      { h: 'Ticker', f: i => `<b>${esc(i.ticker)}</b>` }, { h: 'Nazwa', f: i => esc(i.nazwa) }, { h: 'Klasa', f: i => esc(i.klasa) },
      { h: 'Waluta', f: i => esc(i.waluta) }, { h: 'Symbol', f: i => `<span class="mut">${esc(i.symbol)}</span>` },
      { h: 'Cena auto', n: 1, f: i => has(i.cenaAuto) ? nf2.format(num(i.cenaAuto)) : '<span class="mut">–</span>' },
      { h: 'Cena ręczna', n: 1, f: i => isOS(i) ? (() => { const ps = C.pozycje.filter(p => p.ticker === i.ticker), w = ps.reduce((x, p) => x + p.wartosc, 0); return `${ps.length ? money(w, i.waluta) : '–'}<br><span class="mut" style="font-size:11px">wartość łączna – wpisujesz przy zakupach na stronie strategii</span>`; })()
        : `<input class="cell" type="number" step="any" value="${esc(i.cena)}" onclick="event.stopPropagation()" onchange="setCena('${i.id}',this.value)">` },
      { h: 'Data ceny', f: i => esc(i.dataCeny) },
      { h: 'Ilość w portfelu', n: 1, f: i => { const q = C.pozycje.filter(p => p.ticker === i.ticker).reduce((a, p) => a + p.ilosc, 0); return q ? nfq.format(q) : '–'; } },
      { h: '', f: i => `<a onclick="event.stopPropagation();editInstrument('${i.id}')">edytuj</a>` },
    ], rows, { empty: 'Brak instrumentów', drag: 'instrumenty' })}</div>
    <div class="mut" style="font-size:12px;margin-top:8px">⇅ Kolejność zmienisz, przeciągając wiersz myszką.</div>`,
    `${SYNC.token ? '<button class="btn ghost" onclick="refreshAutoPrices().then(()=>toast(\'Ceny odświeżone\'))">↻ Ceny z Google</button>' : ''}<button class="btn ghost" onclick="scalInstrumenty()">⇢ Scal instrumenty</button><button class="btn" onclick="editInstrument()">＋ Instrument</button>`];
}
// kilka instrumentów -> jeden (np. srebrne Pandy -> SREBRO); nazwa scalanego instrumentu trafia do notatki każdej transakcji
function scalInstrumenty() {
  if (S.instrumenty.length < 2) return toast('Za mało instrumentów');
  const pre = `<div class="chk"><div class="mut" style="font-size:12.5px;margin-bottom:6px">Instrumenty do scalenia (zostaną usunięte, a ich transakcje przeniesione; nazwa trafi do notatki):</div>${S.instrumenty.map(i => `<label><input type="checkbox" value="${esc(i.ticker)}"> <b>${esc(i.ticker)}</b> <span class="mut">${esc(i.nazwa)} · ${esc(i.waluta)}</span></label>`).join('')}</div>`;
  const form = modal('Scal instrumenty', [
    { k: 'cel', l: 'Scal do instrumentu', t: 'select', o: S.instrumenty.map(i => [i.ticker, `${i.ticker} – ${i.nazwa} (${i.waluta})`]), full: 1 },
  ], { cel: (S.instrumenty.find(i => /srebr/i.test(i.ticker)) || S.instrumenty[0]).ticker }, o => {
    const ts = [...form.closest('.modal').querySelectorAll('.chk input:checked')].map(x => x.value).filter(t => t !== o.cel);
    if (!ts.length) return 'Zaznacz instrumenty do scalenia (inne niż docelowy)';
    const cel = S.instrumenty.find(i => i.ticker === o.cel), inne = ts.map(t => S.instrumenty.find(i => i.ticker === t));
    const zlaW = inne.filter(i => i.waluta !== cel.waluta); if (zlaW.length) return `Inna waluta niż ${cel.ticker} (${cel.waluta}): ${zlaW.map(i => i.ticker).join(', ')}`;
    let n = 0;
    inne.forEach(i => {
      const opis = String(i.nazwa || i.ticker).replace(/^srebrna\s+/i, '').replace(/\s*\(1 oz\)$/i, '');
      S.transakcje.forEach(t => { if (t.ticker !== i.ticker) return; t.ticker = cel.ticker; n++;
        const stara = String(t.notatka || '').replace(/^Zapłacono [\d.,]+ zł$/, ''); t.notatka = opis + (stara ? ' · ' + stara : ''); });
      S.dywidendy.forEach(d => { if (d.ticker === i.ticker) d.ticker = cel.ticker; });
      (S.alerty || []).forEach(a => { if (a.ticker === i.ticker) a.ticker = cel.ticker; });
      S.cele.forEach(c => { const l = String(c.tickery || '').split(',').map(x => x.trim()).filter(Boolean).map(x => x === i.ticker ? cel.ticker : x); c.tickery = [...new Set(l)].join(','); });
    });
    S.instrumenty = S.instrumenty.filter(i => !ts.includes(i.ticker));
    changed('instrumenty', 'transakcje', 'dywidendy', 'cele', 'alerty'); toast(`Scalono ${ts.length} instrumentów do ${cel.ticker} · przeniesiono ${n} transakcji`);
  }, null, pre);
}

function vUstawienia() {
  const u = S.ustawienia;
  const g = CFG.sheetId ? `<p>Arkusz: <a href="${esc(CFG.sheetUrl || ('https://docs.google.com/spreadsheets/d/' + CFG.sheetId))}" target="_blank">otwórz „Portfel – dane” ↗</a></p>` : '';
  const kontaTbl = table([
    { h: 'Konto', f: k => `<b>${esc(k.nazwa)}</b>` }, { h: 'Typ podatkowy', f: k => esc(k.typ) }, { h: 'Waluta', f: k => esc(k.waluta) },
    { h: 'Gotówka', n: 1, f: k => { const c = C.konta.find(x => x.id === k.id); return money(c.gotowkaKwota, k.waluta) + (c.gotowkaAuto ? '' : ' <span class="warn">(ręcznie)</span>'); } }, { h: 'W „Całym portfelu”', f: k => esc(k.model) },
    { h: 'Wartość', n: 1, f: k => zl(C.konta.find(x => x.id === k.id)?.razem || 0, 0) },
  ], S.konta, { click: k => `editKonto('${k.id}')`, drag: 'konta' });
  const ck = FILT.celeKonto || ''; const celeRows = S.cele.filter(c => (c.konto || '') === ck);
  const celeSel = `<select onchange="FILT.celeKonto=this.value;render()"><option value="">Cały portfel</option>${S.konta.map(k => `<option ${k.nazwa === ck ? 'selected' : ''}>${esc(k.nazwa)}</option>`).join('')}</select>`;
  const celeTbl = table([
    { h: 'Koszyk', f: c => `<b>${esc(c.koszyk)}</b>` }, { h: 'Instrumenty', f: c => esc(String(c.tickery || c.koszyk).split(',').join(', ')) },
    { h: 'Grupa', f: c => esc(c.grupa) }, { h: 'Cel', n: 1, f: c => num(c.cel) + '%' },
  ], celeRows, { click: c => `editCel('${c.id}')`, empty: 'Brak koszyków – kliknij „＋ Koszyk”', foot: celeRows.length ? ['Suma', '', '', celeRows.reduce((a, c) => a + num(c.cel), 0) + '%'] : null });
  return ['Ustawienia', 'Konta, kursy walut, alokacja docelowa, połączenie z Google Sheets i kopia zapasowa', `
    <div class="grid g2e">
      <div class="card"><h3>Google Sheets</h3>
        <p class="mut" style="margin-top:0">Dane zapisują się w Twoim arkuszu Google (tylko Ty masz do niego dostęp). Instrukcja zdobycia Client ID jest w pliku README.</p>
        <div class="form"><label class="full">Google OAuth Client ID<input id="cid" value="${esc(CFG.clientId)}" placeholder="123456-abc.apps.googleusercontent.com"></label>
        <label class="full">ID arkusza (puste = aplikacja utworzy nowy)<input id="sid" value="${esc(CFG.sheetId)}" placeholder="z adresu docs.google.com/spreadsheets/d/<ID>/edit"><span class="help">Możesz wkleić ID własnego arkusza (z adresu między /d/ a /edit) – aplikacja sama doda w nim zakładki. Na drugim urządzeniu wklej to samo ID.</span></label></div>
        ${g}<div class="actions" style="justify-content:flex-start">
          <button class="btn" onclick="const nid=$('#sid').value.trim();if(nid!==CFG.sheetId){CFG.createdByApp=false;tokenClient=null;SYNC.token=null;}CFG.clientId=$('#cid').value.trim();CFG.sheetId=nid;saveCfg();googleConnect(true).then(ok=>{if(ok)toast('Połączono z Google Sheets');render()})">${SYNC.token ? 'Połącz ponownie' : 'Zaloguj przez Google'}</button>
          ${SYNC.token ? '<button class="btn ghost" onclick="buildSummary(true).then(()=>buildAnalizy(true)).then(()=>toast(\'Zakładki Podsumowanie i Analizy w arkuszu odświeżone\')).catch(e=>toast(e.message))">▦ Odśwież Podsumowanie w arkuszu</button><button class="btn ghost" onclick="syncNow()">↻ Synchronizuj teraz</button><button class="btn danger" onclick="googleDisconnect();render()">Rozłącz</button>' : ''}</div></div>
      <div class="card"><h3>Kursy walut (bieżące, do wyceny)</h3>
        <div class="form">${Object.keys(u.kursy).map(c => `<label>${c}/PLN<input type="number" step="any" value="${esc(u.kursy[c])}" onchange="S.ustawienia.kursy['${c}']=this.value;changed('ustawienia');render()"></label>`).join('')}</div>
        <div class="actions" style="justify-content:flex-start"><button class="btn ghost" onclick="pobierzKursy()">↻ Pobierz z NBP</button><span class="mut">${u.kursyData ? 'Tabela NBP z ' + esc(u.kursyData) : ''}</span></div>
        <div class="form" style="margin-top:10px"><label>Stawka podatku Belki %<input type="number" value="${esc(u.stawka)}" onchange="S.ustawienia.stawka=num(this.value)||19;changed('ustawienia');render()"></label></div></div>
    </div>
    <div class="grid g2e" style="margin-top:16px">
      <div class="card"><h3>Konta<span class="sp"></span><button class="btn sm" onclick="editKonto()">＋ Konto</button></h3>${kontaTbl}
        <div class="mut" style="font-size:12px;margin-top:8px">„Opodatkowane” wchodzi do PIT-38. IKE/IKZE i „Poza PIT-38” są pomijane. Gotówka liczy się sama z wpłat i transakcji (możesz ją nadpisać ręcznie).</div></div>
      <div class="card"><h3>Portfel docelowy<span class="sp"></span>${celeSel}<button class="btn sm" onclick="editCel()">＋ Koszyk</button></h3>${celeTbl}
        <div class="mut" style="font-size:12px;margin-top:8px">Każde konto może mieć własny portfel docelowy, a „Cały portfel” liczy wszystkie konta z „W modelu” = TAK. Koszyk może zawierać kilka instrumentów (np. CORE = CSPX + IWDA).</div>
        ${ck ? '' : `<div class="row" style="margin-top:8px"><span class="mut" style="font-size:12px">Skopiuj ten portfel do konta:</span><select id="cpyTo">${S.konta.map(k => `<option>${esc(k.nazwa)}</option>`).join('')}</select><button class="btn sm ghost" onclick="kopiujCele('',$('#cpyTo').value)">Kopiuj</button></div>`}</div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Kopia zapasowa</h3>
      <div class="row"><button class="btn ghost" onclick="exportJSON()">⬇ Eksport (plik JSON)</button><button class="btn ghost" onclick="exportCSV()">⬇ Transakcje do Excela (CSV)</button>
      <button class="btn ghost" onclick="FILT.impTab='csv';go('import')">⬆ Import transakcji (CSV)</button>
      <label class="btn ghost" style="cursor:pointer">⬆ Import z pliku<input type="file" accept=".json" style="display:none" onchange="importJSON(this.files[0])"></label>
      <span class="sp" style="flex:1"></span><button class="btn danger" onclick="resetAll()">Wyczyść dane w przeglądarce</button></div></div>
    <div class="card" style="margin-top:16px"><h3>Tryb demonstracyjny</h3>
      <p class="mut" style="margin-top:0">Wczytaj przykładowy portfel (7 strategii na 6 kontach, transakcje, dywidendy, wpłaty, historia, portfele docelowe dla kilku kont), żeby zobaczyć, jak działa aplikacja. Twoje dane zostają odłożone i wracają jednym kliknięciem. W trybie demo nic nie zapisuje się w arkuszu Google.</p>
      ${CFG.demo ? '<button class="btn" onclick="wyjdzDemo()">↩ Wróć do moich danych</button>' : '<button class="btn" onclick="wejdzDemo()">🧪 Wczytaj przykładowy portfel</button>'}</div>`, ' '];
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
function editTransakcja(id, strategia, preset) {
  const t = S.transakcje.find(x => x.id === id) || { data: todayStr(), typ: 'KUPNO', strategia: strategia || (S.strategie[0] || {}).nazwa, ticker: (S.instrumenty[0] || {}).ticker, ...(preset || {}) };
  const lotyOpc = [['', 'najstarszy zakup (FIFO)']];
  (C ? C.pozycje : []).forEach(p => p.loty.forEach(l => lotyOpc.push([l.id, `${p.ticker} · ${p.strategia} · zakup ${l.data} · ${nfq.format(l.ilosc)} szt. po ${nf2.format(l.cenaZakupu)}`])));
  if (t.zakup && !lotyOpc.some(o => o[0] === t.zakup)) { const b = S.transakcje.find(x => x.id === t.zakup); lotyOpc.push([t.zakup, b ? `${b.ticker} · zakup ${b.data} · ${nfq.format(num(b.ilosc))} szt.` : 'zakup ' + t.zakup]); }
  if (!S.instrumenty.length) { toast('Najpierw dodaj instrument'); return editInstrument(); }
  const form = modal(id ? 'Edytuj transakcję' : 'Nowa transakcja', [
    { k: 'data', l: 'Data', t: 'date' }, { k: 'typ', l: 'Typ', t: 'select', o: ['KUPNO', 'SPRZEDAŻ'] },
    { k: 'strategia', l: 'Strategia', t: 'select', o: S.strategie.map(s => s.nazwa) },
    { k: 'ticker', l: 'Instrument', t: 'select', o: S.instrumenty.map(i => [i.ticker, `${i.ticker} – ${i.nazwa} (${i.waluta})`]) },
    { k: 'ilosc', l: 'Ilość', t: 'number' }, { k: 'cena', l: 'Cena za sztukę (waluta instrumentu)', t: 'number' },
    { k: 'wartosc', l: 'Wartość łącznie (PLN)', t: 'number', help: 'Kupno: ile zapłaciłeś za wszystkie obligacje. Sprzedaż/wykup: ile dostałeś.' },
    { k: 'prowizja', l: 'Prowizja (waluta instrumentu)', t: 'number', ph: '0' }, { k: 'kurs', l: 'Kurs NBP (D-1)', t: 'number', help: 'Pobiera się automatycznie z NBP' },
    { k: 'zakup', l: 'Zamyka zakup (tylko sprzedaż)', t: 'select', o: lotyOpc, full: 1, help: 'Pokazuje w aplikacji, który zakup zamykasz. Podatek PIT-38 i tak liczy się metodą FIFO (wymóg ustawy).' },
    { k: 'notatka', l: 'Notatka', full: 1 },
  ], { ...t, wartosc: t.wartosc ?? (id && isOS(S.instrumenty.find(i => i.ticker === t.ticker)) ? r2(num(t.ilosc) * num(t.cena) + num(t.prowizja)) : '') }, o => {
    if (!o.data || !o.ticker || !(o.ilosc > 0)) return 'Uzupełnij datę, instrument i ilość';
    if (o.typ === 'KUPNO') o.zakup = '';
    const ins = S.instrumenty.find(i => i.ticker === o.ticker);
    if (isOS(ins)) {
      if (!(o.wartosc > 0)) return 'Podaj wartość łącznie (PLN)';
      // nowy zakup przy wpisanej już aktualnej wartości: dokładamy go po cenie zakupu, żeby nie zmienić wyceny starszych obligacji
      if (o.typ === 'KUPNO' && !id && has(ins.cena)) { const q = qtyOf(o.ticker); ins.cena = (num(ins.cena) * q + o.wartosc) / (q + o.ilosc); changed('instrumenty'); }
      o.cena = o.wartosc / o.ilosc; o.prowizja = ''; o.kurs = '';
    }
    delete o.wartosc;
    if (id) Object.assign(t, o); else S.transakcje.push({ id: uid(), ...o });
    changed('transakcje'); toast('Zapisano transakcję');
  }, id ? () => { S.transakcje = S.transakcje.filter(x => x.id !== id); changed('transakcje'); } : null);
  wireNbp(form, 'data', 'ticker');
  const showOS = () => { const os = isOS(S.instrumenty.find(i => i.ticker === form.elements.ticker.value));
    [['cena', !os], ['prowizja', !os], ['kurs', !os], ['wartosc', os]].forEach(([k, on]) => { form.elements[k].closest('label').style.display = on ? '' : 'none'; });
    form.elements.ilosc.closest('label').firstChild.textContent = os ? 'Ilość obligacji (szt.)' : 'Ilość'; };
  form.elements.ticker.addEventListener('change', showOS); showOS();
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
function togglePrzew(id) {
  const k = S.konta.find(x => x.id === id); if (!k) return;
  k.przew = num(k.przew) > 0 ? '' : 0.5; changed('konta'); render();
  toast(k.przew ? 'Wycena po przewalutowaniu 0,5% (jak XTB) – stawkę zmienisz w „Edytuj konto”' : 'Wycena bez przewalutowania');
}
function editKonto(id) {
  const k = S.konta.find(x => x.id === id) || { typ: 'Opodatkowane', waluta: 'PLN', model: 'TAK' }; const old = k.nazwa;
  modal(id ? 'Edytuj konto' : 'Nowe konto', [
    { k: 'nazwa', l: 'Nazwa', full: 1 }, { k: 'typ', l: 'Typ podatkowy', t: 'select', o: ['Opodatkowane', 'IKE', 'IKZE', 'Poza PIT-38'] },
    { k: 'waluta', l: 'Waluta', t: 'select', o: ['PLN', 'USD', 'EUR', 'GBP', 'CHF'] }, { k: 'gotowka', l: 'Gotówka – tylko gdy chcesz wpisać ręcznie (puste = liczona automatycznie)', t: 'number', full: 1 },
    { k: 'model', l: 'Wliczaj do portfela docelowego „Cały portfel”', t: 'select', o: ['TAK', 'NIE'] },
    { k: 'przew', l: 'Przewalutowanie % (np. 0,5 dla XTB; puste = brak)', t: 'number', help: 'Instrumenty w innej walucie niż konto są wyceniane po odjęciu tej prowizji – tak jak pokazuje XTB' },
  ], k, o => {
    if (!o.nazwa) return 'Podaj nazwę';
    if (id) { Object.assign(k, o); if (old !== o.nazwa) { S.strategie.forEach(s => { if (s.konto === old) s.konto = o.nazwa; }); S.wplaty.forEach(w => { if (w.konto === old) w.konto = o.nazwa; }); S.cele.forEach(c => { if (c.konto === old) c.konto = o.nazwa; }); changed('strategie', 'wplaty', 'cele'); } }
    else { if (S.konta.some(x => x.nazwa === o.nazwa)) return 'Konto o tej nazwie już istnieje'; const n = { id: uid(), ...o }; S.konta.push(n); setTimeout(() => go('konto', n.id), 0); }
    changed('konta');
  }, id ? () => {
    const uzywa = S.strategie.filter(s => s.konto === old).map(s => s.nazwa);
    if (uzywa.length) { toast('Najpierw przypisz inne konto strategiom: ' + uzywa.join(', ')); return; }
    const w = S.wplaty.filter(x => x.konto === old).length;
    if (w && !confirm(`Na tym koncie jest ${w} wpłat – zostaną usunięte razem z kontem. Kontynuować?`)) return;
    S.wplaty = S.wplaty.filter(x => x.konto !== old); S.cele = S.cele.filter(c => c.konto !== old); S.konta = S.konta.filter(x => x.id !== id); changed('konta', 'wplaty', 'cele'); go('kokpit');
  } : null);
}
function editInstrument(id) {
  const i = S.instrumenty.find(x => x.id === id) || { klasa: 'Akcje/ETF', waluta: 'USD' }; const old = i.ticker;
  const pre = `<div class="search"><div class="row"><input id="sq" placeholder="Szukaj: nazwa lub ticker, np. cspx, orlen, złoto, bitcoin" style="flex:1">
    <button class="btn" id="sbtn" type="button">Szukaj</button></div><div id="sres" class="sres"></div></div>`;
  const form = modal(id ? 'Edytuj instrument' : 'Nowy instrument', [
    { k: 'ticker', l: 'Ticker' }, { k: 'nazwa', l: 'Nazwa' },
    { k: 'klasa', l: 'Klasa aktywów', t: 'select', o: KLASY },
    { k: 'waluta', l: 'Waluta notowań', t: 'select', o: ['USD', 'PLN', 'EUR', 'GBP', 'CHF'] },
    { k: 'symbol', l: 'Symbol ceny', ph: 'uzupełni się po wyszukaniu – albo wpisz ręcznie' },
    { k: 'cena', l: 'Cena ręczna (opcjonalnie)', t: 'number', help: 'Obligacje skarbowe: wybierz klasę „Obligacje skarbowe” i zostaw puste – aktualną wartość wpisujesz przy pozycji na stronie strategii' }, { k: 'dataCeny', l: 'Data ceny', t: 'date' },
  ], i, o => {
    if (!o.ticker) return 'Podaj ticker';
    if (S.instrumenty.some(x => x.ticker === o.ticker && x.id !== id)) return 'Taki ticker już istnieje';
    if (id) { Object.assign(i, o); if (old !== o.ticker) { S.transakcje.forEach(t => { if (t.ticker === old) t.ticker = o.ticker; }); S.dywidendy.forEach(d => { if (d.ticker === old) d.ticker = o.ticker; });
      S.cele.forEach(c => { c.tickery = String(c.tickery || '').split(',').map(t => t.trim() === old ? o.ticker : t.trim()).join(','); }); changed('transakcje', 'dywidendy', 'cele'); } }
    else S.instrumenty.push({ id: uid(), cenaAuto: '', ...o });
    changed('instrumenty');
  }, id ? () => { if (S.transakcje.some(t => t.ticker === old)) { toast('Instrument ma transakcje'); return; } S.instrumenty = S.instrumenty.filter(x => x.id !== id); changed('instrumenty'); } : null, pre);
  wireSearch(form, !!id);
}
const KLASY = ['Akcje/ETF', 'Obligacje', 'Obligacje skarbowe', 'Gotówka', 'Złoto', 'Srebro', 'Krypto', 'Nieruchomości', 'Inne'];
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
        toast('Uzupełniono dane – sprawdź i kliknij Zapisz');
      });
    } catch (e) { out.innerHTML = `<div class="warn">${esc(e.message)}. Możesz wpisać dane ręcznie.</div>`; }
    finally { btn.disabled = false; }
  };
  btn.onclick = run; q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  if (!SYNC.token) out.innerHTML = '<div class="mut">Wyszukiwanie działa po połączeniu z Google Sheets (plakietka u góry). Bez tego wpisz dane ręcznie.</div>';
}
function editCel(id) {
  const c = S.cele.find(x => x.id === id) || { konto: FILT.celeKonto || '' };
  const sel = new Set(String(c.tickery || c.koszyk || '').split(',').map(s => s.trim()).filter(Boolean));
  const pre = `<div class="mut" style="font-size:12.5px;margin-bottom:10px">Portfel: <b>${esc(c.konto || 'Cały portfel')}</b></div>`;
  const form = modal(id ? 'Edytuj koszyk' : 'Nowy koszyk', [
    { k: 'koszyk', l: 'Nazwa koszyka (np. CORE, CSPX, ZŁOTO)' }, { k: 'grupa', l: 'Grupa (opcjonalnie)' }, { k: 'cel', l: 'Cel %', t: 'number' },
  ], c, o => {
    const ts = [...form.closest('.modal').querySelectorAll('.chk input:checked')].map(x => x.value);
    if (!o.koszyk) return 'Podaj nazwę koszyka';
    if (!ts.length) return 'Zaznacz co najmniej jeden instrument';
    const inny = S.cele.find(x => x.id !== id && (x.konto || '') === (c.konto || '') && String(x.tickery || x.koszyk).split(',').some(t => ts.includes(t.trim())));
    if (inny) return `Instrument jest już w koszyku „${inny.koszyk}” tego portfela`;
    o.tickery = ts.join(','); o.konto = c.konto || '';
    if (id) Object.assign(c, o); else S.cele.push({ id: uid(), ...o }); changed('cele');
  }, id ? () => { S.cele = S.cele.filter(x => x.id !== id); changed('cele'); } : null,
  pre + `<div class="chk"><div class="mut" style="font-size:12.5px;margin-bottom:6px">Instrumenty w koszyku:</div>${S.instrumenty.map(i => `<label><input type="checkbox" value="${esc(i.ticker)}" ${sel.has(i.ticker) ? 'checked' : ''}> <b>${esc(i.ticker)}</b> <span class="mut">${esc(i.nazwa)}</span></label>`).join('')}</div>`);
}
function kopiujCele(from, to) {
  if (S.cele.some(c => c.konto === to) && !confirm(`Konto ${to} ma już portfel docelowy – zastąpić?`)) return;
  S.cele = S.cele.filter(c => c.konto !== to).concat(S.cele.filter(c => (c.konto || '') === from).map(c => ({ ...c, id: uid(), konto: to })));
  changed('cele'); FILT.celeKonto = to; render(); toast('Skopiowano portfel docelowy do ' + to);
}
function migrateCele() {
  let ch = false;
  S.cele.forEach(c => { if (c.konto === undefined) { c.konto = ''; ch = true; }
    if (!c.tickery) { const ts = S.instrumenty.filter(i => i.koszyk && i.koszyk === c.koszyk).map(i => i.ticker); c.tickery = ts.length ? ts.join(',') : c.koszyk; ch = true; } });
  if (ch) changed('cele');
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
/* ===================== IMPORT: zakładki XTB / inny plik ===================== */
function vImport() {
  const tab = FILT.impTab || 'xtb';
  const seg = `<div class="seg" style="margin-bottom:16px">${[['xtb', 'XTB (wyciąg operacji gotówkowych)'], ['csv', 'Inny plik (CSV)']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" onclick="FILT.impTab='${k}';render()">${l}</button>`).join('')}</div>`;
  const [, sub, html, act] = tab === 'csv' ? vImportCsv() : vImportXtb();
  return ['Import', sub, seg + html, act];
}
/* import transakcji z CSV (własny plik albo eksport z aplikacji); wybierasz konto i strategię, brakujące instrumenty są zakładane */
let CIMP = null;   // { konto, strategia ('' = z pliku), plik, tx, blad }
const TXCSV = { data: /^data$/i, konto: /^konto$/i, strategia: /^strategia$/i, typ: /^typ$/i, ticker: /^ticker$/i, nazwa: /^nazwa$/i, klasa: /^klasa$/i,
  waluta: /^waluta$/i, symbol: /^symbol/i, ilosc: /^ilo[śs][ćc]/i, cena: /^cena/i, prowizja: /^prowizja/i, kurs: /^kurs/i, notatka: /^notatka/i, kwota: /^kwota/i };
function txcsvParse(text) {
  const rows = readCsv(text).CSV.filter(r => r.some(c => String(c).trim()));
  const head = (rows[0] || []).map(c => String(c).trim()), ci = {}; Object.entries(TXCSV).forEach(([k, re]) => ci[k] = head.findIndex(h => re.test(h)));
  if (ci.data < 0 || ((ci.ticker < 0 || ci.ilosc < 0 || ci.cena < 0) && ci.kwota < 0)) throw new Error('w pierwszym wierszu brakuje kolumn Data / Ticker / Ilość / Cena (albo Kwota dla wpłat)');
  const g = (r, k) => ci[k] >= 0 ? String(r[ci[k]] ?? '').trim() : '';
  const wplT = r => /wp[łl]at|deposit|withdraw/i.test(g(r, 'typ'));
  const wpl = rows.slice(1).filter(wplT).map(r => { const k = num(g(r, 'kwota')); return { kind: 'wpl', data: xtbDate(g(r, 'data')), typ: /wyp[łl]at|withdraw/i.test(g(r, 'typ')) ? 'WYPŁATA' : 'WPŁATA',
    kwota: /wyp[łl]at|withdraw/i.test(g(r, 'typ')) ? -Math.abs(k) : k, ticker: '', notatka: g(r, 'notatka'), wybrane: true }; }).filter(w => w.data && w.kwota);
  const tx = rows.slice(1).filter(r => !wplT(r)).map(r => ({ kind: 'tx', data: xtbDate(g(r, 'data')), strategiaPlik: g(r, 'strategia'), typ: /sprz/i.test(g(r, 'typ')) ? 'SPRZEDAŻ' : 'KUPNO',
    ticker: g(r, 'ticker'), nazwa: g(r, 'nazwa'), klasa: g(r, 'klasa'), waluta: g(r, 'waluta').toUpperCase(), symbol: g(r, 'symbol'),
    ilosc: num(g(r, 'ilosc')), cena: num(g(r, 'cena')), prowizja: g(r, 'prowizja') ? num(g(r, 'prowizja')) : '', kurs: g(r, 'kurs') ? num(g(r, 'kurs')) : '', notatka: g(r, 'notatka'), wybrane: true }))
    .filter(t => t.data && t.ticker && t.ilosc > 0);
  const all = tx.concat(wpl).sort((a, b) => a.data.localeCompare(b.data) || (a.kind === 'wpl' ? -1 : 1));
  if (!all.length) throw new Error('nie znaleziono transakcji ani wpłat');
  return all;
}
const txcsvJest = t => t.kind === 'wpl' ? S.wplaty.some(w => w.data === t.data && w.konto === (CIMP || {}).konto && Math.abs(num(w.kwotaPLN) - t.kwota) < 0.005) : S.transakcje.some(x => x.data === t.data && x.ticker === t.ticker && x.typ === t.typ && Math.abs(num(x.ilosc) - t.ilosc) < 1e-9 && Math.abs(num(x.cena) - t.cena) < 1e-6);
async function txcsvWczytaj(file) {
  if (!file) return; CIMP.plik = file.name; CIMP.blad = ''; CIMP.tx = null;
  try { CIMP.tx = txcsvParse(await file.text()); CIMP.tx.forEach(t => { if (txcsvJest(t)) t.wybrane = false; });
    const zPliku = [...new Set(CIMP.tx.map(t => t.strategiaPlik).filter(Boolean))];
    if (zPliku.length) CIMP.strategia = '';   // plik ma strategie – domyślnie użyj ich
  } catch (e) { CIMP.blad = e.message; }
  render();
}
function vImportCsv() {
  const konta = S.konta;
  if (!CIMP) CIMP = { konto: (konta[0] || {}).nazwa || '', strategia: null };
  const strat = S.strategie.filter(s => s.konto === CIMP.konto);
  if (CIMP.strategia === null || (CIMP.strategia && !strat.some(s => s.nazwa === CIMP.strategia))) CIMP.strategia = (strat[0] || {}).nazwa || '';
  const tx = CIMP.tx || [], txT = tx.filter(t => t.kind === 'tx'), maPlikStrat = tx.some(t => t.strategiaPlik);
  const stratOf = t => CIMP.strategia || t.strategiaPlik || (strat[0] || {}).nazwa || 'Import';
  const stratOpts = strat.map(s => [s.nazwa, s.nazwa]).concat([['', maPlikStrat ? 'z pliku (kolumna Strategia) – brakujące zostaną założone na tym koncie' : 'nowa strategia „Import” na tym koncie']]);
  const step1 = `<div class="card"><h3>1. Konto, strategia i plik</h3>
    <div class="form" style="grid-template-columns:1fr 1fr 1fr">
      <label>Konto, na które wgrywasz<select onchange="CIMP.konto=this.value;CIMP.strategia=null;render()">${konta.map(k => `<option ${k.nazwa === CIMP.konto ? 'selected' : ''}>${esc(k.nazwa)}</option>`).join('')}</select>
        <span class="help">Waluta konta: ${esc((konta.find(k => k.nazwa === CIMP.konto) || {}).waluta || '–')} · <a onclick="editKonto()">＋ nowe konto</a></span></label>
      <label>Strategia<select onchange="CIMP.strategia=this.value;render()">${stratOpts.map(([v, l]) => `<option value="${esc(v)}" ${v === CIMP.strategia ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <span class="help"><a onclick="editStrategia(null,'${esc(CIMP.konto)}')">＋ nowa strategia</a></span></label>
      <label>Plik CSV<input type="file" accept=".csv,.txt" onchange="txcsvWczytaj(this.files[0]);this.value=''"><span class="help">${CIMP.plik ? '✓ ' + esc(CIMP.plik) : 'Czytany tylko w Twojej przeglądarce'}</span></label></div>
    ${CIMP.blad ? `<div class="warn" style="margin-top:8px">${esc(CIMP.blad)}</div>` : ''}
    <div class="mut" style="font-size:12px;margin-top:8px">Kolumny (pierwszy wiersz, kolejność dowolna, separator ; lub ,): <b>Data; Ticker; Ilość; Cena</b> – wymagane · Typ (KUPNO/SPRZEDAŻ, domyślnie KUPNO); Nazwa; Klasa; Waluta; Symbol – do założenia nowego instrumentu · Prowizja; Kurs (puste = NBP z dnia przed transakcją); Strategia; Notatka. Wpłata/wypłata: wiersz z Typ = WPŁATA lub WYPŁATA i kolumną <b>Kwota</b> (PLN) – trafi na wybrane konto. Pasuje też plik z „Transakcje do Excela (CSV)”.</div></div>`;
  if (!tx.length) return ['Import', 'Transakcje z dowolnego pliku CSV', step1, ' '];
  const wyb = tx.filter(t => t.wybrane && t.kind === 'tx'), wybW = tx.filter(t => t.wybrane && t.kind === 'wpl'), nInstr = [...new Set(wyb.map(t => t.ticker))].filter(tk => !S.instrumenty.some(i => i.ticker === tk));
  const nStrat = [...new Set(wyb.map(stratOf))].filter(sn => !S.strategie.some(s => s.nazwa === sn));
  const tbl = table([
    { h: `<input type="checkbox" ${tx.every(t => t.wybrane) ? 'checked' : ''} onchange="CIMP.tx.forEach(t=>t.wybrane=this.checked);render()">`, f: t => `<input type="checkbox" ${t.wybrane ? 'checked' : ''} onchange="CIMP.tx[${tx.indexOf(t)}].wybrane=this.checked;render()">` },
    { h: 'Data', f: t => esc(t.data) }, { h: 'Typ', f: t => esc(t.typ) }, { h: 'Instrument', f: t => t.kind === 'wpl' ? `<span class="mut">wpłata na konto ${esc(CIMP.konto)}</span>` : `<b>${esc(t.ticker)}</b> <span class="mut" style="font-size:12px">${esc(t.nazwa)}</span>${nInstr.includes(t.ticker) ? ' <span class="tag">nowy</span>' : ''}` },
    { h: 'Strategia', f: t => t.kind === 'wpl' ? '<span class="mut">–</span>' : esc(stratOf(t)) }, { h: 'Ilość', n: 1, f: t => t.kind === 'wpl' ? '' : nfq.format(t.ilosc) },
    { h: 'Cena / kwota', n: 1, f: t => t.kind === 'wpl' ? plPLN(t.kwota) : nf2.format(t.cena) + ' ' + esc(t.waluta || (S.instrumenty.find(i => i.ticker === t.ticker) || {}).waluta || '') },
    { h: 'Kurs', n: 1, f: t => t.kind === 'wpl' ? '' : t.kurs === '' ? '<span class="mut">NBP</span>' : String(t.kurs).replace('.', ',') }, { h: 'Notatka', f: t => esc(t.notatka) },
    { h: 'Status', f: t => txcsvJest(t) ? '<span class="mut">już jest</span>' : '<span class="pos">nowa</span>' },
  ], tx);
  const step2 = `<div class="card" style="margin-top:16px"><h3>2. Operacje <small>${wyb.length} transakcji${wybW.length ? ` + ${wybW.length} wpłat (${zlPLN(wybW.reduce((a, w) => a + w.kwota, 0))})` : ''} z ${tx.length}</small><span class="sp"></span>
      <button class="btn ghost sm" onclick="CIMP=null;render()">Anuluj</button><button class="btn" ${(wyb.length || wybW.length) && CIMP.konto ? '' : 'disabled'} onclick="txcsvImportuj()">Importuj ${wyb.length + wybW.length} operacji na ${esc(CIMP.konto)}</button></h3>
    ${nInstr.length || nStrat.length ? `<div class="alert info">${nInstr.length ? `Nowe instrumenty: <b>${nInstr.map(esc).join(', ')}</b>. ` : ''}${nStrat.length ? `Nowe strategie na koncie ${esc(CIMP.konto)}: <b>${nStrat.map(esc).join(', ')}</b>.` : ''}</div>` : ''}${tbl}</div>`;
  return ['Import', 'Transakcje z dowolnego pliku CSV', step1 + step2, ' '];
}
async function txcsvImportuj() {
  const strat = S.strategie.filter(s => s.konto === CIMP.konto), stratOf = t => CIMP.strategia || t.strategiaPlik || (strat[0] || {}).nazwa || 'Import';
  const sel = CIMP.tx.filter(t => t.wybrane && !txcsvJest(t)), wyb = sel.filter(t => t.kind === 'tx'), wybW = sel.filter(t => t.kind === 'wpl');
  if (!sel.length) return toast('Nic nowego do zaimportowania');
  wybW.forEach(w => S.wplaty.push({ id: uid(), data: w.data, konto: CIMP.konto, kwotaPLN: w.kwota, kwotaWal: '', notatka: w.notatka }));
  toast('Importuję…');
  let ni = 0, ns = 0;
  wyb.forEach(t => { if (!S.instrumenty.some(i => i.ticker === t.ticker)) { ni++;
    S.instrumenty.push({ id: uid(), ticker: t.ticker, nazwa: t.nazwa || t.ticker, klasa: KLASY.includes(t.klasa) ? t.klasa : 'Inne', waluta: t.waluta || 'PLN', cena: '', dataCeny: '', symbol: t.symbol, cenaAuto: '' }); }
    const sn = stratOf(t); if (!S.strategie.some(s => s.nazwa === sn)) { ns++; S.strategie.push({ id: uid(), nazwa: sn, konto: CIMP.konto, kapital: '', opis: '', kolor: PAL[S.strategie.length % PAL.length] }); } });
  for (const t of wyb) {
    const cur = (S.instrumenty.find(i => i.ticker === t.ticker) || {}).waluta || 'PLN';
    let kurs = t.kurs; if (cur !== 'PLN' && kurs === '') { try { kurs = await nbpRate(cur, t.data); } catch (e) { kurs = ''; } }
    S.transakcje.push({ id: uid(), data: t.data, strategia: stratOf(t), typ: t.typ, ticker: t.ticker, ilosc: t.ilosc, cena: t.cena, prowizja: t.prowizja, kurs: cur === 'PLN' ? '' : kurs, notatka: t.notatka, zakup: '' });
  }
  changed('instrumenty', 'strategie', 'transakcje', 'wplaty'); const k = CIMP.konto; CIMP = null; render();
  toast(`Zaimportowano ${wyb.length} transakcji${wybW.length ? ` i ${wybW.length} wpłat` : ''} na ${k}${ni ? ` · nowe instrumenty: ${ni}` : ''}${ns ? ` · nowe strategie: ${ns}` : ''}`);
}
function resetAll() { if (!confirm('Usunąć wszystkie dane z tej przeglądarki? (arkusz Google zostaje bez zmian)')) return; S = defaultState(); DIRTY = new Set(); saveLocal(); render(); }

/* ---------- zmiana kolejności przeciąganiem ---------- */
let DRAG = null;
document.addEventListener('dragstart', e => { const el = e.target.closest && e.target.closest('[data-drag]'); if (!el) return;
  DRAG = { list: el.dataset.drag, id: el.dataset.id }; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', el.dataset.id); } catch (x) {} });
document.addEventListener('dragend', e => { DRAG = null; document.querySelectorAll('.dragging,.drop-before,.drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')); });
function dropTarget(e) {
  if (!DRAG || !e.target.closest) return null;
  if (DRAG.list === 'strategie') return e.target.closest('[data-drag="strategie"],[data-drag="konta"]');
  return e.target.closest(`[data-drag="${DRAG.list}"]`);
}
document.addEventListener('dragover', e => { const el = dropTarget(e); if (!el) return;
  e.preventDefault(); document.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into'));
  if (DRAG.list === 'strategie' && el.dataset.drag === 'konta') { el.classList.add('drop-into'); return; }
  const r = el.getBoundingClientRect(); el.classList.add(e.clientY > r.top + r.height / 2 ? 'drop-after' : 'drop-before'); });
document.addEventListener('drop', e => { const el = dropTarget(e); if (!el) return; e.preventDefault();
  const list = DRAG.list, arr = S[list], from = arr.findIndex(x => x.id === DRAG.id); if (from < 0) return;
  if (list === 'strategie' && el.dataset.drag === 'konta') {
    const k = S.konta.find(x => x.id === el.dataset.id), s = arr[from];
    if (k && s.konto !== k.nazwa) { s.konto = k.nazwa; CFG.navClosed && (CFG.navClosed[k.id] = false); saveCfg(); changed('strategie'); toast(`„${s.nazwa}” przeniesiona na konto ${k.nazwa}`); }
    DRAG = null; render(); return;
  }
  if (el.dataset.id === DRAG.id) return;
  const r = el.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  const [item] = arr.splice(from, 1); let to = arr.findIndex(x => x.id === el.dataset.id); if (after) to++;
  arr.splice(to, 0, item);
  let msg = 'Zmieniono kolejność';
  if (list === 'strategie') { const tgt = arr.find(x => x.id === el.dataset.id); if (tgt && item.konto !== tgt.konto) { item.konto = tgt.konto; msg = `„${item.nazwa}” przeniesiona na konto ${tgt.konto}`; } }
  changed(list); DRAG = null; render(); toast(msg); });
document.addEventListener('dragend', () => document.querySelectorAll('.drop-into').forEach(x => x.classList.remove('drop-into')));

/* ---------- tryb demonstracyjny ---------- */
function demoState() {
  const S2 = defaultState();
  S2.ustawienia.kursy = { USD: num(S.ustawienia.kursy.USD) || 3.95, EUR: num(S.ustawienia.kursy.EUR) || 4.27, GBP: num(S.ustawienia.kursy.GBP) || 5.05, CHF: num(S.ustawienia.kursy.CHF) || 4.55 };
  S2.ustawienia.kursyData = S.ustawienia.kursyData || todayStr();
  S2.inflacja = JSON.parse(JSON.stringify(S.inflacja || []));
  const P = { CSPX: 735, IWDA: 128, IB01: 121, 'ZŁOTO': 2650, SREBRO: 31, BTC: 91000 };
  S2.instrumenty.forEach(i => i.cena = P[i.ticker]);
  S2.instrumenty.push({ id: 'i7', ticker: 'GOOGL', nazwa: 'Alphabet Inc. A', klasa: 'Akcje/ETF', waluta: 'USD', cena: 285, symbol: 'NASDAQ:GOOGL', cenaAuto: '' },
    { id: 'i8', ticker: 'PKN', nazwa: 'Orlen S.A.', klasa: 'Akcje/ETF', waluta: 'PLN', cena: 78.4, symbol: 'WSE:PKN', cenaAuto: '' },
    { id: 'i9', ticker: 'EDO1135', nazwa: 'Obligacje 10-letnie EDO', klasa: 'Obligacje skarbowe', waluta: 'PLN', cena: 104.2, symbol: '', cenaAuto: '' });
  S2.strategie = [
    { id: 's1', nazwa: 'Długi termin', konto: 'XTB USD', kapital: '', opis: 'ETF-y na lata, dokupowane co miesiąc', kolor: '#1565C0' },
    { id: 's2', nazwa: 'Dywidendowa', konto: 'XTB USD', kapital: 1500, opis: 'Spółki wypłacające dywidendy', kolor: '#26A69A' },
    { id: 's6', nazwa: 'GPW', konto: 'XTB PLN', kapital: '', opis: 'Polskie spółki', kolor: '#8D6E63' },
    { id: 's3', nazwa: 'IKE', konto: 'XTB IKE', kapital: '', opis: 'ETF na emeryturę', kolor: '#7E57C2' },
    { id: 's4', nazwa: 'Metale', konto: 'Sejf', kapital: '', opis: 'Kruszce fizyczne', kolor: '#F9A825' },
    { id: 's7', nazwa: 'Obligacje', konto: 'Obligacje skarbowe', kapital: '', opis: 'EDO', kolor: '#78909C' },
    { id: 's5', nazwa: 'Krypto', konto: 'Krypto', kapital: '', opis: '', kolor: '#EF5350' }];
  const T = (d, s, typ, t, q, p, k, f = 0) => ({ id: uid(), data: d, strategia: s, typ, ticker: t, ilosc: q, cena: p, prowizja: f, kurs: k, notatka: '' });
  S2.transakcje = [T('2025-03-10', 'Długi termin', 'KUPNO', 'CSPX', 6, 560, 4.0), T('2025-06-12', 'Długi termin', 'KUPNO', 'IWDA', 20, 102, 3.75),
    T('2025-09-15', 'Długi termin', 'KUPNO', 'CSPX', 4, 610, 3.65), T('2026-01-20', 'Długi termin', 'KUPNO', 'IB01', 40, 118, 3.62),
    T('2026-02-05', 'Dywidendowa', 'KUPNO', 'GOOGL', 3, 190, 3.98), T('2026-06-01', 'Dywidendowa', 'SPRZEDAŻ', 'GOOGL', 1, 260, 3.74),
    T('2026-03-02', 'GPW', 'KUPNO', 'PKN', 40, 61.5, ''), T('2026-01-02', 'IKE', 'KUPNO', 'IWDA', 8, 110, 4.0), T('2026-05-04', 'IKE', 'KUPNO', 'CSPX', 1, 640, 3.8),
    T('2024-11-10', 'Metale', 'KUPNO', 'ZŁOTO', 1, 1760, 4.05), T('2024-12-02', 'Metale', 'KUPNO', 'SREBRO', 10, 30, 4.08),
    T('2026-08-13', 'Obligacje', 'KUPNO', 'EDO1135', 20, 100, ''), T('2026-01-27', 'Krypto', 'KUPNO', 'BTC', 0.012, 95000, 3.55)];
  S2.dywidendy = [{ id: 'd1', data: '2026-03-16', strategia: 'Dywidendowa', ticker: 'GOOGL', brutto: 0.6, podatek: 0.09, kurs: 3.9, notatka: '' },
    { id: 'd2', data: '2026-06-16', strategia: 'Dywidendowa', ticker: 'GOOGL', brutto: 0.42, podatek: 0.06, kurs: 3.72, notatka: '' },
    { id: 'd3', data: '2026-07-10', strategia: 'GPW', ticker: 'PKN', brutto: 168, podatek: 31.92, kurs: '', notatka: 'dywidenda Orlen' }];
  S2.wplaty = [['2024-11-05', 'Sejf', 7130, ''], ['2024-12-01', 'Sejf', 1224, ''], ['2025-03-05', 'XTB USD', 13500, 3375], ['2025-06-10', 'XTB USD', 7700, 2053],
    ['2025-09-10', 'XTB USD', 8950, 2452], ['2026-01-02', 'XTB IKE', 3520, ''], ['2026-05-01', 'XTB IKE', 700, ''], ['2026-01-15', 'XTB USD', 17200, 4751],
    ['2026-01-25', 'Krypto', 4050, 1141], ['2026-02-01', 'XTB USD', 2300, 578], ['2026-03-01', 'XTB PLN', 2500, ''], ['2026-08-12', 'Obligacje skarbowe', 2000, '']]
    .map(([d, k, v, w], i) => ({ id: 'w' + i, data: d, konto: k, kwotaPLN: v, kwotaWal: w, notatka: '' }));
  S2.cele = S2.cele.concat([
    { id: 'c10', konto: 'XTB USD', koszyk: 'CORE', tickery: 'CSPX,IWDA', grupa: 'Wzrost', cel: 75 },
    { id: 'c11', konto: 'XTB USD', koszyk: 'Obligacje USA', tickery: 'IB01', grupa: 'Stabilizacja', cel: 20 },
    { id: 'c12', konto: 'XTB USD', koszyk: 'Spółki', tickery: 'GOOGL', grupa: 'Satelita', cel: 5 },
    { id: 'c13', konto: 'XTB IKE', koszyk: 'Świat', tickery: 'IWDA', grupa: '', cel: 60 },
    { id: 'c14', konto: 'XTB IKE', koszyk: 'USA', tickery: 'CSPX', grupa: '', cel: 40 },
    { id: 'c15', konto: 'Sejf', koszyk: 'Złoto', tickery: 'ZŁOTO', grupa: '', cel: 70 },
    { id: 'c16', konto: 'Sejf', koszyk: 'Srebro', tickery: 'SREBRO', grupa: '', cel: 30 }]);
  // historia wartości (symulacja)
  let d = new Date('2024-11-10'), v = 7130, k = 7130; const dep = {}; S2.wplaty.forEach(w => dep[w.data] = (dep[w.data] || 0) + w.kwotaPLN);
  S2.historia = [];
  while (d < new Date(todayStr())) { const ds = d.toISOString().slice(0, 10); if (dep[ds] && ds !== '2024-11-05') { v += dep[ds]; k += dep[ds]; }
    v *= 1 + (Math.sin(d.getTime() / 9e8) * 0.004 + 0.0007); S2.historia.push({ data: ds, wartosc: Math.round(v), kapital: k }); d.setDate(d.getDate() + 1); }
  const CD = calc(S2), teraz = CD.wartosc, n = S2.historia.length, last = n ? S2.historia[n - 1].wartosc : 0;
  if (n && last && teraz) S2.historia.forEach((h, i) => { h.wartosc = Math.round(h.wartosc * Math.pow(teraz / last, (i + 1) / n)); });
  const fin = {}; CD.konta.forEach(k => fin[k.nazwa] = k.razem);
  S2.historia.forEach(h => { const dep = {}; let tot = 0; S2.wplaty.filter(w => w.data <= h.data).forEach(w => { dep[w.konto] = (dep[w.konto] || 0) + w.kwotaPLN; tot += w.kwotaPLN; });
    const wsp = {}; let sw = 0; Object.keys(dep).forEach(k => { wsp[k] = dep[k] * ((fin[k] || dep[k]) / Math.max(1, S2.wplaty.filter(w => w.konto === k).reduce((a, w) => a + w.kwotaPLN, 0))); sw += wsp[k]; });
    const m = {}; Object.keys(wsp).forEach(k => m[k] = Math.round(h.wartosc * wsp[k] / sw)); h.konta = JSON.stringify(m);
    const sm = {}; CD.strategie.forEach((s, j) => { const kv = m[s.konto]; const ka = CD.konta.find(x => x.nazwa === s.konto); if (!kv || !ka || !ka.razem || !s.wartosc) return;
      sm[s.nazwa] = Math.round(kv * s.wartosc / ka.razem * (1 + 0.03 * Math.sin(dnum(h.data) / (4e9 + j * 7e8) + j))); }); h.strat = JSON.stringify(sm); });
  const pr = t => { const x = S2.instrumenty.find(i => i.ticker === t); return x ? num(x.cena) || num(x.cenaAuto) : 0; }, r2_ = v => Math.round(v * 100) / 100;
  S2.alerty = [
    { id: 'a1', aktywny: 'TAK', typ: 'KUPNO', ticker: 'CSPX', poziom: r2_(pr('CSPX') * 0.98), prog: 3, notatka: 'dokupić 1 szt.' },
    { id: 'a2', aktywny: 'TAK', typ: 'SPRZEDAŻ', ticker: 'BTC', poziom: r2_(pr('BTC') * 1.2), prog: 5, notatka: 'sprzedać połowę' },
    { id: 'a3', aktywny: 'TAK', typ: 'ŚREDNIA', ticker: 'ZŁOTO', konto: '', poziom: 40, prog: 5, notatka: 'realizacja zysku' },
    { id: 'a4', aktywny: 'TAK', typ: 'CEL', konto: '', koszyk: 'IB01', poziom: 5, prog: 1, notatka: '' },
    { id: 'a5', aktywny: 'TAK', typ: 'KUPNO', ticker: 'GOOGL', poziom: r2_(pr('GOOGL') * 0.85), prog: 3, notatka: '' }];
  return S2;
}
function wejdzDemo() {
  if (!confirm('Wczytać przykładowy portfel?\n\nTwoje dane zostaną odłożone i wrócą po kliknięciu „Wróć do moich danych”. W trybie demo nic nie zapisuje się w arkuszu Google.')) return;
  saveLocal(); lsSet('portfel_real_backup_v1', S);
  CFG.demo = true; saveCfg(); LS_INTRA = 'portfel_intraday_demo';
  S = demoState(); DIRTY = new Set(); saveLocal();
  const now = Date.now(), base = calc(S).wartosc, pts = [];
  const CK = calc(S);
  for (let i = 30; i >= 0; i--) { const f = 1 + Math.sin(i / 4) * 0.004 - i * 0.0001, kk = {}; CK.konta.forEach(k => { if (k.razem) kk[k.nazwa] = Math.round(k.razem * f); }); pts.push({ t: new Date(now - i * 45 * 60000).toISOString(), w: Math.round(base * f), k: CK.kapital, kk }); }
  lsSet(LS_INTRA, pts);
  setSync('local', 'Tryb demo – nic nie zapisuje się w arkuszu'); go('kokpit'); render(); toast('Wczytano przykładowy portfel');
}
function wyjdzDemo() {
  CFG.demo = false; saveCfg(); LS_INTRA = LS_INTRA_REAL;
  S = lsGet(LS_DATA, null) || defaultState(); DIRTY = new Set(lsGet(LS_DIRTY, []));
  try { localStorage.removeItem(LS_DEMO); localStorage.removeItem('portfel_intraday_demo'); } catch (e) {}
  migrateCele(); go('kokpit'); render(); scheduleSync(); toast('Przywrócono Twoje dane');
}
function demoBanner() { return CFG.demo ? `<div class="alert info" style="display:flex;align-items:center;gap:12px"><span style="flex:1">🧪 <b>Tryb demonstracyjny</b> – oglądasz przykładowy portfel. Możesz klikać i dodawać dane do woli, nic nie trafia do Twojego arkusza.</span><button class="btn sm" onclick="wyjdzDemo()">↩ Wróć do moich danych</button></div>` : ''; }

/* ---------- start ---------- */
setInterval(() => { if (document.visibilityState === 'visible') { C = calc(S, calcOpts()); snapshotIntraday(); if (ROUTE === 'kokpit' && RANGE === '1d') render(); } }, 15 * 60000);
function boot() {
  const MIG = { 'CURRENCY:XAUUSD': 'YAHOO:GC=F', 'CURRENCY:XAGUSD': 'YAHOO:SI=F', 'CURRENCY:BTCUSD': 'YAHOO:BTC-USD' };
  let mig = false; S.instrumenty.forEach(i => { if (MIG[i.symbol]) { i.symbol = MIG[i.symbol]; mig = true; }
    if (i.klasa === 'Obligacje' && isOS(i)) { i.klasa = 'Obligacje skarbowe'; mig = true; } }); if (mig) changed('instrumenty');
  migrateCele(); if (!S.alerty) S.alerty = [];
  readHash(); render(); snapshot();
  if (CFG.demo) setSync('local', 'Tryb demo – nic nie zapisuje się w arkuszu');
  else if (CFG.clientId && CFG.connected) setSync('pending', 'Kliknij tutaj, aby połączyć z Google Sheets');
  else setSync('local', CFG.sheetId ? 'Kliknij, aby połączyć z Google Sheets' : 'Dane tylko w tej przeglądarce');
  if (CFG.waluta && CFG.waluta !== 'PLN') pobierzFxHist(CFG.waluta).then(ch => { if (ch) render(); }).catch(() => {});
  if (CFG.inflDay !== todayStr() || CFG.inflSrc !== 'fred' || !S.inflacja.some(r => has(r.mmEA))) pobierzInflacje(true).then(r => { if (r) { render(); snapshot(); } }).catch(() => {});
  const kd = S.ustawienia.kursyData; if (!kd || kd < todayStr().slice(0, 10) && navigator.onLine) nbpCurrent().then(() => { render(); snapshot(); }).catch(() => {});
}
