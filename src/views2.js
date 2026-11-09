/* ===================== KOKPIT: ANALIZY RYNKOWE ===================== */
function heatColor(p) { if (!p) return '#f5f7fa'; const a = Math.min(1, Math.abs(p) / 0.06); return p > 0 ? `rgba(22,163,74,${0.12 + a * 0.6})` : `rgba(220,38,38,${0.12 + a * 0.6})`; }
function kokpitRynek(SV, KK) {
  const pts = histPoints(SV), T = twrStats(pts), xr = xirrPortfel(SV, C);
  // 1. benchmark
  const step = Math.max(1, Math.floor(pts.length / 160)), dates = pts.filter((p, i) => i % step === 0 || i === pts.length - 1).map(p => p.d);
  const B = dates.length > 1 ? benchSeries(SV, dates) : [];
  const brak = B.filter(b => b.brak).length;
  const benchChart = lineChart([{ name: KK ? 'To konto' : 'Mój portfel', points: pts.filter((p, i) => i % step === 0 || i === pts.length - 1).map(p => [p.d, p.w]), color: '#1565C0' },
    { name: 'Wpłacony kapitał', points: dates.map(d => [d, pts.find(p => p.d === d).k]), color: '#94a3b8', dash: true },
    ...B.filter(b => b.points.length).map(b => ({ name: b.label, points: b.points, color: b.color }))], { empty: 'Porównanie pojawi się, gdy będzie historia wartości i wpłaty' });
  const benchTbl = table([
    { h: 'Te same wpłaty w…', f: b => `<i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${b.color};margin-right:7px"></i>${esc(b.label)}` },
    { h: 'Wartość dziś', n: 1, f: b => b.brak ? '<span class="mut">brak notowań</span>' : zl(b.dzis, 0) },
    { h: 'Ty vs on', n: 1, f: b => b.brak ? '–' : pl(C.wartosc - b.dzis) },
  ], B.length ? B : [], { empty: 'Brak wpłat do porównania' });
  // 3. wyniki miesięczne
  const M = monthlyResults(pts), last12 = M.slice(-12);
  const years = [...new Set(M.map(x => x.m.slice(0, 4)))].sort().reverse();
  const heat = years.length ? `<div class="tbl"><table class="heat"><thead><tr><th>Rok</th>${['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'].map(m => `<th class="n">${m}</th>`).join('')}<th class="n">Rok</th></tr></thead><tbody>
    ${years.map(y => { const ym = M.filter(x => x.m.startsWith(y)); const rok = ym.reduce((a, x) => a * (1 + x.pct), 1) - 1;
      return `<tr><td><b>${y}</b></td>${Array.from({ length: 12 }, (_, i) => { const x = ym.find(z => +z.m.slice(5) === i + 1);
        return `<td class="n" style="background:${x ? heatColor(x.pct) : 'transparent'}" title="${x ? esc(zl(x.zysk, 0)) : ''}">${x ? (x.pct * 100).toFixed(1).replace('.', ',') : ''}</td>`; }).join('')}
        <td class="n"><b class="${sgn(rok)}">${(rok * 100).toFixed(1).replace('.', ',')}%</b></td></tr>`; }).join('')}</tbody></table></div>` : '';
  const monthBars = barChart(last12.map(x => x.m.slice(5) + '.' + x.m.slice(2, 4)), [{ name: 'Zysk', values: last12.map(x => x.zysk) }], { signColors: true, empty: 'Wyniki miesięczne pojawią się po pierwszym pełnym miesiącu historii', h: 200 });
  // 4. obsunięcie
  const ddChart = T ? lineChart([{ name: 'Obsunięcie od szczytu', points: T.dd.filter((p, i) => i % step === 0 || i === T.dd.length - 1), color: '#EF5350' }], { pct: true, area: true, h: 190, zero: false }) : emptyChart('Obsunięcie pojawi się, gdy będzie historia wartości');
  const kpis = `<div class="kpis" style="margin-top:16px;margin-bottom:0">
    ${kpi('Roczna stopa zwrotu (XIRR)', xr === null ? '–' : pp(xr), 'uwzględnia terminy wpłat')}
    ${kpi('Stopa zwrotu TWR', T ? pp(T.tot) : '–', T ? (T.roczna !== null ? pp(T.roczna) + ' rocznie' : `za ${Math.round(T.days)} dni (bez wpływu wpłat)`) : 'brak historii')}
    ${kpi('Maks. obsunięcie', T ? `<span class="neg">${pct(T.maxDD)}</span>` : '–', T && T.ddFrom ? `${T.ddFrom} → ${T.ddTo}` : '')}
    ${kpi('Obecnie od szczytu', T ? (T.aktualne > -0.0005 ? '<span class="pos">na szczycie</span>' : `<span class="neg">${pct(T.aktualne)}</span>`) : '–', 'spadek od najwyższej wartości')}</div>`;
  return kpis + `
    <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Porównanie z rynkiem<span class="sp"></span>${SYNC.token && !CFG.demo ? '<button class="btn sm ghost" onclick="odswiezBenchmarki(true)">↻ Notowania</button>' : ''}</h3>${benchChart}
      ${brak ? `<div class="mut" style="font-size:12px;margin-top:6px">${CFG.demo ? 'W trybie demo notowania ETF nie są pobierane – widać tylko EDO.' : 'Notowania ETF i WIG20 pobiorą się po połączeniu z Google Sheets (skrypt Portfel_Ceny.gs z funkcją YAHOO_HIST).'}</div>` : ''}</div>
      <div class="card"><h3>Ty vs rynek</h3>${benchTbl}<div class="mut" style="font-size:12px;margin-top:8px">Symulacja: każda Twoja wpłata kupuje benchmark w dniu wpłaty (po kursie USD/PLN z tego dnia).</div></div></div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Wyniki miesięczne <small>ostatnie 12 miesięcy, zł (bez wpłat)</small></h3>${monthBars}</div>
      <div class="card"><h3>Obsunięcie od szczytu <small>wg stopy TWR</small></h3>${ddChart}</div></div>
    ${heat ? `<div class="card" style="margin-top:16px"><h3>Mapa miesięcy <small>stopa zwrotu w % (najedź, aby zobaczyć kwotę)</small></h3>${heat}</div>` : ''}`;
}

