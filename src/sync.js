/* ===================== DANE, ZAPIS LOKALNY, GOOGLE SHEETS, NBP ===================== */
const LS_DATA = 'portfel_dane_v1', LS_CFG = 'portfel_cfg_v1', LS_DIRTY = 'portfel_dirty_v1', LS_NBP = 'portfel_nbp_v1';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

const TABLES = {
  transakcje: { sheet: 'Transakcje', cols: [['id', 'ID'], ['data', 'Data'], ['strategia', 'Strategia'], ['typ', 'Typ'], ['ticker', 'Ticker'], ['ilosc', 'Ilość'], ['cena', 'Cena'], ['prowizja', 'Prowizja'], ['kurs', 'Kurs NBP (D-1)'], ['notatka', 'Notatka'], ['zakup', 'Zamyka zakup (ID)']] },
  dywidendy: { sheet: 'Dywidendy', cols: [['id', 'ID'], ['data', 'Data'], ['strategia', 'Strategia'], ['ticker', 'Ticker'], ['brutto', 'Kwota brutto'], ['podatek', 'Podatek u źródła'], ['kurs', 'Kurs NBP (D-1)'], ['notatka', 'Notatka']] },
  wplaty: { sheet: 'Wpłaty', cols: [['id', 'ID'], ['data', 'Data'], ['konto', 'Konto'], ['kwotaPLN', 'Kwota PLN'], ['kwotaWal', 'Kwota w walucie konta'], ['notatka', 'Notatka']] },
  strategie: { sheet: 'Strategie', cols: [['id', 'ID'], ['nazwa', 'Nazwa'], ['konto', 'Konto'], ['kapital', 'Kapitał przeznaczony'], ['opis', 'Opis'], ['kolor', 'Kolor']] },
  konta: { sheet: 'Konta', cols: [['id', 'ID'], ['nazwa', 'Nazwa'], ['typ', 'Typ podatkowy'], ['waluta', 'Waluta'], ['gotowka', 'Gotówka'], ['model', 'W modelu 2.1']] },
  instrumenty: { sheet: 'Instrumenty', cols: [['id', 'ID'], ['ticker', 'Ticker'], ['nazwa', 'Nazwa'], ['klasa', 'Klasa'], ['waluta', 'Waluta'], ['cena', 'Cena ręczna'], ['dataCeny', 'Data ceny'], ['symbol', 'Symbol Google Finance'], ['cenaAuto', 'Cena auto (Google)']] },
  inflacja: { sheet: 'Inflacja', cols: [['miesiac', 'Miesiąc'], ['mm', 'Inflacja PL m/m %'], ['mmUS', 'Inflacja USA m/m %']] },
  historia: { sheet: 'Historia', cols: [['data', 'Data'], ['wartosc', 'Wartość PLN'], ['kapital', 'Wpłacony kapitał PLN'], ['konta', 'Wartości kont (JSON)'], ['strat', 'Wartości strategii (JSON)']] },
  cele: { sheet: 'Cele 2.1', cols: [['id', 'ID'], ['konto', 'Konto (puste = cały portfel)'], ['koszyk', 'Koszyk'], ['tickery', 'Instrumenty'], ['grupa', 'Grupa'], ['cel', 'Cel %']] },
  alerty: { sheet: 'Alerty', cols: [['id', 'ID'], ['aktywny', 'Aktywny'], ['typ', 'Typ'], ['ticker', 'Instrument'], ['konto', 'Konto'], ['koszyk', 'Koszyk'], ['poziom', 'Poziom'], ['prog', 'Próg blisko'], ['notatka', 'Notatka'],
    ['opis', 'Opis'], ['yahoo', 'Symbol Yahoo'], ['yahooR', 'Symbol Yahoo (ręczny)'], ['waluta', 'Waluta'], ['cenaApp', 'Cena (aplikacja)'], ['srednia', 'Średnia cena zakupu'], ['dane', 'Dane dla skryptu (JSON)']] },
  ustawienia: { sheet: 'Ustawienia', cols: [['klucz', 'Klucz'], ['wartosc', 'Wartość']] },
};
const uid = () => Math.random().toString(36).slice(2, 10);

let CFG = Object.assign({ clientId: '', sheetId: '', sheetUrl: '', strataPrev: {}, kryptoPrev: {} }, lsGet(LS_CFG, {}));
const LS_DEMO = 'portfel_demo_v1';
const dataKey = () => CFG.demo ? LS_DEMO : LS_DATA, dirtyKey = () => CFG.demo ? 'portfel_demo_dirty_v1' : LS_DIRTY;
let S = lsGet(dataKey(), null) || defaultState();
let DIRTY = new Set(lsGet(dirtyKey(), []));
const SYNC = { token: null, exp: 0, state: 'local', msg: 'Dane tylko w tej przeglądarce', busy: false, timer: null, gisReady: false };

function saveLocal() { lsSet(dataKey(), S); lsSet(dirtyKey(), [...DIRTY]); }
function saveCfg() { lsSet(LS_CFG, CFG); }
function changed(...tables) { tables.forEach(t => DIRTY.add(t)); saveLocal(); scheduleSync(); }

/* ---------- konwersja tabel <-> wiersze arkusza ---------- */
function toRows(name) {
  const T = TABLES[name];
  let list;
  if (name === 'ustawienia') {
    const u = S.ustawienia; list = [{ klucz: 'stawka', wartosc: u.stawka }, { klucz: 'kursyData', wartosc: u.kursyData || '' },
      ...Object.entries(u.kursy || {}).map(([k, v]) => ({ klucz: 'kurs_' + k, wartosc: v }))];
  } else list = S[name] || [];
  const cell = (k, v) => { if (k === 'cenaAuto') return ''; v = v ?? ''; if (typeof v === 'string' && !['id', 'miesiac', 'data', 'dataCeny', 'klucz', 'ticker', 'nazwa'].includes(k) && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v); return v; };
  return [T.cols.map(c => c[1]), ...list.map(o => T.cols.map(([k]) => cell(k, o[k])))];
}
function fromRows(name, rows) {
  const T = TABLES[name]; if (!rows || !rows.length) return null;
  const head = rows[0].map(h => String(h).trim());
  const idx = T.cols.map(([k, lab]) => head.indexOf(lab));
  const objs = rows.slice(1).filter(r => r.some(v => v !== '' && v !== null)).map(r => {
    const o = {}; T.cols.forEach(([k], i) => { let v = idx[i] >= 0 ? r[idx[i]] : ''; if (v === undefined || v === null) v = '';
      if ((k === 'data' || k === 'dataCeny') && typeof v === 'number') v = new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
      o[k] = v; });
    if ('id' in o && !o.id) o.id = uid();
    return o; });
  if (name === 'ustawienia') {
    const u = { kursy: {}, kursyData: '', stawka: 19 };
    objs.forEach(o => { if (o.klucz === 'stawka') u.stawka = num(o.wartosc) || 19; else if (o.klucz === 'kursyData') u.kursyData = String(o.wartosc);
      else if (String(o.klucz).startsWith('kurs_')) u.kursy[o.klucz.slice(5)] = o.wartosc; });
    return u;
  }
  return objs;
}

