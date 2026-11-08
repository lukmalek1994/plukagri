/* ===================== DANE, ZAPIS LOKALNY, GOOGLE SHEETS, NBP ===================== */
const LS_DATA = 'portfel_dane_v1', LS_CFG = 'portfel_cfg_v1', LS_DIRTY = 'portfel_dirty_v1', LS_NBP = 'portfel_nbp_v1';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

const TABLES = {
  transakcje: { sheet: 'Transakcje', cols: [['id', 'ID'], ['data', 'Data'], ['strategia', 'Strategia'], ['typ', 'Typ'], ['ticker', 'Ticker'], ['ilosc', 'Ilość'], ['cena', 'Cena'], ['prowizja', 'Prowizja'], ['kurs', 'Kurs NBP (D-1)'], ['notatka', 'Notatka']] },
  dywidendy: { sheet: 'Dywidendy', cols: [['id', 'ID'], ['data', 'Data'], ['strategia', 'Strategia'], ['ticker', 'Ticker'], ['brutto', 'Kwota brutto'], ['podatek', 'Podatek u źródła'], ['kurs', 'Kurs NBP (D-1)'], ['notatka', 'Notatka']] },
  wplaty: { sheet: 'Wpłaty', cols: [['id', 'ID'], ['data', 'Data'], ['konto', 'Konto'], ['kwotaPLN', 'Kwota PLN'], ['kwotaWal', 'Kwota w walucie konta'], ['notatka', 'Notatka']] },
  strategie: { sheet: 'Strategie', cols: [['id', 'ID'], ['nazwa', 'Nazwa'], ['konto', 'Konto'], ['kapital', 'Kapitał przeznaczony'], ['opis', 'Opis'], ['kolor', 'Kolor']] },
  konta: { sheet: 'Konta', cols: [['id', 'ID'], ['nazwa', 'Nazwa'], ['typ', 'Typ podatkowy'], ['waluta', 'Waluta'], ['gotowka', 'Gotówka'], ['model', 'W modelu 2.1']] },
  instrumenty: { sheet: 'Instrumenty', cols: [['id', 'ID'], ['ticker', 'Ticker'], ['nazwa', 'Nazwa'], ['klasa', 'Klasa'], ['koszyk', 'Koszyk 2.1'], ['waluta', 'Waluta'], ['cena', 'Cena ręczna'], ['dataCeny', 'Data ceny'], ['symbol', 'Symbol Google Finance'], ['cenaAuto', 'Cena auto (Google)']] },
  inflacja: { sheet: 'Inflacja', cols: [['miesiac', 'Miesiąc'], ['mm', 'Inflacja m/m %']] },
  historia: { sheet: 'Historia', cols: [['data', 'Data'], ['wartosc', 'Wartość PLN'], ['kapital', 'Wpłacony kapitał PLN']] },
  cele: { sheet: 'Cele 2.1', cols: [['id', 'ID'], ['koszyk', 'Koszyk'], ['grupa', 'Grupa'], ['cel', 'Cel %']] },
  ustawienia: { sheet: 'Ustawienia', cols: [['klucz', 'Klucz'], ['wartosc', 'Wartość']] },
};
const uid = () => Math.random().toString(36).slice(2, 10);

let S = lsGet(LS_DATA, null) || defaultState();
let CFG = Object.assign({ clientId: '', sheetId: '', sheetUrl: '', strataPrev: {}, kryptoPrev: {} }, lsGet(LS_CFG, {}));
let DIRTY = new Set(lsGet(LS_DIRTY, []));
const SYNC = { token: null, exp: 0, state: 'local', msg: 'Dane tylko w tej przeglądarce', busy: false, timer: null, gisReady: false };

function saveLocal() { lsSet(LS_DATA, S); lsSet(LS_DIRTY, [...DIRTY]); }
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
  return [T.cols.map(c => c[1]), ...list.map(o => T.cols.map(([k]) => (k === 'cenaAuto' ? '' : (o[k] ?? ''))))];
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
}
async function pullAll() {
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
    any = true;
  });
  saveLocal();
  if (any && typeof render === 'function') render();
}
async function pushDirty() {
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
    setSync('ok', 'Zapisano w Google Sheets ✓ ' + new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    setSync('error', e.message + ' – zmiany czekają w przeglądarce');
  } finally { SYNC.busy = false; }
}
function scheduleSync() {
  if (!CFG.sheetId || !CFG.connected) { setSync('local', DIRTY.size && CFG.sheetId ? `${DIRTY.size} tabel czeka na wysłanie – połącz z Google` : 'Dane tylko w tej przeglądarce'); return; }
  clearTimeout(SYNC.timer);
  setSync('pending', 'Zmiany czekają na zapis…');
  SYNC.timer = setTimeout(async () => { if (await ensureToken()) pushDirty(); else setSync('pending', `Kliknij tutaj, aby zapisać zmiany w Google Sheets`); }, 1500);
}
async function syncNow() {
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
