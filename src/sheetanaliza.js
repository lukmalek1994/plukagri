/* ===================== ARKUSZ „ANALIZY” – migawka z aplikacji (raz dziennie) ===================== */
async function buildAnalizy(force) {
  const C = calcPLN();   // arkusz zawsze w złotych
  if (CFG.demo || !CFG.sheetId || !SYNC.token || !C) return;
  const day = todayStr(); CFG.anDay = CFG.anDay || {};
  if (!force && CFG.anDay[CFG.sheetId] === day) return;
  const rows = [], F = [];   // F: [typ, r0, r1, c0, c1]
  const put = (r, c, v) => { while (rows.length < r) rows.push([]); const row = rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v ?? ''; };
  const r2 = v => (v === null || v === undefined || !isFinite(v)) ? '' : Math.round(v * 100) / 100, r4 = v => (v === null || v === undefined || !isFinite(v)) ? '' : Math.round(v * 1e4) / 1e4;
  let r = 1;
  put(1, 2, 'Analizy portfela'); put(2, 2, `Stan z dnia ${new Date().toLocaleDateString('pl-PL')} – zakładkę zapisuje aplikacja raz dziennie (migawka). Bieżące wartości liczone formułami są w zakładce „Podsumowanie”.`);
  const pts = histPoints(S, C), T = twrStats(pts), xr = xirrPortfel(S, C), P = passiveIncome(S, C), K = costs(S, C);
  const kosztyRazem = Object.values(K).reduce((a, k) => a + k.prowizje + k.zrodlo + k.pit, 0);
  const kp = [['Roczna stopa (XIRR)', r4(xr), 'p'], ['Stopa TWR', T ? r4(T.tot) : '', 'p'], ['TWR rocznie', T && T.roczna !== null ? r4(T.roczna) : '', 'p'], ['Maks. obsunięcie', T ? r4(T.maxDD) : '', 'p'],
    ['Obecnie od szczytu', T ? r4(T.aktualne) : '', 'p'], ['Dochód pasywny 12 mies.', r2(P.sum12), 'm'], ['Koszty i podatki łącznie', r2(kosztyRazem), 'm']];
  kp.forEach(([l, v, t], k) => { put(4, 2 + k, l); put(5, 2 + k, v); F.push([t === 'p' ? 'pct' : 'money', 5, 5, 2 + k, 2 + k]); });
  F.push(['kpi', 4, 5, 2, 8]);
  r = 7;
  const sect = (title, head) => { put(r, 2, title); F.push(['sect', r, r, 2, 2 + Math.max(head.length - 1, 6)]); head.forEach((h, k) => put(r + 1, 2 + k, h)); F.push(['head', r + 1, r + 1, 2, 1 + head.length]); r += 2; return r; };
  const end = (a, ncol, fm) => { if (r - 1 >= a) { F.push(['band', a, r - 1, 2, 1 + ncol]); (fm || []).forEach(([t, c0, c1]) => F.push([t, a, r - 1, c0, c1 || c0])); } r += 1; };

  // Ty vs rynek
  const step = Math.max(1, Math.floor(pts.length / 160)), dates = pts.filter((p, i) => i % step === 0 || i === pts.length - 1).map(p => p.d);
  const B = dates.length > 1 ? benchSeries(S, dates, C).filter(b => !b.brak) : [];
  if (B.length) { let a = sect('TY VS RYNEK – gdyby te same wpłaty, w tych samych dniach, poszły w…', ['Benchmark', 'Wartość dziś', 'Twój portfel', 'Ty vs benchmark']);
    B.forEach(b => { put(r, 2, b.label); put(r, 3, r2(b.dzis)); put(r, 4, r2(C.wartosc)); put(r, 5, r2(C.wartosc - b.dzis)); r++; }); end(a, 4, [['money', 3, 5]]); }

  // mapa miesięcy
  const M = monthlyResults(pts), years = [...new Set(M.map(x => x.m.slice(0, 4)))].sort().reverse();
  if (years.length) { const a = sect('MAPA MIESIĘCY – stopa zwrotu w miesiącu (bez wpływu wpłat)', ['Rok', 'sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru', 'Cały rok']);
    years.forEach(y => { const ym = M.filter(x => x.m.startsWith(y)); put(r, 2, y);
      for (let i = 1; i <= 12; i++) { const x = ym.find(z => +z.m.slice(5) === i); put(r, 2 + i, x ? r4(x.pct) : ''); }
      put(r, 15, r4(ym.reduce((s, x) => s * (1 + x.pct), 1) - 1)); r++; });
    end(a, 14, [['pct', 3, 15], ['heat', 3, 14]]); }

  // wyniki miesięczne (wykres)
  const last = M.slice(-24); let chartM = null;
  if (last.length) { const a = sect('WYNIKI MIESIĘCZNE – ostatnie 24 miesiące', ['Miesiąc', 'Zysk PLN', 'Zysk %']);
    last.forEach(x => { put(r, 2, x.m); put(r, 3, r2(x.zysk)); put(r, 4, r4(x.pct)); r++; }); chartM = [a, r - 1]; end(a, 3, [['money', 3], ['pct', 4]]); }

  // porównanie strategii
  const st = C.strategie.filter(s => s.wartosc || s.zrealizowany || s.dywidendyNetto);
  if (st.length) { const a = sect('PORÓWNANIE STRATEGII', ['Strategia', 'Konto', 'Wartość', 'Koszt', 'Wynik', 'Wynik %', 'XIRR rocznie', 'Udział']);
    st.map(s => ({ ...s, x: xirrStrategia(S, C, s) })).sort((p, q) => (q.x ?? -9) - (p.x ?? -9)).forEach(s => {
      [s.nazwa, s.konto, r2(s.wartosc), r2(s.koszt), r2(s.wynik), s.koszt ? r4(s.wynik / s.koszt) : '', r4(s.x), r4(s.udzial)].forEach((v, k) => put(r, 2 + k, v)); r++; });
    end(a, 8, [['money', 4, 6], ['pct', 7, 9]]); }

  // wpływ waluty
  const FX = fxEffect(C);
  if (FX.length) { const a = sect('WPŁYW WALUTY – zysk z ceny instrumentu i z kursu (otwarte pozycje)', ['Pozycja', 'Strategia', 'Śr. kurs zakupu', 'Kurs dziś', 'Zysk z ceny PLN', 'Zysk z kursu PLN', 'Razem PLN']);
    FX.forEach(x => { [x.ticker, x.strategia, r4(x.avgRate), r4(x.now), r2(x.efektCena), r2(x.efektKurs), r2(x.zyskPLN)].forEach((v, k) => put(r, 2 + k, v)); r++; });
    put(r, 2, 'RAZEM'); put(r, 6, r2(FX.reduce((s, x) => s + x.efektCena, 0))); put(r, 7, r2(FX.reduce((s, x) => s + x.efektKurs, 0))); put(r, 8, r2(FX.reduce((s, x) => s + x.zyskPLN, 0))); r++;
    end(a, 7, [['num4', 4, 5], ['money', 6, 8]]); }

  // dochód pasywny
  if (P.tickers.length) { const a = sect('DOCHÓD PASYWNY – ostatnie 12 miesięcy', ['Instrument', 'Netto PLN', 'Stopa od kosztu (YoC)', 'Stopa od wartości', 'Nadal w portfelu']);
    P.tickers.forEach(t => { [t.ticker, r2(t.netto), r4(t.yoc), r4(t.yld), t.trzymane ? 'tak' : 'nie'].forEach((v, k) => put(r, 2 + k, v)); r++; });
    put(r, 2, 'Prognoza na kolejne 12 mies.'); put(r, 3, r2(P.prognoza)); r++;
    end(a, 5, [['money', 3], ['pct', 4, 5]]); }

  // koszty
  const ky = Object.keys(K).sort();
  if (ky.length) { const a = sect('KOSZTY I PODATKI WG LAT', ['Rok', 'Prowizje', 'Podatek od dywidend', 'PIT-38 (szacunek)', 'Razem']);
    ky.forEach(y => { const k = K[y]; [y, r2(k.prowizje), r2(k.zrodlo), r2(k.pit), r2(k.prowizje + k.zrodlo + k.pit)].forEach((v, j) => put(r, 2 + j, v)); r++; });
    end(a, 5, [['money', 3, 6]]); }

  // prognoza
  const o = Object.assign({ start: Math.round(C.wartosc), wplata: 1000, stopa: 7, lata: 20, inflacja: 3, wzrost: 0, cel: 0 }, CFG.sym || {}); o.lata = Math.max(o.lata, 5);
  const SIM = simulate(o);
  { const a = sect(`PROGNOZA – wpłata ${o.wplata} zł/mies., ${o.stopa}% rocznie, inflacja ${o.inflacja}% (założenia z Symulatora w aplikacji)`, ['Za lat', 'Suma wpłat', 'Wartość', 'W dzisiejszych zł']);
    SIM.pts.filter(p => p.m && p.m % 60 === 0).forEach(p => { [p.m / 12, r2(p.wplacone), r2(p.V), r2(p.real)].forEach((v, k) => put(r, 2 + k, v)); r++; });
    end(a, 4, [['money', 3, 5]]); }

  // --- zapis ---
  const meta = await gapi('GET', `${SHEETS}/${CFG.sheetId}?fields=sheets.properties(sheetId,title)`);
  const old = meta.sheets.find(x => x.properties.title === 'Analizy'), reqs = [];
  if (old) reqs.push({ deleteSheet: { sheetId: old.properties.sheetId } });
  reqs.push({ addSheet: { properties: { title: 'Analizy', index: 1, tabColor: { red: .15, green: .65, blue: .6 }, gridProperties: { rowCount: Math.max(150, r + 30), columnCount: 26, hideGridlines: true } } } });
  const add = await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: reqs });
  const sid = add.replies[add.replies.length - 1].addSheet.properties.sheetId;
  await gapi('POST', `${SHEETS}/${CFG.sheetId}/values:batchUpdate`, { valueInputOption: 'RAW', data: [{ range: "'Analizy'!A1", values: rows }] });
  const G = (r0, r1, c0, c1) => ({ sheetId: sid, startRowIndex: r0 - 1, endRowIndex: r1, startColumnIndex: c0 - 1, endColumnIndex: c1 });
  const rgb = h => ({ red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 });
  const fmt = (range, uf, fields) => ({ repeatCell: { range, cell: { userEnteredFormat: uf }, fields: 'userEnteredFormat(' + fields + ')' } });
  const R = [fmt(G(1, r + 5, 1, 26), { textFormat: { fontFamily: 'Arial', fontSize: 10, foregroundColor: rgb('1F2937') }, verticalAlignment: 'MIDDLE' }, 'textFormat,verticalAlignment'),
    fmt(G(1, 1, 2, 2), { textFormat: { fontFamily: 'Arial', bold: true, fontSize: 18, foregroundColor: rgb('0B3D91') } }, 'textFormat'),
    fmt(G(2, 2, 2, 2), { textFormat: { fontFamily: 'Arial', italic: true, fontSize: 9, foregroundColor: rgb('6B7280') } }, 'textFormat'),
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 2, endIndex: 15 }, properties: { pixelSize: 92 }, fields: 'pixelSize' } }];
  F.forEach(([t, a, b, c0, c1]) => { const g = G(a, b, c0, c1);
    if (t === 'money') R.push(fmt(g, { numberFormat: { type: 'NUMBER', pattern: '#,##0.00 "zł";[Red]-#,##0.00 "zł";"–"' } }, 'numberFormat'));
    if (t === 'pct') R.push(fmt(g, { numberFormat: { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"–"' } }, 'numberFormat'));
    if (t === 'num4') R.push(fmt(g, { numberFormat: { type: 'NUMBER', pattern: '0.0000' } }, 'numberFormat'));
    if (t === 'kpi') R.push(fmt(G(a, a, c0, c1), { backgroundColor: rgb('EEF4FC'), textFormat: { fontSize: 9, foregroundColor: rgb('6B7280') }, wrapStrategy: 'WRAP' }, 'backgroundColor,textFormat,wrapStrategy'),
      fmt(G(b, b, c0, c1), { backgroundColor: rgb('EEF4FC'), textFormat: { bold: true, fontSize: 14, foregroundColor: rgb('0B3D91') } }, 'backgroundColor,textFormat'));
    if (t === 'sect') R.push(fmt(g, { textFormat: { bold: true, fontSize: 11, foregroundColor: rgb('0B3D91') }, borders: { bottom: { style: 'SOLID_MEDIUM', color: rgb('0B3D91') } } }, 'textFormat,borders'));
    if (t === 'head') R.push(fmt(g, { backgroundColor: rgb('0B3D91'), textFormat: { bold: true, foregroundColor: rgb('FFFFFF'), fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' }, 'backgroundColor,textFormat,horizontalAlignment,wrapStrategy'));
    if (t === 'band') R.push({ addBanding: { bandedRange: { range: g, rowProperties: { firstBandColor: rgb('FFFFFF'), secondBandColor: rgb('F5F8FC') } } } });
    if (t === 'heat') R.push({ addConditionalFormatRule: { index: 0, rule: { ranges: [g], gradientRule: { minpoint: { color: rgb('F28B82'), type: 'NUMBER', value: '-0.06' }, midpoint: { color: rgb('FFFFFF'), type: 'NUMBER', value: '0' }, maxpoint: { color: rgb('81C995'), type: 'NUMBER', value: '0.06' } } } } });
  });
  if (chartM) R.push({ addChart: { chart: { spec: { title: 'Wyniki miesięczne (zł, bez wpłat)', titleTextFormat: { bold: true, fontFamily: 'Arial' }, fontName: 'Arial',
    basicChart: { chartType: 'COLUMN', legendPosition: 'NO_LEGEND', axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS' }],
      domains: [{ domain: { sourceRange: { sources: [G(chartM[0], chartM[1], 2, 2)] } } }], series: [{ series: { sourceRange: { sources: [G(chartM[0], chartM[1], 3, 3)] } }, targetAxis: 'LEFT_AXIS', color: rgb('26A69A') }] } },
    position: { overlayPosition: { anchorCell: { sheetId: sid, rowIndex: 3, columnIndex: 16 }, widthPixels: 560, heightPixels: 300 } } } } });
  await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: R });
  CFG.anDay[CFG.sheetId] = day; saveCfg();
}