/* ---------- formuła ceny w arkuszu ----------
   YAHOO:GC=F  -> =YAHOO("GC=F|<data>")  (funkcja ze skryptu Portfel_Ceny.gs; data po „|” wymusza odświeżenie raz dziennie)
   =COKOLWIEK  -> wpisane wprost jako formuła
   inne        -> =GOOGLEFINANCE("SYMBOL") */
function priceFormula(sym, day) {
  sym = String(sym || '').trim(); if (!sym) return '';
  if (sym.startsWith('=')) return sym;
  if (/^YAHOO:/i.test(sym)) return `=YAHOO("${sym.slice(6).replace(/"/g, '')}|${day}")`;   // jeden argument – bez separatora
  return `=GOOGLEFINANCE("${sym.replace(/"/g, '')}")`;
}

/* ---------- Google: logowanie ---------- */
// arkusz utworzony przez aplikację -> drive.file (dostęp tylko do niego); własny arkusz użytkownika -> spreadsheets
const scopeNow = () => (CFG.sheetId && !CFG.createdByApp) ? 'https://www.googleapis.com/auth/spreadsheets' : 'https://www.googleapis.com/auth/drive.file';
let tokenClient = null;
function setSync(state, msg) { SYNC.state = state; SYNC.msg = msg; if (typeof renderSyncBadge === 'function') renderSyncBadge(); }
function loadGis() {
  return new Promise((res, rej) => {
    if (window.google && google.accounts && google.accounts.oauth2) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('Nie udało się wczytać logowania Google (brak internetu lub blokada).'));
    document.head.appendChild(s);
  });
}
async function googleConnect(interactive = true) {
  if (!CFG.clientId) { setSync('local', 'Wpisz Client ID w Ustawieniach, aby połączyć z Google'); return false; }
  try { await loadGis(); } catch (e) { setSync('error', e.message); return false; }
  return new Promise(resolve => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CFG.clientId, scope: scopeNow(),
      callback: async (resp) => {
        if (resp.error) { setSync('error', 'Logowanie przerwane: ' + resp.error); return resolve(false); }
        SYNC.token = resp.access_token; SYNC.exp = Date.now() + (resp.expires_in - 60) * 1000;
        CFG.connected = true; saveCfg();
        try { await afterLogin(); resolve(true); } catch (e) { setSync('error', 'Błąd synchronizacji: ' + e.message); resolve(false); }
      },
      error_callback: (e) => { setSync('error', 'Logowanie Google: ' + (e.message || e.type)); resolve(false); },
    });
    tokenClient.requestAccessToken({ prompt: interactive && !CFG.connectedOnce ? 'consent' : '' });
  });
}
function googleDisconnect() {
  try { if (SYNC.token && window.google) google.accounts.oauth2.revoke(SYNC.token, () => {}); } catch (e) {}
  SYNC.token = null; CFG.connected = false; saveCfg(); setSync('local', 'Rozłączono – dane tylko w tej przeglądarce');
}
async function ensureToken() { return !!(SYNC.token && Date.now() < SYNC.exp); }
async function gapi(method, url, body) {
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + SYNC.token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { SYNC.token = null; throw new Error('Sesja Google wygasła – zaloguj się ponownie'); }
  if (!r.ok) { let t = ''; try { t = (await r.json()).error.message; } catch (e) {} throw new Error(`Google API ${r.status} ${t}`); }
  return r.json();
}
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