/* ===================== ANALIZY ===================== */
function vWaluta() {
  const R = fxEffect(C), sum = R.reduce((a, r) => ({ c: a.c + r.efektCena, k: a.k + r.efektKurs }), { c: 0, k: 0 });
  const byCur = {}; R.forEach(r => { byCur[r.waluta] = byCur[r.waluta] || { c: 0, k: 0, w: 0 }; byCur[r.waluta].c += r.efektCena; byCur[r.waluta].k += r.efektKurs; byCur[r.waluta].w += r.wartoscPLN; });
  return ['Wpływ waluty', 'Ile zarobiłeś na samych instrumentach, a ile na zmianie kursu walut (otwarte pozycje w walutach obcych)', `
    <div class="kpis">${kpi('Zysk z ceny instrumentów', plPLN(sum.c), 'przy kursie z dnia zakupu', 'main')}${kpi('Zysk / strata z kursu walut', plPLN(sum.k), 'zmiana kursu od zakupu do dziś')}${kpi('Razem', plPLN(sum.c + sum.k), 'zysk niezrealizowany w PLN')}</div>
    <div class="grid g2e"><div class="card"><h3>Podział zysku wg pozycji <small>względem złotego</small></h3>${barChart(R.map(r => r.ticker), [{ name: 'Cena instrumentu', values: R.map(r => r.efektCena), color: '#1565C0' }, { name: 'Kurs waluty', values: R.map(r => r.efektKurs), color: '#F9A825' }], { pln: true, empty: 'Brak pozycji w walutach obcych' })}</div>
      <div class="card"><h3>Wg waluty</h3>${table([
        { h: 'Waluta', f: x => `<b>${esc(x[0])}</b>` }, { h: 'Wartość ' + WL(), n: 1, f: x => zlPLN(x[1].w, 0) }, { h: 'Z ceny', n: 1, f: x => plPLN(x[1].c) }, { h: 'Z kursu', n: 1, f: x => plPLN(x[1].k) },
        { h: 'Kurs dziś', n: 1, f: x => C.rateNow(x[0]).toFixed(4) }], Object.entries(byCur), { empty: 'Brak' })}</div></div>
    <div class="card" style="margin-top:16px">${table([
      { h: 'Pozycja', f: r => `<b>${esc(r.ticker)}</b> <span class="mut">${esc(r.strategia)}</span>` }, { h: 'Śr. kurs zakupu', n: 1, f: r => r.avgRate.toFixed(4) }, { h: 'Kurs dziś', n: 1, f: r => r.now.toFixed(4) },
      { h: 'Zmiana kursu', n: 1, f: r => pp(r.now / r.avgRate - 1) }, { h: 'Zysk z ceny', n: 1, f: r => plPLN(r.efektCena) }, { h: 'Zysk z kursu', n: 1, f: r => plPLN(r.efektKurs) }, { h: 'Razem PLN', n: 1, f: r => plPLN(r.zyskPLN) },
    ], R, { pln: true, empty: 'Brak pozycji w walutach obcych' })}</div>`, ' '];
}

