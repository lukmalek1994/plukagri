/* ===================== IMPORT Z XTB (plik czytany tylko w przeglądarce) ===================== */
let IMP = null;   // { konto, plik, ops, mapa, pominiete, blad }

/* --- minimalny czytnik ZIP/XLSX (bez bibliotek) --- */
async function unzipFiles(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), out = {};
  let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('to nie jest plik Excel (.xlsx)');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (!/\.(xml|rels)$/i.test(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.slice(start, start + csize);
    out[name] = method === 0 ? dec.decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  return out;
}
async function readXlsx(buf) {
  const F = await unzipFiles(buf), P = new DOMParser(), xml = s => P.parseFromString(s || '<x/>', 'application/xml');
  const byTag = (d, t) => [...d.getElementsByTagNameNS('*', t)];
  const ss = byTag(xml(F['xl/sharedStrings.xml']), 'si').map(si => byTag(si, 't').map(t => t.textContent).join(''));
  const rels = {}; byTag(xml(F['xl/_rels/workbook.xml.rels']), 'Relationship').forEach(r => rels[r.getAttribute('Id')] = r.getAttribute('Target'));
  const sheets = {};
  byTag(xml(F['xl/workbook.xml']), 'sheet').forEach(sh => {
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let tgt = rels[rid] || ''; tgt = tgt.replace(/^\/?xl\//, ''); const doc = xml(F['xl/' + tgt]); const rows = [];
    byTag(doc, 'row').forEach(r => { const row = [];
      byTag(r, 'c').forEach(c => { const ref = c.getAttribute('r') || ''; let col = 0; for (const ch of ref.replace(/\d+/g, '')) col = col * 26 + ch.charCodeAt(0) - 64;
        const t = c.getAttribute('t'), v = byTag(c, 'v')[0];
        let val = t === 'inlineStr' ? byTag(c, 't').map(x => x.textContent).join('') : v ? v.textContent : '';
        if (t === 's') val = ss[+val] ?? ''; else if (!t || t === 'n') val = val === '' ? '' : Number(val);
        row[(col || row.length + 1) - 1] = val; });
      rows.push(Array.from(row, x => x ?? '')); });
    sheets[sh.getAttribute('name')] = rows;
  });
  return sheets;
}
function readCsv(text) {
  text = text.replace(/^﻿/, ''); const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return { CSV: rows };
}

/* --- rozpoznanie operacji gotówkowych XTB --- */
const XH = { type: /^(type|typ)$/i, time: /^(time|czas|data|date)/i, amount: /^(amount|kwota)/i, symbol: /^(symbol|instrument)$/i, comment: /^(comment|komentarz|opis)$/i, id: /^(id|nr|numer)$/i };
function xtbDate(v) {
  if (typeof v === 'number' && v > 20000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
function xtbKind(t) {
  t = String(t || '').toLowerCase();
  if (/close trade|zamkni[eę]cie pozycji|profit/.test(t)) return 'ignore';
  if (/purchase|zakup|kupno/.test(t)) return 'buy';
  if (/sale|sprzeda/.test(t)) return 'sell';
  if (/withholding|podatek od dywid|podatek u [źz]r|dividend tax|divident tax/.test(t)) return 'divtax';
  if (/divid|dywid/.test(t)) return 'div';
  if (/interest tax|podatek od odsetek|tax.*interest/.test(t)) return 'inttax';
  if (/interest|odsetk/.test(t)) return 'int';
  if (/withdraw|wyp[łl]ata/.test(t)) return 'out';
  if (/deposit|wp[łl]ata/.test(t)) return 'in';
  if (/commission|prowizj|sec fee|\bfee\b|op[łl]ata/.test(t)) return 'fee';
  return 'other';
}
function parseXtb(sheets) {
  const ops = [];
  for (const [nm, rows] of Object.entries(sheets)) {
    const hi = rows.findIndex(r => r.some(c => XH.type.test(String(c).trim())) && r.some(c => XH.amount.test(String(c).trim())) && r.some(c => XH.time.test(String(c).trim())));
    if (hi < 0) continue;
    const h = rows[hi].map(c => String(c).trim()), col = k => h.findIndex(c => XH[k].test(c));
    const ci = { type: col('type'), time: col('time'), amount: col('amount'), symbol: col('symbol'), comment: col('comment'), id: col('id') };
    for (const r of rows.slice(hi + 1)) {
      const type = r[ci.type], d = xtbDate(r[ci.time]); if (!type || !d) continue;
      const amount = typeof r[ci.amount] === 'number' ? r[ci.amount] : num(String(r[ci.amount]).replace(/ /g, ''));
      const comment = ci.comment >= 0 ? String(r[ci.comment] || '') : '', symbol = ci.symbol >= 0 ? String(r[ci.symbol] || '').trim() : '';
      const m = comment.match(/(OPEN|CLOSE)\s+(BUY|SELL)\s+(?:\S*[A-Za-z]\S*\s+)?([\d.,]+)(?:\s*\/\s*([\d.,]+))?\s*@\s*([\d.,]+)/i); // XTB czasem wstawia ticker: \"OPEN BUY GOOGL.US 1/1.047 @ 286.61\"
      const id = ci.id >= 0 && r[ci.id] !== '' ? String(r[ci.id]) : `${d}|${type}|${amount}|${symbol}`;
      ops.push({ id, kind: xtbKind(type), type: String(type), data: d, czas: String(r[ci.time]), symbol, comment, amount,
        ilosc: m ? num(m[3]) : null, cena: m ? num(m[5]) : null, arkusz: nm });
    }
  }
  return ops;
}
const XSUF = { US: ['USD', ''], UK: ['USD', '.L'], PL: ['PLN', '.WA'], DE: ['EUR', '.DE'], NL: ['EUR', '.AS'], FR: ['EUR', '.PA'], IT: ['EUR', '.MI'], ES: ['EUR', '.MC'], BE: ['EUR', '.BR'], PT: ['EUR', '.LS'], DK: ['DKK', '.CO'], SE: ['SEK', '.ST'], NO: ['NOK', '.OL'], CH: ['CHF', '.SW'], CZ: ['CZK', '.PR'] };
function xtbMapa(ops, konto) {
  const acc = S.konta.find(k => k.nazwa === konto) || {}, strat = S.strategie.filter(s => s.konto === konto);
  const m = {};
  ops.filter(o => o.symbol && ['buy', 'sell', 'div', 'divtax'].includes(o.kind)).forEach(o => {
    if (m[o.symbol]) return;
    const [base, suf = ''] = o.symbol.split('.'), sx = XSUF[suf.toUpperCase()] || [acc.waluta || 'USD', ''];
    const ins = S.instrumenty.find(i => i.ticker === o.symbol) || S.instrumenty.find(i => i.ticker === base);
    const ticker = ins ? ins.ticker : base;
    const used = S.transakcje.find(t => t.ticker === ticker && strat.some(s => s.nazwa === t.strategia));
    m[o.symbol] = { ticker, nowy: !ins, waluta: ins ? ins.waluta : sx[0], yahoo: base + sx[1], strategia: used ? used.strategia : ((strat[0] || {}).nazwa || ''), klasa: 'Akcje/ETF' };
  });
  return m;
}
function xtbIstnieje(id) {
  const tag = 'XTB#' + id;
  return ['transakcje', 'dywidendy', 'wplaty'].some(t => S[t].some(r => String(r.notatka || '').includes(tag)));
}

/* --- widok --- */
function vImport() {
  const konta = S.konta;
  if (!IMP) IMP = { konto: (konta.find(k => /xtb/i.test(k.nazwa)) || konta[0] || {}).nazwa || '' };
  const step1 = `<div class="card"><h3>1. Wybierz konto i plik</h3>
    <div class="form" style="grid-template-columns:1fr 1fr"><label>Konto, do którego importujesz<select onchange="IMP.konto=this.value;if(IMP.ops){IMP.mapa=xtbMapa(IMP.ops,IMP.konto)};render()">${konta.map(k => `<option ${k.nazwa === IMP.konto ? 'selected' : ''}>${esc(k.nazwa)}</option>`).join('')}</select>
      <span class="help">Waluta konta: ${esc((konta.find(k => k.nazwa === IMP.konto) || {}).waluta || '–')} · każde konto XTB (PLN, USD, IKE) importuj osobnym plikiem</span></label>
      <label>Plik z XTB (.xlsx lub .csv)<input type="file" accept=".xlsx,.csv,.txt" onchange="xtbWczytaj(this.files[0])"><span class="help">${IMP.plik ? '✓ ' + esc(IMP.plik) : 'Plik jest czytany tylko w Twojej przeglądarce – nigdzie go nie wysyłamy'}</span></label></div>
    <details style="margin-top:10px"><summary class="mut" style="cursor:pointer">Jak pobrać plik z XTB?</summary><ol class="mut" style="font-size:13px;line-height:1.7">
      <li>Zaloguj się do xStation 5 (przeglądarka lub aplikacja na komputer) i wybierz właściwe konto (np. IKE).</li>
      <li>Otwórz <b>Historia konta</b> → zakładka <b>Operacje gotówkowe</b>.</li>
      <li>Ustaw zakres dat (od otwarcia konta do dziś) i zaznacz wszystkie typy operacji.</li>
      <li>Kliknij <b>Eksport</b> → typ raportu <b>Operacje gotówkowe</b>, format <b>Excel</b> lub <b>CSV</b>.</li>
      <li>Wybierz pobrany plik powyżej. Import możesz powtarzać – operacje już zaimportowane zostaną pominięte.</li></ol></details>
    ${IMP.blad ? `<div class="alert">⚠ ${esc(IMP.blad)}</div>` : ''}</div>`;
  if (!IMP.ops) return ['Import z XTB', 'Transakcje, dywidendy, odsetki i wpłaty z wyciągu XTB', step1, ' '];

  const ops = IMP.ops, mapa = IMP.mapa, strat = S.strategie.filter(s => s.konto === IMP.konto);
  const uzyte = ops.filter(o => ['buy', 'sell', 'div', 'int', 'in', 'out'].includes(o.kind));
  uzyte.forEach(o => { if (o.wybrane === undefined) o.wybrane = !xtbIstnieje(o.id) && !(['buy', 'sell'].includes(o.kind) && !o.ilosc); });
  const pom = ops.filter(o => ['other', 'fee', 'ignore'].includes(o.kind));
  const LBL = { buy: 'Kupno', sell: 'Sprzedaż', div: 'Dywidenda', int: 'Odsetki', in: 'Wpłata', out: 'Wypłata' };
  const syms = Object.entries(mapa);
  const mapTbl = syms.length ? `<div class="card" style="margin-top:16px"><h3>2. Instrumenty <small>sprawdź ticker, walutę i strategię – nowe instrumenty zostaną dodane</small></h3>${table([
    { h: 'Symbol XTB', f: ([s]) => `<b>${esc(s)}</b>` },
    { h: 'Ticker w aplikacji', f: ([s, m]) => `<input style="width:110px" value="${esc(m.ticker)}" onchange="IMP.mapa['${esc(s)}'].ticker=this.value.trim();IMP.mapa['${esc(s)}'].nowy=!S.instrumenty.some(i=>i.ticker===this.value.trim());render()"> ${m.nowy ? '<span class="tag">nowy</span>' : '<span class="mut">istnieje</span>'}` },
    { h: 'Waluta', f: ([s, m]) => m.nowy ? `<select onchange="IMP.mapa['${esc(s)}'].waluta=this.value">${['USD', 'PLN', 'EUR', 'GBP', 'CHF', 'DKK', 'SEK', 'NOK', 'CZK'].map(c => `<option ${c === m.waluta ? 'selected' : ''}>${c}</option>`).join('')}</select>` : esc(m.waluta) },
    { h: 'Symbol Yahoo (cena auto)', f: ([s, m]) => m.nowy ? `<input style="width:110px" value="${esc(m.yahoo)}" onchange="IMP.mapa['${esc(s)}'].yahoo=this.value.trim()">` : '<span class="mut">–</span>' },
    { h: 'Strategia', f: ([s, m]) => `<select onchange="IMP.mapa['${esc(s)}'].strategia=this.value">${strat.map(x => `<option ${x.nazwa === m.strategia ? 'selected' : ''}>${esc(x.nazwa)}</option>`).join('')}</select>` },
  ], syms)}${strat.length ? '' : `<div class="alert">Konto „${esc(IMP.konto)}” nie ma jeszcze strategii – <a onclick="editStrategia()">dodaj strategię</a>, aby przypisać do niej transakcje.</div>`}</div>` : '';
  const ileW = uzyte.filter(o => o.wybrane).length, dupl = uzyte.filter(o => xtbIstnieje(o.id)).length;
  const opTbl = table([
    { h: `<input type="checkbox" ${uzyte.every(o => o.wybrane) ? 'checked' : ''} onchange="IMP.ops.forEach(o=>{if('wybrane' in o)o.wybrane=this.checked});render()">`, f: o => `<input type="checkbox" ${o.wybrane ? 'checked' : ''} onchange="IMP.ops[${ops.indexOf(o)}].wybrane=this.checked;render()">` },
    { h: 'Data', f: o => esc(o.data) }, { h: 'Operacja', f: o => `${LBL[o.kind]} <span class="mut" style="font-size:11.5px">${esc(o.type)}</span>` },
    { h: 'Instrument', f: o => o.symbol ? esc((mapa[o.symbol] || {}).ticker || o.symbol) : '–' },
    { h: 'Ilość', n: 1, f: o => o.ilosc === null ? '' : String(o.ilosc).replace('.', ',') }, { h: 'Cena', n: 1, f: o => o.cena === null ? '' : String(o.cena).replace('.', ',') },
    { h: 'Kwota', n: 1, f: o => pl(o.amount).replace(' zł', ' ' + esc((konta.find(k => k.nazwa === IMP.konto) || {}).waluta || '')) },
    { h: 'Status', f: o => xtbIstnieje(o.id) ? '<span class="mut">już zaimportowane</span>' : (['buy', 'sell'].includes(o.kind) && !o.ilosc) ? '<span class="neg">brak ilości w opisie</span>' : '<span class="pos">nowe</span>' },
  ], uzyte.slice().sort((a, b) => b.data.localeCompare(a.data)), { empty: 'W pliku nie znaleziono operacji do zaimportowania' });
  const podatki = ops.filter(o => ['divtax', 'inttax'].includes(o.kind)).length;
  const step3 = `<div class="card" style="margin-top:16px"><h3>${syms.length ? '3' : '2'}. Operacje <small>${ileW} wybranych z ${uzyte.length}${dupl ? ` · ${dupl} już było` : ''}</small><span class="sp"></span>
      <button class="btn ghost sm" onclick="IMP=null;render()">Anuluj</button><button class="btn" ${ileW && (strat.length || !syms.length) ? '' : 'disabled'} onclick="xtbImportuj()">Importuj ${ileW} operacji</button></h3>
    <div class="mut" style="font-size:12.5px;margin-bottom:10px">${podatki ? `Podatek u źródła (${podatki} poz.) zostanie dopisany do odpowiednich dywidend i odsetek. ` : ''}Kursy NBP (D-1) do podatku pobiorą się automatycznie. ${pom.length ? `Pominięte: ${pom.length} poz. (${[...new Set(pom.map(o => o.type))].slice(0, 6).map(esc).join(', ')}) – „close trade” to tylko zapis zysku ze sprzedaży, prowizje dopisujemy do transakcji.` : ''}</div>${opTbl}</div>`;
  return ['Import z XTB', 'Transakcje, dywidendy, odsetki i wpłaty z wyciągu XTB', step1 + mapTbl + step3, ' '];
}
async function xtbWczytaj(file) {
  if (!file) return;
  IMP.blad = ''; IMP.plik = file.name; IMP.ops = null;
  try {
    const sheets = /\.xlsx$/i.test(file.name) ? await readXlsx(await file.arrayBuffer()) : readCsv(await file.text());
    const ops = parseXtb(sheets);
    if (!ops.length) throw new Error('nie znaleziono tabeli operacji gotówkowych (kolumny Typ / Czas / Kwota). Upewnij się, że eksportujesz raport „Operacje gotówkowe”.');
    IMP.ops = ops; IMP.mapa = xtbMapa(ops, IMP.konto);
  } catch (e) { IMP.blad = 'Nie udało się odczytać pliku: ' + e.message; }
  render();
}
async function xtbImportuj() {
  const acc = S.konta.find(k => k.nazwa === IMP.konto); if (!acc) return toast('Wybierz konto');
  const accCur = acc.waluta || 'PLN', ops = IMP.ops, mapa = IMP.mapa, defStrat = (S.strategie.find(s => s.konto === acc.nazwa) || {}).nazwa || '';
  const wyb = ops.filter(o => o.wybrane && !xtbIstnieje(o.id));
  const rate = async (cur, d) => { if (cur === 'PLN') return 1; try { return await nbpRate(cur, d); } catch (e) { return C.rateNow(cur) || 1; } };
  toast('Importuję… pobieram kursy NBP');
  // nowe instrumenty
  Object.values(mapa).forEach(m => { if (m.ticker && !S.instrumenty.some(i => i.ticker === m.ticker) && wyb.some(o => (mapa[o.symbol] || {}).ticker === m.ticker)) {
    S.instrumenty.push({ id: uid(), ticker: m.ticker, nazwa: m.ticker, klasa: m.klasa, waluta: m.waluta, cena: '', dataCeny: '', symbol: m.yahoo ? 'YAHOO:' + m.yahoo : '', cenaAuto: '' }); m.nowy = false; } });
  const fees = ops.filter(o => o.kind === 'fee' && o.symbol), taxes = ops.filter(o => ['divtax', 'inttax'].includes(o.kind));
  const used = new Set(); let n = { tx: 0, dyw: 0, wpl: 0 };
  for (const o of wyb) {
    const m = mapa[o.symbol] || {}, tag = `XTB#${o.id}`;
    if (o.kind === 'buy' || o.kind === 'sell') {
      const cur = m.waluta || accCur, kurs = cur === 'PLN' ? '' : await rate(cur, o.data);
      const fee = fees.find(f => !used.has(f) && f.symbol === o.symbol && f.czas.slice(0, 16) === o.czas.slice(0, 16));
      let prow = 0; if (fee) { used.add(fee); prow = Math.abs(fee.amount); if (accCur !== cur) prow = prow * (accCur === 'PLN' ? 1 : await rate(accCur, o.data)) / (kurs || 1); }
      S.transakcje.push({ id: uid(), data: o.data, strategia: m.strategia || defStrat, typ: o.kind === 'buy' ? 'KUPNO' : 'SPRZEDAŻ', ticker: m.ticker, ilosc: o.ilosc, cena: o.cena,
        prowizja: prow ? Math.round(prow * 100) / 100 : '', kurs, notatka: tag }); n.tx++;
    } else if (o.kind === 'div' || o.kind === 'int') {
      const cur = o.kind === 'div' ? (m.waluta || accCur) : accCur, kurs = cur === 'PLN' ? '' : await rate(cur, o.data);
      const accToCur = async v => accCur === cur ? v : (accCur === 'PLN' ? v / (kurs || 1) : v * (await rate(accCur, o.data)) / (kurs || 1));
      const tx = taxes.filter(t => !used.has(t) && (o.kind === 'div' ? t.kind === 'divtax' && t.symbol === o.symbol : t.kind === 'inttax') && t.data === o.data);
      tx.forEach(t => used.add(t));
      const brutto = await accToCur(o.amount), pod = await accToCur(Math.abs(tx.reduce((a, t) => a + t.amount, 0)));
      S.dywidendy.push({ id: uid(), data: o.data, strategia: o.kind === 'div' ? (m.strategia || defStrat) : defStrat, ticker: o.kind === 'div' ? m.ticker : '',
        brutto: Math.round(brutto * 100) / 100, podatek: pod ? Math.round(pod * 100) / 100 : '', kurs, notatka: (o.kind === 'int' ? 'Odsetki XTB ' : '') + tag }); n.dyw++;
    } else if (o.kind === 'in' || o.kind === 'out') {
      const pln = accCur === 'PLN' ? o.amount : o.amount * await rate(accCur, o.data);
      S.wplaty.push({ id: uid(), data: o.data, konto: acc.nazwa, kwotaPLN: Math.round(pln * 100) / 100, kwotaWal: accCur === 'PLN' ? '' : o.amount, notatka: tag }); n.wpl++;
    }
  }
  ['instrumenty', 'transakcje', 'dywidendy', 'wplaty'].forEach(t => changed(t));
  IMP = null; render();
  toast(`Zaimportowano: ${n.tx} transakcji, ${n.dyw} dywidend/odsetek, ${n.wpl} wpłat/wypłat`);
}