async function createSpreadsheet() {
  const res = await gapi('POST', SHEETS, { properties: { title: 'Portfel – dane' },
    sheets: Object.values(TABLES).map(t => ({ properties: { title: t.sheet, gridProperties: { frozenRowCount: 1 } } })) });
  CFG.sheetId = res.spreadsheetId; CFG.sheetUrl = res.spreadsheetUrl; CFG.createdByApp = true; saveCfg();
  // nagłówki pogrubione
  const reqs = res.sheets.map(sh => ({ repeatCell: { range: { sheetId: sh.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
    cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: .9, green: .93, blue: .98 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } }));
  await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: reqs });
}
async function ensureSheets() {
  const meta = await gapi('GET', `${SHEETS}/${CFG.sheetId}?fields=sheets.properties.title,spreadsheetUrl`);
  CFG.sheetUrl = meta.spreadsheetUrl; saveCfg();
  const have = new Set(meta.sheets.map(s => s.properties.title));
  const missing = Object.values(TABLES).filter(t => !have.has(t.sheet));
  if (missing.length) await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: missing.map(t => ({ addSheet: { properties: { title: t.sheet, gridProperties: { frozenRowCount: 1 } } } })) });
  return missing.map(t => Object.keys(TABLES).find(k => TABLES[k] === t));
}
async function afterLogin() {
  setSync('busy', 'Łączenie z arkuszem…');
  let fresh = false;
  if (!CFG.sheetId) { await createSpreadsheet(); fresh = true; }
  const missing = await ensureSheets();
  if (fresh) { Object.keys(TABLES).forEach(t => DIRTY.add(t)); }
  else {
    await pullAll();
    missing.forEach(t => DIRTY.add(t));
  }
  CFG.connectedOnce = true; saveCfg();
  if (CFG.priceDay !== todayStr()) DIRTY.add('instrumenty');
  await pushDirty();
  setTimeout(() => refreshAutoPrices().catch(() => {}), 5000);   // ceny z GOOGLEFINANCE liczą się kilka sekund
  setTimeout(() => { if (typeof odswiezBenchmarki === 'function') odswiezBenchmarki(false); }, 9000);
}
async function pullAll() {
  if (CFG.demo) return;
  const names = Object.keys(TABLES).filter(n => !DIRTY.has(n));   // lokalne niezapisane zmiany mają pierwszeństwo
  if (!names.length) return;
  const q = names.map(n => 'ranges=' + encodeURIComponent(`'${TABLES[n].sheet}'!A1:Z5000`)).join('&');
  const res = await gapi('GET', `${SHEETS}/${CFG.sheetId}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  let any = false;
  res.valueRanges.forEach((vr, i) => {
    const name = names[i], rows = vr.values || [];
    if (rows.length <= 1 && name !== 'ustawienia') { if ((S[name] || []).length) DIRTY.add(name); return; }  // pusty arkusz -> wyślij lokalne
    const data = fromRows(name, rows); if (!data) return;
    if (name === 'ustawienia') { S.ustawienia = Object.assign(S.ustawienia, data, { kursy: Object.assign({}, S.ustawienia.kursy, data.kursy) }); }
    else if (name === 'instrumenty') {
      S.instrumenty = data.map(o => { const c = String(o.cenaAuto); o.cenaAuto = typeof o.cenaAuto === 'number' ? o.cenaAuto : ''; return o; });
    } else S[name] = data;
    if (name === 'cele') S.cele.forEach(c => { if (c.konto === undefined || c.konto === null) c.konto = ''; if (!c.tickery) c.tickery = c.koszyk; });
    any = true;
  });
  saveLocal();
  if (any && typeof render === 'function') render();
}
async function pushDirty() {
  if (CFG.demo) return;
  if (typeof prepAlerty === 'function' && C && prepAlerty()) { DIRTY.add('alerty'); saveLocal(); }
  if (!CFG.sheetId || !DIRTY.size) { setSync('ok', 'Zapisano w Google Sheets ✓'); return; }
  if (SYNC.busy) return; SYNC.busy = true;
  const names = [...DIRTY];
  try {
    setSync('busy', 'Zapisywanie w Google Sheets…');
    await gapi('POST', `${SHEETS}/${CFG.sheetId}/values:batchClear`, { ranges: names.map(n => `'${TABLES[n].sheet}'!A1:Z5000`) });
    await gapi('POST', `${SHEETS}/${CFG.sheetId}/values:batchUpdate`, { valueInputOption: 'RAW',
      data: names.map(n => ({ range: `'${TABLES[n].sheet}'!A1`, values: toRows(n) })) });
    if (names.includes('instrumenty')) {
      const ci = TABLES.instrumenty.cols.findIndex(c => c[0] === 'cenaAuto'), col = String.fromCharCode(65 + ci);
      const day = todayStr();
      const vals = S.instrumenty.map(i => [priceFormula(i.symbol, day)]);
      CFG.priceDay = day; saveCfg();
      if (vals.length) await gapi('POST', `${SHEETS}/${CFG.sheetId}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data: [{ range: `'Instrumenty'!${col}2`, values: vals }] });
    }
    names.forEach(n => DIRTY.delete(n)); saveLocal();
    try { await buildSummary(false); } catch (e) { console.warn('Podsumowanie:', e); }
    try { await buildAnalizy(false); } catch (e) { console.warn('Analizy:', e); }
    setSync('ok', 'Zapisano w Google Sheets ✓ ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSync('error', e.message + ' – zmiany czekają w przeglądarce');
  } finally { SYNC.busy = false; }
}
function scheduleSync() {
  if (CFG.demo) { setSync('local', 'Tryb demo – nic nie zapisuje się w arkuszu'); return; }
  if (!CFG.sheetId || !CFG.connected) { setSync('local', DIRTY.size && CFG.sheetId ? `${DIRTY.size} tabel czeka na wysłanie – połącz z Google` : 'Dane tylko w tej przeglądarce'); return; }
  clearTimeout(SYNC.timer);
  setSync('pending', 'Zmiany czekają na zapis…');
  SYNC.timer = setTimeout(async () => { if (await ensureToken()) pushDirty(); else setSync('pending', `Kliknij tutaj, aby zapisać zmiany w Google Sheets`); }, 1500);
}
async function syncNow() {
  if (CFG.demo) { toast('Tryb demo – wyjdź z niego, aby synchronizować z arkuszem'); return; }
  if (!CFG.clientId) { go('ustawienia'); return; }
  if (!SYNC.token || Date.now() > SYNC.exp) { await googleConnect(true); return; }
  try { setSync('busy', 'Synchronizacja…'); await pushDirty(); await pullAll(); await refreshAutoPrices(); setSync('ok', 'Zsynchronizowano ✓'); }
  catch (e) { setSync('error', e.message); }
}
async function refreshAutoPrices() {
  if (!CFG.sheetId || !SYNC.token) return;
  const res = await gapi('GET', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Instrumenty'!A1:Z500")}?valueRenderOption=UNFORMATTED_VALUE`);
  const rows = res.values || []; if (rows.length < 2) return;
  const head = rows[0], it = head.indexOf('Ticker'), ic = head.indexOf('Cena auto (Google)');
  if (it < 0 || ic < 0) return;
  rows.slice(1).forEach(r => { const i = S.instrumenty.find(x => x.ticker === r[it]); if (i) i.cenaAuto = typeof r[ic] === 'number' ? r[ic] : ''; });
  saveLocal(); if (typeof render === 'function') render();
}

/* ---------- zakładka „Podsumowanie” w arkuszu (formuły – działa bez aplikacji) ---------- */
async function detectSep() {
  CFG.sep = CFG.sep || {}; if (CFG.sep[CFG.sheetId]) return CFG.sep[CFG.sheetId];
  try { await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: [{ addSheet: { properties: { title: 'Szukaj' } } }] }); } catch (e) {}
  await gapi('PUT', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Szukaj'!Z1")}?valueInputOption=USER_ENTERED`, { values: [['=SUM(1,2)']] });
  const r = await gapi('GET', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Szukaj'!Z1")}?valueRenderOption=UNFORMATTED_VALUE`);
  const sep = (r.values && r.values[0] && r.values[0][0] === 3) ? ',' : ';';
  CFG.sep[CFG.sheetId] = sep; saveCfg(); return sep;
}
function summarySig() {
  const pairs = [...new Set(S.transakcje.map(t => t.strategia + '|' + t.ticker))].sort();
  return JSON.stringify([pairs, S.strategie.map(s => s.nazwa), S.konta.map(k => k.nazwa), S.instrumenty.map(i => i.ticker), S.cele.map(c => [c.konto, c.koszyk, c.tickery, c.cel]), (S.alerty || []).map(a => [a.id, a.aktywny, a.typ, a.ticker, a.konto, a.koszyk, a.poziom, a.notatka, a.srednia]), [...new Set(S.wplaty.map(w => String(w.data).slice(0, 4)))].sort(), new Date().getFullYear(), 5]);
}
async function buildSummary(force) {
  if (CFG.demo) throw new Error('W trybie demo arkusz nie jest zmieniany');
  if (!CFG.sheetId || !SYNC.token) return;
  const sig = summarySig(); if (!force && CFG.sumSig && CFG.sumSig[CFG.sheetId] === sig) return;
  const SEP = await detectSep();
  const f = x => x.replace(/§/g, SEP);
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const pairs = [...new Set(S.transakcje.filter(t => t.strategia && t.ticker).map(t => t.strategia + '|' + t.ticker))].sort().map(p => p.split('|'));
  const strat = S.strategie.map(s => s.nazwa), konta = S.konta, instr = S.instrumenty.filter(i => i.ticker);
  const N = 3000, T = (c) => `Transakcje!$${c}$2:$${c}$${N}`;
  const kursF = cur => `IF(${cur}="PLN"§1§IFERROR(VALUE(INDEX(Ustawienia!$B:$B§MATCH("kurs_"&${cur}§Ustawienia!$A:$A§0)))§0))`;
  // --- pomocnicza tabela strategia × instrument (kolumny T:AC) ---
  const H0 = 2, HL = Math.max(H0, H0 + pairs.length - 1);
  const help = [['Strategia', 'Ticker', 'Ilość', 'Cena', 'Kurs', 'Waluta', 'Wartość PLN', 'Koszt PLN', 'Konto', 'Klasa']];
  pairs.forEach(([st, tk], i) => { const r = H0 + i, m = `MATCH($U${r}§Instrumenty!$B:$B§0)`;
    help.push([st, tk,
      f(`=SUMIFS(Transakcje!$F:$F§Transakcje!$C:$C§$T${r}§Transakcje!$E:$E§$U${r}§Transakcje!$D:$D§"KUPNO")-SUMIFS(Transakcje!$F:$F§Transakcje!$C:$C§$T${r}§Transakcje!$E:$E§$U${r}§Transakcje!$D:$D§"SPRZEDAŻ")`),
      f(`=IFERROR(IF(INDEX(Instrumenty!$F:$F§${m})<>""§INDEX(Instrumenty!$F:$F§${m})§INDEX(Instrumenty!$I:$I§${m}))§0)`),
      f('=' + kursF(`$Y${r}`)),
      f(`=IFERROR(INDEX(Instrumenty!$E:$E§${m})§"PLN")`),
      f(`=IFERROR($V${r}*$W${r}*$X${r}§0)`),
      f(`=IFERROR(IF(SUMIFS(Transakcje!$F:$F§Transakcje!$C:$C§$T${r}§Transakcje!$E:$E§$U${r}§Transakcje!$D:$D§"KUPNO")=0§0§SUMPRODUCT((${T('C')}=$T${r})*(${T('E')}=$U${r})*(${T('D')}="KUPNO")*(${T('F')}*${T('G')}+${T('H')})*IF($Y${r}="PLN"§1§${T('I')}+(${T('I')}="")*$X${r}))*$V${r}/SUMIFS(Transakcje!$F:$F§Transakcje!$C:$C§$T${r}§Transakcje!$E:$E§$U${r}§Transakcje!$D:$D§"KUPNO"))§0)`),
      f(`=IFERROR(INDEX(Strategie!$C:$C§MATCH($T${r}§Strategie!$B:$B§0))§"")`),
      f(`=IFERROR(INDEX(Instrumenty!$D:$D§${m})§"Inne")`)]); });
  const HR = (c) => `$${c}$${H0}:$${c}$${HL}`;
  // --- część widoczna (kolumny B:I) ---
  const rows = []; const put = (r, c, v) => { while (rows.length < r) rows.push([]); const row = rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; };
  put(1, 2, 'Mój portfel – podsumowanie');
  put(2, 2, 'Liczy się samo z zakładek tego arkusza – działa także bez aplikacji. Koszt pozycji liczony średnią ceną zakupu, gotówka ≈ wpłaty − koszt pozycji (dokładne wyliczenia, FIFO i podatki są w aplikacji).');
  const sK0 = 9 + strat.length + 3, sKL = sK0 + konta.length - 1, sKT = sKL + 1;
  const sI0 = sKT + 4, sIL = sI0 + Math.max(instr.length, 1) - 1;
  const VAL = `$F$${sKT}`;
  [['Wartość portfela', f(`=F${sKT}`)], ['Wpłacony kapitał', f(`=SUM('Wpłaty'!$D:$D)`)], ['Zysk / strata', '=B5-D5'], ['Zysk / strata %', f(`=IF(D5=0§""§F5/D5)`)]]
    .forEach(([l, v], k) => { put(4, 2 + k * 2, l); put(5, 2 + k * 2, v); });
  put(6, 2, f(`=IFERROR("≈ "&TEXT(B5/${kursF('"USD"')}§"# ##0")&" USD"§"")`));
  put(6, 8, f(`="Kursy z "&IFERROR(INDEX(Ustawienia!$B:$B§MATCH("kursyData"§Ustawienia!$A:$A§0))§"–")`));
  // strategie
  put(8, 2, 'STRATEGIE');
  ['Strategia', 'Konto', 'Wartość PLN', 'Koszt PLN', 'Zysk PLN', 'Zysk %', 'Udział'].forEach((h, k) => put(9, 2 + k, h));
  strat.forEach((st, i) => { const r = 10 + i;
    put(r, 2, st); put(r, 3, f(`=IFERROR(INDEX(Strategie!$C:$C§MATCH(B${r}§Strategie!$B:$B§0))§"")`));
    put(r, 4, f(`=SUMIF(${HR('T')}§B${r}§${HR('Z')})`)); put(r, 5, f(`=SUMIF(${HR('T')}§B${r}§${HR('AA')})`));
    put(r, 6, `=D${r}-E${r}`); put(r, 7, f(`=IF(E${r}=0§""§F${r}/E${r})`)); put(r, 8, f(`=IF(${VAL}=0§""§D${r}/${VAL})`)); });
  // konta
  put(sK0 - 2, 2, 'KONTA');
  ['Konto', 'Typ', 'Pozycje PLN', 'Gotówka PLN', 'Razem PLN', 'Wpłacono PLN', 'Zysk PLN', 'Zysk %'].forEach((h, k) => put(sK0 - 1, 2 + k, h));
  konta.forEach((k, i) => { const r = sK0 + i, m = `MATCH(B${r}§Konta!$B:$B§0)`;
    put(r, 2, k.nazwa); put(r, 3, f(`=IFERROR(INDEX(Konta!$C:$C§${m})§"")`));
    put(r, 4, f(`=SUMIF(${HR('AB')}§B${r}§${HR('Z')})`));
    put(r, 5, f(`=IFERROR(IF(INDEX(Konta!$E:$E§${m})<>""§N(INDEX(Konta!$E:$E§${m}))*${kursF(`INDEX(Konta!$D:$D§${m})`)}§MAX(0§SUMIF('Wpłaty'!$C:$C§B${r}§'Wpłaty'!$D:$D)-SUMIF(${HR('AB')}§B${r}§${HR('AA')})))§0)`));
    put(r, 6, `=D${r}+E${r}`); put(r, 7, f(`=SUMIF('Wpłaty'!$C:$C§B${r}§'Wpłaty'!$D:$D)`));
    put(r, 8, f(`=IF(G${r}=0§""§F${r}-G${r})`)); put(r, 9, f(`=IF(G${r}=0§""§H${r}/G${r})`)); });
  put(sKT, 2, 'RAZEM'); ['D', 'E', 'F', 'G'].forEach((c, k) => put(sKT, 4 + k, `=SUM(${c}${sK0}:${c}${sKL})`));
  put(sKT, 8, f(`=IF(G${sKT}=0§""§F${sKT}-G${sKT})`)); put(sKT, 9, f(`=IF(G${sKT}=0§""§H${sKT}/G${sKT})`));
  // instrumenty
  put(sI0 - 2, 2, 'INSTRUMENTY');
  ['Ticker', 'Nazwa', 'Ilość', 'Cena', 'Wartość PLN', 'Udział'].forEach((h, k) => put(sI0 - 1, 2 + k, h));
  instr.forEach((it, i) => { const r = sI0 + i, m = `MATCH(B${r}§Instrumenty!$B:$B§0)`;
    put(r, 2, it.ticker); put(r, 3, f(`=IFERROR(INDEX(Instrumenty!$C:$C§${m})§"")`));
    put(r, 4, f(`=SUMIF(${HR('U')}§B${r}§${HR('V')})`));
    put(r, 5, f(`=IFERROR(IF(INDEX(Instrumenty!$F:$F§${m})<>""§INDEX(Instrumenty!$F:$F§${m})§INDEX(Instrumenty!$I:$I§${m}))§"")`));
    put(r, 6, f(`=SUMIF(${HR('U')}§B${r}§${HR('Z')})`)); put(r, 7, f(`=IF(${VAL}=0§""§F${r}/${VAL})`)); });
  // portfel docelowy – cały portfel
  const cele0 = S.cele.filter(c => !(c.konto || '') && (c.koszyk || c.tickery));
  const sM0 = sIL + 4, sML = sM0 + Math.max(cele0.length, 1) - 1;
  put(sM0 - 2, 2, 'PORTFEL DOCELOWY – CAŁY PORTFEL');
  ['Koszyk', 'Instrumenty', 'Cel', 'Wartość PLN', 'Udział', 'Odchylenie', 'Różnica do celu PLN'].forEach((h, k) => put(sM0 - 1, 2 + k, h));
  cele0.forEach((c, i) => { const r = sM0 + i, lista = String(c.tickery || c.koszyk).split(',').map(x => x.trim()).filter(Boolean);
    put(r, 2, c.koszyk); put(r, 3, lista.join(', ')); put(r, 4, num(c.cel) / 100);
    put(r, 5, f('=' + (lista.map(t => `SUMIF(${HR('U')}§${q(t)}§${HR('Z')})`).join('+') || '0')));
    put(r, 6, f(`=IF(SUM($E$${sM0}:$E$${sML})=0§""§E${r}/SUM($E$${sM0}:$E$${sML}))`));
    put(r, 7, f(`=IF(F${r}=""§""§F${r}-D${r})`)); put(r, 8, `=D${r}*SUM($E$${sM0}:$E$${sML})-E${r}`); });
  // portfele docelowe kont
  const modelRows = {};   // konto|koszyk -> wiersz (do alertów)
  cele0.forEach((c, i) => { modelRows['|' + c.koszyk] = sM0 + i; });
  let rr = sML + 3; const extraSect = [];
  konta.filter(k => S.cele.some(c => c.konto === k.nazwa && (c.koszyk || c.tickery))).forEach(k => {
    const cc = S.cele.filter(c => c.konto === k.nazwa && (c.koszyk || c.tickery)), a0 = rr + 2, aL = a0 + cc.length - 1;
    put(rr, 2, 'PORTFEL DOCELOWY – ' + k.nazwa.toUpperCase());
    ['Koszyk', 'Instrumenty', 'Cel', 'Wartość PLN', 'Udział', 'Odchylenie', 'Różnica do celu PLN'].forEach((h, j) => put(rr + 1, 2 + j, h));
    cc.forEach((c, i) => { const r = a0 + i, lista = String(c.tickery || c.koszyk).split(',').map(x => x.trim()).filter(Boolean); modelRows[k.nazwa + '|' + c.koszyk] = r;
      put(r, 2, c.koszyk); put(r, 3, lista.join(', ')); put(r, 4, num(c.cel) / 100);
      put(r, 5, f('=' + (lista.map(t => `SUMIFS(${HR('Z')}§${HR('U')}§${q(t)}§${HR('AB')}§${q(k.nazwa)})`).join('+') || '0')));
      put(r, 6, f(`=IF(SUM($E$${a0}:$E$${aL})=0§""§E${r}/SUM($E$${a0}:$E$${aL}))`));
      put(r, 7, f(`=IF(F${r}=""§""§F${r}-D${r})`)); put(r, 8, `=D${r}*SUM($E$${a0}:$E$${aL})-E${r}`); });
    extraSect.push({ kind: 'model', s: rr, a: a0, b: aL }); rr = aL + 3; });
  // wyniki wg lat
  const lataAll = [...new Set([...S.wplaty.map(w => String(w.data).slice(0, 4)), ...S.transakcje.map(t => String(t.data).slice(0, 4)), ...S.dywidendy.map(d => String(d.data).slice(0, 4)), String(new Date().getFullYear())])].filter(y => /^\d{4}$/.test(y)).sort();
  const y0 = rr + 2, yL = y0 + lataAll.length - 1, D = c => `'Dywidendy'!$${c}$2:$${c}$${N}`, H = c => `'Historia'!$${c}$2:$${c}$5000`;
  put(rr, 2, 'WYNIKI WG LAT');
  ['Rok', 'Wpłaty netto', 'Dywidendy i odsetki netto', 'Prowizje', 'Wartość na koniec roku', 'Zysk w roku', 'Zysk w roku %'].forEach((h, j) => put(rr + 1, 2 + j, h));
  lataAll.forEach((y, i) => { const r = y0 + i;
    const Y = `(LEFT(§4)=""&B${r})`, yr = rng => Y.replace('§', rng + '§');
    put(r, 2, y); put(r, 3, f(`=SUMPRODUCT(${yr(`'Wpłaty'!$B$2:$B$${N}`)}*IFERROR(VALUE('Wpłaty'!$D$2:$D$${N})§0))`));
    put(r, 4, f(`=SUMPRODUCT(${yr(D('B'))}*(IFERROR(VALUE(${D('E')})§0)-IFERROR(VALUE(${D('F')})§0))*IF(${D('G')}=""§1§IFERROR(VALUE(${D('G')})§1)))`));
    put(r, 5, f(`=SUMPRODUCT(${yr(T('B'))}*IFERROR(VALUE(${T('H')})§0)*IF(${T('I')}=""§1§IFERROR(VALUE(${T('I')})§1)))`));
    put(r, 6, y === String(new Date().getFullYear()) ? `=B5` : f(`=IFERROR(LOOKUP(2§1/(LEFT(${H('A')}§4)=""&B${r})§${H('B')})§"")`));
    put(r, 7, i === 0 ? f(`=IF(F${r}=""§""§F${r}-C${r})`) : f(`=IF(OR(F${r}=""§F${r - 1}="")§""§F${r}-F${r - 1}-C${r})`));
    put(r, 8, i === 0 ? f(`=IF(OR(G${r}=""§C${r}=0)§""§G${r}/C${r})`) : f(`=IF(OR(G${r}=""§F${r - 1}+C${r}/2=0)§""§G${r}/(F${r - 1}+C${r}/2))`)); });
  extraSect.push({ kind: 'lata', s: rr, a: y0, b: yL }); rr = yL + 2;
  put(rr, 2, 'Roczna stopa zwrotu (XIRR, od wszystkich wpłat):'); put(rr, 6, f(`=IFERROR(XIRR({ARRAYFORMULA(-IFERROR(VALUE(FILTER('Wpłaty'!$D$2:$D$${N}§'Wpłaty'!$B$2:$B$${N}<>""))§0));B5}§{ARRAYFORMULA(IFERROR(DATEVALUE(FILTER('Wpłaty'!$B$2:$B$${N}§'Wpłaty'!$B$2:$B$${N}<>""))§FILTER('Wpłaty'!$B$2:$B$${N}§'Wpłaty'!$B$2:$B$${N}<>"")));TODAY()})§"")`));
  extraSect.push({ kind: 'xirr', s: rr }); rr += 3;
  // alerty
  const al = (S.alerty || []).filter(a => a.aktywny !== 'NIE');
  if (al.length) {
    const a0 = rr + 2, aL = a0 + al.length - 1;
    put(rr, 2, 'ALERTY'); ['Alert', 'Rodzaj', 'Poziom', 'Teraz', 'Odległość', 'Stan (skrypt e-mail)', 'Notatka'].forEach((h, j) => put(rr + 1, 2 + j, h));
    al.forEach((a, i) => { const r = a0 + i, m = `MATCH(${q(a.ticker)}§Instrumenty!$B:$B§0)`, cena = `IF(INDEX(Instrumenty!$F:$F§${m})<>""§INDEX(Instrumenty!$F:$F§${m})§INDEX(Instrumenty!$I:$I§${m}))`;
      put(r, 2, a.typ === 'CEL' ? `${a.koszyk} – ${a.konto || 'cały portfel'}` : a.ticker + (a.typ === 'ŚREDNIA' && a.konto ? ` (${a.konto})` : ''));
      put(r, 3, ({ 'KUPNO': 'cena spadnie do', 'SPRZEDAŻ': 'cena wzrośnie do', 'ŚREDNIA': 'zmiana od średniej %', 'CEL': 'odchylenie od celu (pp)' })[a.typ] || a.typ);
      put(r, 4, num(a.poziom));
      if (a.typ === 'KUPNO' || a.typ === 'SPRZEDAŻ') { put(r, 5, f(`=IFERROR(${cena}§"")`)); put(r, 6, f(`=IF(E${r}=""§""§ABS(E${r}/D${r}-1))`)); }
      else if (a.typ === 'ŚREDNIA') { put(r, 5, num(a.srednia) ? f(`=IFERROR((${cena}/${num(a.srednia)}-1)*100§"")`) : ''); put(r, 6, f(`=IF(E${r}=""§""§ABS(E${r}-D${r})/100)`)); }
      else { const mr = modelRows[(a.konto || '') + '|' + a.koszyk]; put(r, 5, mr ? f(`=IF(G${mr}=""§""§G${mr}*100)`) : ''); put(r, 6, f(`=IF(E${r}=""§""§MAX(0§D${r}-ABS(E${r}))/100)`)); }
      put(r, 7, f(`=IFERROR(VLOOKUP(${q(a.id)}§'Alerty – stan'!$A:$D§4§FALSE)§"włącz w menu Portfel")`)); put(r, 8, a.notatka || ''); });
    extraSect.push({ kind: 'alerty', s: rr, a: a0, b: aL }); rr = aL + 2;
  }
  put(rr, 2, 'Więcej analiz (benchmarki, mapa miesięcy, strategie, waluty, dochód pasywny) – zakładka „Analizy” (zapisywana przez aplikację raz dziennie).');
  extraSect.push({ kind: 'note', s: rr });
  const sEnd = rr;
  put(sEnd + 2, 2, f(`="Ostatnia przebudowa przez aplikację: ${new Date().toLocaleString('pl-PL')}"`));

  // --- arkusz: usuń stary, utwórz nowy ---
  const meta = await gapi('GET', `${SHEETS}/${CFG.sheetId}?fields=sheets.properties(sheetId,title)`);
  const old = meta.sheets.find(x => x.properties.title === 'Podsumowanie');
  const hist = meta.sheets.find(x => x.properties.title === 'Historia');
  const reqs = [];
  if (old) reqs.push({ deleteSheet: { sheetId: old.properties.sheetId } });
  reqs.push({ addSheet: { properties: { title: 'Podsumowanie', index: 0, tabColor: { red: .08, green: .4, blue: .75 }, gridProperties: { rowCount: Math.max(220, HL + 10, sEnd + 20), columnCount: 30, hideGridlines: true, frozenRowCount: 0 } } } });
  const add = await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: reqs });
  const sid = add.replies[add.replies.length - 1].addSheet.properties.sheetId;
  await gapi('POST', `${SHEETS}/${CFG.sheetId}/values:batchUpdate`, { valueInputOption: 'USER_ENTERED', data: [
    { range: "'Podsumowanie'!A1", values: rows }, { range: `'Podsumowanie'!T1`, values: help }] });

  // --- formatowanie ---
  const C = (r0, r1, c0, c1) => ({ sheetId: sid, startRowIndex: r0 - 1, endRowIndex: r1, startColumnIndex: c0 - 1, endColumnIndex: c1 });
  const rgb = h => ({ red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 });
  const fmt = (range, uf, fields) => ({ repeatCell: { range, cell: { userEnteredFormat: uf }, fields: 'userEnteredFormat(' + fields + ')' } });
  const money = { numberFormat: { type: 'NUMBER', pattern: '#,##0.00 "zł";[Red]-#,##0.00 "zł";"–"' } };
  const pctF = { numberFormat: { type: 'PERCENT', pattern: '0.0%;[Red]-0.0%;"–"' } };
  const head = (r, c0, c1) => fmt(C(r, r, c0, c1), { backgroundColor: rgb('0B3D91'), textFormat: { bold: true, foregroundColor: rgb('FFFFFF'), fontSize: 9 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' }, 'backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy');
  const sect = r => fmt(C(r, r, 2, 9), { textFormat: { bold: true, fontSize: 11, foregroundColor: rgb('0B3D91') }, borders: { bottom: { style: 'SOLID_MEDIUM', color: rgb('0B3D91') } } }, 'textFormat,borders');
  const R = [
    fmt(C(1, Math.max(200, sEnd + 5), 1, 30), { textFormat: { fontFamily: 'Arial', fontSize: 10, foregroundColor: rgb('1F2937') }, verticalAlignment: 'MIDDLE' }, 'textFormat,verticalAlignment'),
    fmt(C(1, 1, 2, 2), { textFormat: { fontFamily: 'Arial', bold: true, fontSize: 18, foregroundColor: rgb('0B3D91') } }, 'textFormat'),
    fmt(C(2, 2, 2, 2), { textFormat: { fontFamily: 'Arial', italic: true, fontSize: 9, foregroundColor: rgb('6B7280') } }, 'textFormat'),
    fmt(C(4, 5, 2, 9), { backgroundColor: rgb('EEF4FC') }, 'backgroundColor'),
    fmt(C(4, 4, 2, 9), { textFormat: { fontFamily: 'Arial', fontSize: 9, foregroundColor: rgb('6B7280') } }, 'textFormat'),
    fmt(C(5, 5, 2, 9), { textFormat: { fontFamily: 'Arial', bold: true, fontSize: 16, foregroundColor: rgb('0B3D91') }, ...money }, 'textFormat,numberFormat'),
    fmt(C(5, 5, 8, 9), { ...pctF }, 'numberFormat'),
    fmt(C(4, 5, 2, 3), { backgroundColor: rgb('1565C0'), textFormat: { fontFamily: 'Arial', bold: true, fontSize: 16, foregroundColor: rgb('FFFFFF') } }, 'backgroundColor,textFormat'),
    fmt(C(4, 4, 2, 3), { textFormat: { fontFamily: 'Arial', fontSize: 9, foregroundColor: rgb('CFE0FF') } }, 'textFormat'),
    fmt(C(6, 6, 2, 9), { textFormat: { fontFamily: 'Arial', italic: true, fontSize: 9, foregroundColor: rgb('6B7280') } }, 'textFormat'),
    sect(8), head(9, 2, 8), fmt(C(10, 9 + strat.length, 4, 6), money, 'numberFormat'), fmt(C(10, 9 + strat.length, 7, 8), pctF, 'numberFormat'),
    sect(sK0 - 2), head(sK0 - 1, 2, 9), fmt(C(sK0, sKT, 4, 8), money, 'numberFormat'), fmt(C(sK0, sKT, 9, 9), pctF, 'numberFormat'),
    fmt(C(sKT, sKT, 2, 9), { textFormat: { bold: true }, borders: { top: { style: 'SOLID', color: rgb('0B3D91') } } }, 'textFormat,borders'),
    sect(sI0 - 2), head(sI0 - 1, 2, 7), fmt(C(sI0, sIL, 4, 4), { numberFormat: { type: 'NUMBER', pattern: '#,##0.######' } }, 'numberFormat'),
    fmt(C(sI0, sIL, 5, 5), { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } }, 'numberFormat'), fmt(C(sI0, sIL, 6, 6), money, 'numberFormat'),
    fmt(C(sI0, sIL, 7, 7), pctF, 'numberFormat'),
    sect(sM0 - 2), head(sM0 - 1, 2, 8), fmt(C(sM0, sML, 4, 4), pctF, 'numberFormat'), fmt(C(sM0, sML, 5, 5), money, 'numberFormat'),
    fmt(C(sM0, sML, 6, 7), pctF, 'numberFormat'), fmt(C(sM0, sML, 8, 8), money, 'numberFormat'),
    fmt(C(sEnd + 2, sEnd + 2, 2, 2), { textFormat: { italic: true, fontSize: 8, foregroundColor: rgb('9CA3AF') } }, 'textFormat'),
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 18 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 1, endIndex: 9 }, properties: { pixelSize: 125 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 24 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 40 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 19, endIndex: 29 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
    ...[2, 4, 6, 8].map(c => ({ mergeCells: { range: C(4, 4, c, c + 1), mergeType: 'MERGE_ALL' } })),
    ...[2, 4, 6, 8].map(c => ({ mergeCells: { range: C(5, 5, c, c + 1), mergeType: 'MERGE_ALL' } })),
  ];
  // pasy w tabelach
  extraSect.forEach(x => {
    if (x.kind === 'model') R.push(sect(x.s), head(x.s + 1, 2, 8), fmt(C(x.a, x.b, 4, 4), pctF, 'numberFormat'), fmt(C(x.a, x.b, 5, 5), money, 'numberFormat'), fmt(C(x.a, x.b, 6, 7), pctF, 'numberFormat'), fmt(C(x.a, x.b, 8, 8), money, 'numberFormat'));
    if (x.kind === 'lata') R.push(sect(x.s), head(x.s + 1, 2, 8), fmt(C(x.a, x.b, 3, 7), money, 'numberFormat'), fmt(C(x.a, x.b, 8, 8), pctF, 'numberFormat'));
    if (x.kind === 'xirr') R.push(fmt(C(x.s, x.s, 2, 6), { textFormat: { bold: true, foregroundColor: rgb('0B3D91') } }, 'textFormat'), fmt(C(x.s, x.s, 6, 6), { numberFormat: { type: 'PERCENT', pattern: '0.00%;[Red]-0.00%' }, textFormat: { bold: true, fontSize: 13, foregroundColor: rgb('0B3D91') } }, 'numberFormat,textFormat'));
    if (x.kind === 'alerty') R.push(sect(x.s), head(x.s + 1, 2, 8), fmt(C(x.a, x.b, 4, 5), { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } }, 'numberFormat'), fmt(C(x.a, x.b, 6, 6), pctF, 'numberFormat'),
      { addConditionalFormatRule: { rule: { ranges: [C(x.a, x.b, 7, 7)], booleanRule: { condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'osiągnięty' }] }, format: { backgroundColor: rgb('FDE2E2'), textFormat: { bold: true, foregroundColor: rgb('B91C1C') } } } }, index: 0 } },
      { addConditionalFormatRule: { rule: { ranges: [C(x.a, x.b, 7, 7)], booleanRule: { condition: { type: 'TEXT_CONTAINS', values: [{ userEnteredValue: 'blisko' }] }, format: { backgroundColor: rgb('FEF3C7'), textFormat: { foregroundColor: rgb('92400E') } } } }, index: 0 } });
    if (x.kind === 'note') R.push(fmt(C(x.s, x.s, 2, 2), { textFormat: { italic: true, fontSize: 9, foregroundColor: rgb('1565C0') } }, 'textFormat'));
    if (x.a && x.b >= x.a) R.push({ addBanding: { bandedRange: { range: C(x.a, x.b, 2, 8), rowProperties: { firstBandColor: rgb('FFFFFF'), secondBandColor: rgb('F5F8FC') } } } });
  });
  [[10, 9 + strat.length, 8], [sK0, sKL, 9], [sI0, sIL, 7], [sM0, sML, 8]].forEach(([a, b, c]) => { if (b >= a) R.push({ addBanding: { bandedRange: { range: C(a, b, 2, c), rowProperties: { firstBandColor: rgb('FFFFFF'), secondBandColor: rgb('F5F8FC') } } } }); });
  // wykresy
  const src = (r0, r1, c) => ({ sourceRange: { sources: [C(r0, r1, c, c)] } });
  const pie = (title, r0, r1, labCol, valCol, anchorRow) => ({ addChart: { chart: { spec: { title, titleTextFormat: { bold: true, fontFamily: 'Arial' }, fontName: 'Arial',
    pieChart: { legendPosition: 'RIGHT_LEGEND', pieHole: 0.5, domain: src(r0, r1, labCol), series: src(r0, r1, valCol) } },
    position: { overlayPosition: { anchorCell: { sheetId: sid, rowIndex: anchorRow, columnIndex: 10 }, widthPixels: 520, heightPixels: 300 } } } } });
  if (instr.length) R.push(pie('Struktura – instrumenty', sI0, sIL, 2, 6, 2));
  if (konta.length) R.push(pie('Konta', sK0, sKL, 2, 6, 19));
  if (hist) R.push({ addChart: { chart: { spec: { title: 'Wartość portfela i wpłacony kapitał', titleTextFormat: { bold: true, fontFamily: 'Arial' }, fontName: 'Arial',
    basicChart: { chartType: 'LINE', legendPosition: 'BOTTOM_LEGEND', headerCount: 1,
      axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS' }],
      domains: [{ domain: { sourceRange: { sources: [{ sheetId: hist.properties.sheetId, startRowIndex: 0, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 1 }] } } }],
      series: [1, 2].map(c => ({ series: { sourceRange: { sources: [{ sheetId: hist.properties.sheetId, startRowIndex: 0, endRowIndex: 5000, startColumnIndex: c, endColumnIndex: c + 1 }] } }, targetAxis: 'LEFT_AXIS' })) } },
    position: { overlayPosition: { anchorCell: { sheetId: sid, rowIndex: 36, columnIndex: 10 }, widthPixels: 520, heightPixels: 300 } } } } });
  await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: R });
  CFG.sumSig = CFG.sumSig || {}; CFG.sumSig[CFG.sheetId] = sig; saveCfg();
}