function vPorownanie() {
  const rows = C.strategie.filter(s => s.wartosc || s.zrealizowany || s.dywidendyNetto).map(s => ({ ...s, xirr: xirrStrategia(S, C, s), pct: s.koszt ? s.wynik / s.koszt : null }));
  // historia strategii (zapisywana od teraz)
  const series = rows.map(s => ({ name: s.nazwa, color: s.kolor, points: S.historia.map(h => { let m = h.strat; try { if (typeof m === 'string') m = m ? JSON.parse(m) : null; } catch (e) { m = null; }
    return m && m[s.nazwa] !== undefined ? [String(h.data).slice(0, 10), C.histX(num(m[s.nazwa]), String(h.data).slice(0, 10))] : null; }).filter(Boolean) })).filter(s => s.points.length);
  return ['Porównanie strategii', 'Która strategia zarabia najlepiej – wynik, roczna stopa zwrotu (XIRR) i wartość w czasie', `
    <div class="grid g2e"><div class="card"><h3>Roczna stopa zwrotu (XIRR)</h3>${barChart(rows.map(s => s.nazwa), [{ name: 'XIRR', values: rows.map(s => s.xirr || 0) }], { signColors: true, fmt: v => (v * 100).toFixed(0) + '%', empty: 'Brak danych' })}</div>
      <div class="card"><h3>Wynik łączny (${WL()})</h3>${barChart(rows.map(s => s.nazwa), [{ name: 'Niezrealizowany', values: rows.map(s => s.niezreal), color: '#1565C0' }, { name: 'Zrealizowany', values: rows.map(s => s.zrealizowany), color: '#26A69A' }, { name: 'Dywidendy', values: rows.map(s => s.dywidendyNetto), color: '#F9A825' }], { empty: 'Brak danych' })}</div></div>
    <div class="card" style="margin-top:16px"><h3>Wartość strategii w czasie</h3>${series.length ? lineChart(series, {}) : emptyChart('Historia strategii zapisuje się od teraz (raz dziennie) – wykres zapełni się w kolejnych dniach')}</div>
    <div class="card" style="margin-top:16px">${table([
      { h: 'Strategia', f: s => `<span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(s.kolor)};margin-right:7px"></span><b>${esc(s.nazwa)}</b> <span class="mut">${esc(s.konto)}</span>` },
      { h: 'Wartość', n: 1, f: s => zl(s.wartosc, 0) }, { h: 'Koszt', n: 1, f: s => zl(s.koszt, 0) }, { h: 'Wynik', n: 1, f: s => pl(s.wynik) }, { h: 'Wynik %', n: 1, f: s => s.pct === null ? '–' : pp(s.pct) },
      { h: 'XIRR rocznie', n: 1, f: s => s.xirr === null ? '–' : pp(s.xirr) }, { h: 'Udział', n: 1, f: s => pct(s.udzial) },
    ], rows.sort((a, b) => (b.xirr || -9) - (a.xirr || -9)), { empty: 'Brak strategii z pozycjami', click: s => `go('strategia','${s.id}')` })}</div>`, ' '];
}

function vKoszty() {
  const by = costs(S, C), years = Object.keys(by).sort();
  const tot = years.reduce((a, y) => ({ p: a.p + by[y].prowizje, z: a.z + by[y].zrodlo, t: a.t + by[y].pit }), { p: 0, z: 0, t: 0 });
  const all = tot.p + tot.z + tot.t, zyskBrutto = C.zysk + all;
  return ['Koszty i podatki', 'Ile kosztowały prowizje i podatki oraz jaką część zysku zabrały', `
    <div class="kpis">${kpi('Koszty łącznie', zlPLN(all), zyskBrutto > 0 ? pct(all / zyskBrutto) + ' zysku przed kosztami' : '', 'main')}${kpi('Prowizje', zlPLN(tot.p))}${kpi('Podatek od dywidend', zlPLN(tot.z), 'u źródła + dopłata w PL')}${kpi('Podatek PIT-38', zlPLN(tot.t), 'od sprzedaży (szacunek)')}</div>
    <div class="grid g2e"><div class="card"><h3>Koszty wg lat</h3>${barChart(years, [{ name: 'Prowizje', values: years.map(y => by[y].prowizje), color: '#1565C0' }, { name: 'Podatek od dywidend', values: years.map(y => by[y].zrodlo), color: '#F9A825' }, { name: 'PIT-38', values: years.map(y => by[y].pit), color: '#EF5350' }], { pln: true, empty: 'Brak kosztów' })}</div>
      <div class="card"><h3>Struktura kosztów</h3>${(() => { const d = [['Prowizje', tot.p, '#1565C0'], ['Podatek od dywidend', tot.z, '#F9A825'], ['PIT-38', tot.t, '#EF5350']].filter(x => x[1] > 0); return donut(d.map(x => [x[0], x[1]]), { empty: 'Brak kosztów', colors: d.map(x => x[2]) }); })()}</div></div>
    <div class="mut" style="font-size:12px;margin-top:10px">Koszty przewalutowania nie są tu liczone (nie są zapisywane w aplikacji). Podatek PIT-38 to szacunek z zakładki Podatki.</div>`, ' '];
}

function vDochod() {
  const P = passiveIncome(S, C), mies = P.months.map(m => m.slice(5) + '.' + m.slice(2, 4));
  return ['Dochód pasywny', 'Dywidendy i odsetki z ostatnich 12 miesięcy oraz prognoza na kolejne 12', `
    <div class="kpis">${kpi('Ostatnie 12 miesięcy', zl(P.sum12), 'netto', 'main')}${kpi('Średnio miesięcznie', zl(P.sum12 / 12))}${kpi('Prognoza na 12 miesięcy', zl(P.prognoza), 'z pozycji, które nadal masz')}
      ${kpi('Stopa dywidendy portfela', C.wartoscPozycji ? pct(P.tickers.reduce((a, t) => a + t.brutto, 0) / C.wartoscPozycji) : '–', 'brutto, od bieżącej wartości')}</div>
    <div class="grid g2e"><div class="card"><h3>Ostatnie 12 miesięcy <small>netto ${WL()}</small></h3>${barChart(mies, [{ name: 'Netto', values: P.byMonth, color: '#26A69A' }], { empty: 'Brak dywidend w ostatnich 12 miesiącach' })}</div>
      <div class="card"><h3>Prognoza <small>gdy wypłaty się powtórzą</small></h3>${barChart(P.nextMonths.map(m => m.slice(5) + '.' + m.slice(2, 4)), [{ name: 'Prognoza', values: P.fc, color: '#7E57C2' }], { empty: 'Brak danych do prognozy' })}</div></div>
    <div class="card" style="margin-top:16px">${table([
      { h: 'Instrument', f: t => `<b>${esc(t.ticker)}</b>${t.trzymane ? '' : ' <span class="mut">(sprzedany)</span>'}` }, { h: 'Netto 12 mies.', n: 1, f: t => zl(t.netto) },
      { h: 'Stopa od kosztu (YoC)', n: 1, f: t => t.yoc === null ? '–' : pct(t.yoc) }, { h: 'Stopa od wartości', n: 1, f: t => t.yld === null ? '–' : pct(t.yld) },
    ], P.tickers, { empty: 'Brak dywidend w ostatnich 12 miesiącach' })}</div>`, ' '];
}

/* ===================== PLANOWANIE ===================== */
function vSymulator() {
  const o = Object.assign({ start: Math.round(C.wartosc), wplata: 1000, stopa: 7, lata: 20, inflacja: 3, wzrost: 0, cel: 0, wydatki: 0 }, CFG.sym || {});
  if (o.wydatki > 0) o.cel = o.wydatki * 12 / 0.04;
  const R = simulate(o), end = R.pts[R.pts.length - 1];
  const fld = (k, l, step = 'any') => `<label>${l}<input type="number" step="${step}" value="${esc(o[k])}" onchange="CFG.sym=Object.assign(CFG.sym||{},{${k}:num(this.value)});saveCfg();render()"></label>`;
  const yearPts = R.pts.filter(p => p.m % 12 === 0);
  const today = new Date(); const dateOf = m => { const d = new Date(today); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };
  return ['Symulator przyszłości', 'Procent składany: ile możesz mieć za X lat przy regularnych wpłatach', `
    <div class="grid g2"><div class="card"><h3>Prognoza wartości</h3>${lineChart([
      { name: 'Wartość (nominalnie)', points: yearPts.map(p => [dateOf(p.m), p.V]), color: '#1565C0' },
      { name: 'Wartość w dzisiejszych złotych', points: yearPts.map(p => [dateOf(p.m), p.real]), color: '#7E57C2' },
      { name: 'Suma wpłat', points: yearPts.map(p => [dateOf(p.m), p.wplacone]), color: '#94a3b8', dash: true },
      ...(o.cel > 0 ? [{ name: 'Cel', points: [[dateOf(0), o.cel], [dateOf(o.lata * 12), o.cel]], color: '#F9A825', dash: true }] : [])], { area: true, pln: true })}</div>
      <div class="card"><h3>Założenia</h3><div class="form">${fld('start', 'Kwota startowa (zł)')}${fld('wplata', 'Wpłata miesięczna (zł)')}${fld('stopa', 'Stopa zwrotu rocznie (%)', '0.1')}${fld('lata', 'Liczba lat', '1')}
        ${fld('inflacja', 'Inflacja rocznie (%)', '0.1')}${fld('wzrost', 'Wzrost wpłat co rok (%)', '0.5')}${fld('cel', 'Cel (zł, w dzisiejszych pieniądzach)')}${fld('wydatki', 'albo: miesięczne wydatki (FIRE, reguła 4%)')}</div>
        <div class="mut" style="font-size:12px;margin-top:8px">Twoja dotychczasowa roczna stopa (XIRR): ${(() => { const x = xirrPortfel(S, C); return x === null ? 'brak danych' : pct(x); })()}. Historycznie akcje globalne dawały ok. 6–8% rocznie ponad inflację – to nie jest gwarancja.</div></div></div>
    <div class="kpis" style="margin-top:16px;margin-bottom:0">${kpi(`Za ${o.lata} lat`, zlPLN(end.V, 0), 'nominalnie', 'main')}${kpi('W dzisiejszych złotych', zlPLN(end.real, 0), `przy inflacji ${o.inflacja}%`)}${kpi('Suma wpłat', zlPLN(end.wplacone, 0))}${kpi('Zysk z procentu składanego', zlPLN(end.V - end.wplacone, 0))}
      ${o.cel > 0 ? kpi('Cel osiągniesz', R.goalM === null ? `<span class="neg">nie w ${o.lata} lat</span>` : dateOf(R.goalM).slice(0, 7), R.goalM === null ? 'zwiększ wpłaty lub horyzont' : `za ${Math.floor(R.goalM / 12)} lat ${R.goalM % 12} mies.` + (o.wydatki > 0 ? ` · cel FIRE ${zlPLN(o.cel, 0)}` : '')) : ''}</div>
    <div class="card" style="margin-top:16px">${table([
      { h: 'Rok', f: p => `${p.m / 12}` }, { h: 'Data', f: p => dateOf(p.m).slice(0, 7) }, { h: 'Suma wpłat', n: 1, f: p => zlPLN(p.wplacone, 0) }, { h: 'Wartość', n: 1, f: p => zlPLN(p.V, 0) },
      { h: 'W dzisiejszych zł', n: 1, f: p => zlPLN(p.real, 0) }, { h: 'Zysk', n: 1, f: p => plPLN(p.V - p.wplacone) }], yearPts.filter(p => p.m % 60 === 0 || p.m === o.lata * 12))}</div>`, ' '];
}

function vMapa() {
  const by = FILT.mapaBy || 'pozycje';
  let items;
  if (by === 'strategie') items = C.strategie.map(s => ({ label: s.nazwa, sub: s.konto, v: s.wartosc, p: s.koszt ? s.niezreal / s.koszt : 0 }));
  else if (by === 'konta') items = C.konta.map(k => ({ label: k.nazwa, sub: k.typ, v: k.razem, p: k.zyskPct || 0 }));
  else { const m = {}; C.pozycje.forEach(p => { const x = m[p.ticker] = m[p.ticker] || { label: p.ticker, sub: p.nazwa, v: 0, k: 0 }; x.v += p.wartoscPLN; x.k += p.kosztPLN; });
    items = Object.values(m).map(x => ({ ...x, p: x.k ? x.v / x.k - 1 : 0 })); }
  const W = 1000, H = 520, tiles = treemap(items, W, H);
  const col = p => { const a = Math.min(1, Math.abs(p) / 0.3); return p >= 0 ? `rgb(${Math.round(232 - a * 200)},${Math.round(245 - a * 90)},${Math.round(233 - a * 180)})` : `rgb(${Math.round(250 - a * 30)},${Math.round(225 - a * 170)},${Math.round(225 - a * 170)})`; };
  const svg = tiles.length ? `<svg viewBox="0 0 ${W} ${H}" class="chart" style="border-radius:10px">${tiles.map(t => `<g><rect x="${t.x + 1}" y="${t.y + 1}" width="${Math.max(0, t.w - 2)}" height="${Math.max(0, t.h - 2)}" rx="6" fill="${col(t.p)}"><title>${esc(t.label)}: ${esc(zl(t.v, 0))} (${esc(pct(t.p))})</title></rect>
    ${t.w > 70 && t.h > 38 ? `<text x="${t.x + 10}" y="${t.y + 24}" font-size="${Math.min(22, Math.max(12, t.w / 9))}" font-weight="700" fill="#0f172a">${esc(t.label)}</text>
    <text x="${t.x + 10}" y="${t.y + 24 + Math.min(20, Math.max(13, t.w / 11))}" font-size="12" fill="#334155">${esc(zl(t.v, 0))} · ${(t.p >= 0 ? '+' : '') + (t.p * 100).toFixed(1).replace('.', ',')}%</text>` : ''}</g>`).join('')}</svg>` : emptyChart('Brak pozycji');
  const seg = `<div class="seg">${[['pozycje', 'Instrumenty'], ['strategie', 'Strategie'], ['konta', 'Konta']].map(([k, l]) => `<button class="${by === k ? 'on' : ''}" onclick="FILT.mapaBy='${k}';render()">${l}</button>`).join('')}</div>`;
  return ['Mapa portfela', 'Wielkość pola = wartość, kolor = zysk lub strata od zakupu', `
    <div class="card"><h3>Mapa<span class="sp"></span>${seg}</h3>${svg}
      <div class="legend"><span><i style="background:${col(-0.3)}"></i>−30% i mniej</span><span><i style="background:${col(0)}"></i>0%</span><span><i style="background:${col(0.3)}"></i>+30% i więcej</span></div></div>`, ' '];
}