/* ---------- ogólne: policz formułę w arkuszu (zakładka „Szukaj”) i odczytaj wynik ---------- */
async function sheetCompute(cell, formula, readRange, maxIter = 20) {
  if (!CFG.sheetId || !SYNC.token || Date.now() > SYNC.exp) throw new Error('połącz z Google Sheets');
  try { await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: [{ addSheet: { properties: { title: 'Szukaj' } } }] }); } catch (e) {}
  await gapi('PUT', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Szukaj'!" + cell)}?valueInputOption=USER_ENTERED`, { values: [[formula]] });
  for (let i = 0; i < maxIter; i++) {
    await new Promise(r => setTimeout(r, i < 2 ? 2000 : 1200));
    const res = await gapi('GET', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Szukaj'!" + readRange)}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows = res.values || []; const f = rows[0] && rows[0][0];
    if (f === undefined || f === '' || /Loading|Wczytywanie|Ładowanie/i.test(String(f))) continue;
    if (String(f).startsWith('#')) throw new Error('brak funkcji w skrypcie – wklej aktualny Portfel_Ceny.gs');
    return rows;
  }
  throw new Error('przekroczono czas');
}

/* ---------- wyszukiwanie symboli (Yahoo przez arkusz) ---------- */
async function searchSymbols(q) {
  if (!CFG.sheetId || !SYNC.token || Date.now() > SYNC.exp) throw new Error('Połącz z Google Sheets, aby wyszukiwać');
  try { await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: [{ addSheet: { properties: { title: 'Szukaj' } } }] }); } catch (e) { /* już istnieje */ }
  const safe = q.replace(/["|]/g, '').trim();
  await gapi('PUT', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Szukaj'!A1")}?valueInputOption=USER_ENTERED`,
    { values: [[`=YAHOO_SZUKAJ("${safe}|${Date.now()}")`]] });
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, i < 3 ? 1500 : 1000));
    const res = await gapi('GET', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Szukaj'!A1:F10")}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows = res.values || []; const first = rows[0] && rows[0][0];
    if (first === undefined || first === '' || /Loading|Wczytywanie|Ładowanie/i.test(String(first))) continue;
    if (String(first).startsWith('#')) throw new Error('Brak funkcji YAHOO_SZUKAJ – wklej aktualny skrypt Portfel_Ceny.gs do arkusza');
    if (first === 'BRAK') return [];
    if (first === 'BŁĄD') throw new Error(rows[0][1] || 'Błąd Yahoo');
    return rows.filter(r => r[0]).map(r => ({ symbol: r[0], nazwa: r[1] || '', gielda: r[2] || '', typ: r[3] || '', waluta: r[4] || '', cena: typeof r[5] === 'number' ? r[5] : '' }));
  }
  throw new Error('Wyszukiwanie trwa zbyt długo – spróbuj ponownie');
}

/* ---------- inflacja PL i USA (FRED: HICP Polska z Eurostatu, CPI-U USA z BLS) ---------- */
const INFL_SRC = {
  PL: { fred: 'CP0000PLM086NEST', label: 'Eurostat HICP (Polska)' },
  US: { fred: 'CPIAUCNS', label: 'BLS CPI-U (USA)' },
};
function mmFromIndex(pts) {   // pts: [['RRRR-MM', indeks]] -> [['RRRR-MM', zmiana m/m %]]
  pts = pts.filter(x => typeof x[1] === 'number' && isFinite(x[1]) && /^\d{4}-\d{2}$/.test(x[0])).sort((a, b) => a[0].localeCompare(b[0]));
  const out = []; for (let i = 1; i < pts.length; i++) out.push([pts[i][0], Math.round((pts[i][1] / pts[i - 1][1] - 1) * 10000) / 100]);
  return out;
}
async function fredBrowser(id) {
  const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id);
  if (!r.ok) throw new Error('FRED ' + r.status);
  return (await r.text()).trim().split(/\r?\n/).slice(1).map(l => { const [d, v] = l.split(','); return [String(d).slice(0, 7), parseFloat(v)]; });
}
async function fredViaSheet(id) {   // zapasowo przez arkusz (gdy przeglądarka blokuje zapytanie)
  if (!CFG.sheetId || !SYNC.token || Date.now() > SYNC.exp) throw new Error('połącz z Google Sheets');
  try { await gapi('POST', `${SHEETS}/${CFG.sheetId}:batchUpdate`, { requests: [{ addSheet: { properties: { title: 'Szukaj' } } }] }); } catch (e) {}
  await gapi('PUT', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Szukaj'!H1")}?valueInputOption=USER_ENTERED`, { values: [[`=DANE_FRED("${id}|${Date.now()}")`]] });
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const res = await gapi('GET', `${SHEETS}/${CFG.sheetId}/values/${encodeURIComponent("'Szukaj'!H1:I700")}?valueRenderOption=UNFORMATTED_VALUE`);
    const rows = res.values || []; const f = rows[0] && rows[0][0];
    if (f === undefined || f === '' || /Loading|Wczytywanie/i.test(String(f))) continue;
    if (String(f).startsWith('#')) throw new Error('brak funkcji DANE_FRED – wklej aktualny skrypt Portfel_Ceny.gs');
    return rows.map(r => [String(r[0]).slice(0, 7), typeof r[1] === 'number' ? r[1] : parseFloat(r[1])]);
  }
  throw new Error('przekroczono czas');
}
async function pobierzInflacje(quiet) {
  const got = {}, errs = [];
  for (const [k, src] of Object.entries(INFL_SRC)) {
    let pts = null;
    try { pts = await fredBrowser(src.fred); } catch (e) { try { pts = await fredViaSheet(src.fred); } catch (e2) { errs.push(k + ': ' + e2.message); } }
    if (pts) got[k] = mmFromIndex(pts).filter(([m]) => m >= '2015-01');
  }
  if (!got.PL && !got.US) { if (!quiet) throw new Error('Nie udało się pobrać inflacji (' + errs.join('; ') + ')'); return null; }
  const map = {}; S.inflacja.forEach(r => map[r.miesiac] = r);
  (got.PL || []).forEach(([m, v]) => { (map[m] = map[m] || { miesiac: m, mm: '', mmUS: '' }).mm = v; });
  (got.US || []).forEach(([m, v]) => { (map[m] = map[m] || { miesiac: m, mm: '', mmUS: '' }).mmUS = v; });
  S.inflacja = Object.values(map).sort((a, b) => a.miesiac.localeCompare(b.miesiac));
  CFG.inflDay = todayStr(); CFG.inflSrc = 'fred'; saveCfg(); changed('inflacja');
  return { pl: (got.PL || []).slice(-1)[0], us: (got.US || []).slice(-1)[0], errs };
}

/* ---------- NBP ---------- */
const NBP_CACHE = lsGet(LS_NBP, {});
async function nbpRate(cur, dateStr) {
  if (!cur || cur === 'PLN' || !dateStr) return 1;
  const key = cur + '|' + dateStr; if (NBP_CACHE[key]) return NBP_CACHE[key];
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() - 1); const end = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() - 12); const start = d.toISOString().slice(0, 10);
  const r = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${cur.toLowerCase()}/${start}/${end}/?format=json`);
  if (!r.ok) throw new Error('NBP nie zwrócił kursu ' + cur + ' dla ' + dateStr);
  const j = await r.json(); const mid = j.rates[j.rates.length - 1].mid;
  NBP_CACHE[key] = mid; lsSet(LS_NBP, NBP_CACHE); return mid;
}
async function nbpCurrent() {
  const r = await fetch('https://api.nbp.pl/api/exchangerates/tables/a/?format=json');
  if (!r.ok) throw new Error('NBP niedostępny');
  const t = (await r.json())[0]; const m = {}; t.rates.forEach(x => m[x.code] = x.mid);
  Object.keys(S.ustawienia.kursy).forEach(c => { if (m[c]) S.ustawienia.kursy[c] = m[c]; });
  S.ustawienia.kursyData = t.effectiveDate; changed('ustawienia');
  return t.effectiveDate;
}
