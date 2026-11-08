/* ===================== SILNIK OBLICZEŃ ===================== */
const EPS = 1e-9;
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const num = v => { if (v === '' || v === null || v === undefined) return 0; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const has = v => v !== '' && v !== null && v !== undefined && !(typeof v === 'number' && isNaN(v));
const ymd = d => { const x = new Date(d); return isNaN(x) ? '' : x.toISOString().slice(0, 10); };
const todayStr = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function defaultState() {
  return {
    strategie: [
      { id: 's1', nazwa: 'Długi termin', konto: 'XTB USD', kapital: '', opis: 'ETF-y na lata', kolor: '#1565C0' },
      { id: 's2', nazwa: 'Dywidendowa', konto: 'XTB USD', kapital: '', opis: '', kolor: '#26A69A' },
      { id: 's3', nazwa: 'IKE', konto: 'XTB IKE', kapital: '', opis: '', kolor: '#7E57C2' },
      { id: 's4', nazwa: 'Metale', konto: 'Sejf', kapital: '', opis: 'Kruszce fizyczne', kolor: '#F9A825' },
      { id: 's5', nazwa: 'Krypto', konto: 'Krypto', kapital: '', opis: '', kolor: '#EF5350' },
    ],
    konta: [
      { id: 'k1', nazwa: 'XTB USD', typ: 'Opodatkowane', waluta: 'USD', gotowka: '', model: 'TAK' },
      { id: 'k2', nazwa: 'XTB PLN', typ: 'Opodatkowane', waluta: 'PLN', gotowka: '', model: 'TAK' },
      { id: 'k3', nazwa: 'XTB IKE', typ: 'IKE', waluta: 'PLN', gotowka: '', model: 'TAK' },
      { id: 'k4', nazwa: 'Sejf', typ: 'Poza PIT-38', waluta: 'PLN', gotowka: '', model: 'TAK' },
      { id: 'k5', nazwa: 'Obligacje skarbowe', typ: 'Poza PIT-38', waluta: 'PLN', gotowka: '', model: 'TAK' },
      { id: 'k6', nazwa: 'Krypto', typ: 'Opodatkowane', waluta: 'USD', gotowka: '', model: 'TAK' },
    ],
    instrumenty: [
      { id: 'i1', ticker: 'CSPX', nazwa: 'iShares Core S&P 500 (Acc)', klasa: 'Akcje/ETF', koszyk: 'CSPX', waluta: 'USD', cena: '', dataCeny: '', symbol: 'LON:CSPX', cenaAuto: '' },
      { id: 'i2', ticker: 'IWDA', nazwa: 'iShares Core MSCI World (Acc)', klasa: 'Akcje/ETF', koszyk: 'IWDA', waluta: 'USD', cena: '', dataCeny: '', symbol: 'LON:IWDA', cenaAuto: '' },
      { id: 'i3', ticker: 'IB01', nazwa: 'iShares $ Treasury Bond 0-1yr', klasa: 'Obligacje', koszyk: 'IB01', waluta: 'USD', cena: '', dataCeny: '', symbol: 'LON:IB01', cenaAuto: '' },
      { id: 'i4', ticker: 'ZŁOTO', nazwa: 'Złoto fizyczne (1 oz)', klasa: 'Złoto', koszyk: 'ZŁOTO', waluta: 'USD', cena: '', dataCeny: '', symbol: 'YAHOO:GC=F', cenaAuto: '' },
      { id: 'i5', ticker: 'SREBRO', nazwa: 'Srebro fizyczne (1 oz)', klasa: 'Srebro', koszyk: 'SREBRO', waluta: 'USD', cena: '', dataCeny: '', symbol: 'YAHOO:SI=F', cenaAuto: '' },
      { id: 'i6', ticker: 'BTC', nazwa: 'Bitcoin', klasa: 'Krypto', koszyk: 'BTC', waluta: 'USD', cena: '', dataCeny: '', symbol: 'YAHOO:BTC-USD', cenaAuto: '' },
    ],
    transakcje: [], dywidendy: [], wplaty: [], inflacja: [], historia: [],
    cele: [
      { id: 'c1', koszyk: 'CSPX', grupa: 'CORE', cel: 39 }, { id: 'c2', koszyk: 'IWDA', grupa: 'CORE', cel: 26 },
      { id: 'c3', koszyk: 'IB01', grupa: 'STABILIZATORY', cel: 17 }, { id: 'c4', koszyk: 'ZŁOTO', grupa: 'STABILIZATORY', cel: 6 },
      { id: 'c5', koszyk: 'SREBRO', grupa: 'STABILIZATORY', cel: 4 }, { id: 'c6', koszyk: 'BTC', grupa: 'ASYMETRIA', cel: 8 },
    ],
    ustawienia: { kursy: { USD: '', EUR: '', GBP: '', CHF: '' }, kursyData: '', stawka: 19 },
  };
}

/* indeks inflacji: miesiąc 'YYYY-MM' -> poziom cen na koniec miesiąca (start = 1) */
function inflIndex(inflacja) {
  const rows = (inflacja || []).filter(r => r.miesiac && has(r.mm)).sort((a, b) => a.miesiac.localeCompare(b.miesiac));
  const idx = []; let lvl = 1;
  for (const r of rows) { lvl *= 1 + num(r.mm) / 100; idx.push([r.miesiac, lvl]); }
  const at = (ym) => { let v = 1; for (const [m, l] of idx) { if (m <= ym) v = l; else break; } return v; };
  const prevMonth = (d) => { const x = new Date(d + 'T00:00:00'); x.setDate(0); return x.toISOString().slice(0, 7); };
  return {
    now: idx.length ? idx[idx.length - 1][1] : 1,
    lastMonth: idx.length ? idx[idx.length - 1][0] : '',
    before: (dateStr) => at(prevMonth(dateStr)),       // poziom cen przed danym dniem (koniec poprzedniego miesiąca)
    atDate: (dateStr) => at(prevMonth(dateStr)),
  };
}

function calc(S) {
  const rates = S.ustawienia.kursy || {};
  const rateNow = cur => (!cur || cur === 'PLN') ? 1 : num(rates[cur]);
  const instr = {}; S.instrumenty.forEach(i => { if (i.ticker) instr[i.ticker] = i; });
  const strat = {}; S.strategie.forEach(s => { strat[s.nazwa] = s; });
  const konto = {}; S.konta.forEach(k => { konto[k.nazwa] = k; });
  const curOf = t => (instr[t] && instr[t].waluta) || 'USD';
  const priceOf = t => { const i = instr[t]; if (!i) return 0; return has(i.cena) ? num(i.cena) : num(i.cenaAuto); };
  const warnings = [];

  const txs = S.transakcje.filter(t => t.data && t.ticker && t.typ && num(t.ilosc) > 0)
    .map((t, n) => ({ ...t, _n: n })).sort((a, b) => (a.data === b.data ? a._n - b._n : a.data.localeCompare(b.data)));

  function fifo(keyFn) {
    const lots = {}, realized = [];
    for (const t of txs) {
      const cur = curOf(t.ticker), q = num(t.ilosc), p = num(t.cena), fee = num(t.prowizja);
      const kursOk = cur === 'PLN' || has(t.kurs);
      const kurs = cur === 'PLN' ? 1 : (has(t.kurs) ? num(t.kurs) : rateNow(cur));
      const key = keyFn(t);
      if (!lots[key]) lots[key] = [];
      if (t.typ === 'KUPNO') {
        const cost = q * p + fee;
        lots[key].push({ q, uc: cost / q, ucPLN: cost * kurs / q, data: t.data, id: t.id, kursOk });
      } else if (t.typ === 'SPRZEDAŻ') {
        let left = q, cost = 0, costPLN = 0, allOk = kursOk, firstBuy = null;
        while (left > EPS && lots[key].length) {
          const lot = lots[key][0], take = Math.min(left, lot.q);
          cost += take * lot.uc; costPLN += take * lot.ucPLN; if (!lot.kursOk) allOk = false; if (!firstBuy) firstBuy = lot.data;
          lot.q -= take; left -= take; if (lot.q <= EPS) lots[key].shift();
        }
        if (left > EPS) warnings.push(`Sprzedaż ${t.ticker} z ${t.data} (${t.strategia}): sprzedano więcej niż kupiono (${r2(left)} szt.).`);
        const proceeds = q * p - fee;
        realized.push({ id: t.id, data: t.data, rok: +t.data.slice(0, 4), ticker: t.ticker, strategia: t.strategia, waluta: cur,
          ilosc: q, przychod: proceeds, koszt: cost, zysk: proceeds - cost, przychodPLN: proceeds * kurs, kosztPLN: costPLN,
          zyskPLN: proceeds * kurs - costPLN, kursOk: allOk, kupiono: firstBuy });
      }
    }
    return { lots, realized };
  }

  // pozycje i wynik strategii: FIFO w ramach strategii
  const P = fifo(t => t.strategia + '|' + t.ticker);
  // podatek: FIFO w ramach konta (rachunku)
  const T = fifo(t => ((strat[t.strategia] || {}).konto || '?') + '|' + t.ticker);

  const pozycje = [];
  for (const [key, lots] of Object.entries(P.lots)) {
    const qty = lots.reduce((a, l) => a + l.q, 0);
    if (qty <= EPS) continue;
    const [s, ticker] = key.split('|');
    const i = instr[ticker] || {}; const cur = curOf(ticker);
    const koszt = lots.reduce((a, l) => a + l.q * l.uc, 0), kosztPLN = lots.reduce((a, l) => a + l.q * l.ucPLN, 0);
    const cena = priceOf(ticker), wartosc = qty * cena, wartoscPLN = wartosc * rateNow(cur);
    pozycje.push({ strategia: s, konto: (strat[s] || {}).konto || '', ticker, nazwa: i.nazwa || '', klasa: i.klasa || 'Inne', koszyk: i.koszyk || '',
      waluta: cur, ilosc: qty, koszt, kosztPLN, sredniaCena: koszt / qty, cena, brakCeny: !cena, wartosc, wartoscPLN,
      zysk: wartosc - koszt, zyskPct: koszt ? (wartosc - koszt) / koszt : 0, zyskPLN: wartoscPLN - kosztPLN,
      od: lots[0].data, kursBrak: lots.some(l => !l.kursOk) });
  }

  const dyw = S.dywidendy.filter(d => d.data && has(d.brutto)).map(d => {
    const cur = d.ticker ? curOf(d.ticker) : (konto[(strat[d.strategia] || {}).konto] || {}).waluta || 'PLN';
    const kurs = cur === 'PLN' ? 1 : (has(d.kurs) ? num(d.kurs) : rateNow(cur));
    const typ = (konto[(strat[d.strategia] || {}).konto] || {}).typ || 'Opodatkowane';
    const bruttoPLN = num(d.brutto) * kurs, podatekPLN = num(d.podatek) * kurs;
    const doplata = typ === 'Opodatkowane' && cur !== 'PLN' ? Math.max(0, r2(S.ustawienia.stawka / 100 * bruttoPLN) - podatekPLN) : 0;
    return { ...d, waluta: cur, kursOk: cur === 'PLN' || has(d.kurs), netto: num(d.brutto) - num(d.podatek), bruttoPLN, podatekPLN,
      nettoPLN: bruttoPLN - podatekPLN, doplata, rok: +d.data.slice(0, 4), typ };
  });

  const gotowka = S.konta.map(k => ({ konto: k.nazwa, waluta: k.waluta, kwota: num(k.gotowka), pln: num(k.gotowka) * rateNow(k.waluta) }));
  const sumPLN = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const wartoscPozycji = sumPLN(pozycje, p => p.wartoscPLN);
  const gotowkaPLN = sumPLN(gotowka, g => g.pln);
  const wartosc = wartoscPozycji + gotowkaPLN;
  const wplaty = S.wplaty.filter(w => w.data && has(w.kwotaPLN));
  const kapital = sumPLN(wplaty, w => num(w.kwotaPLN));
  const II = inflIndex(S.inflacja);
  const kapitalRealny = sumPLN(wplaty, w => num(w.kwotaPLN) * II.now / II.before(w.data));
  const kapitalRealnyNa = (d) => sumPLN(wplaty.filter(w => w.data <= d), w => num(w.kwotaPLN) * II.atDate(d) / II.before(w.data));

  // strategie
  const strategie = S.strategie.map(s => {
    const poz = pozycje.filter(p => p.strategia === s.nazwa);
    const real = P.realized.filter(r => r.strategia === s.nazwa);
    const dv = dyw.filter(d => d.strategia === s.nazwa);
    const w = sumPLN(poz, p => p.wartoscPLN), k = sumPLN(poz, p => p.kosztPLN);
    const zr = sumPLN(real, r => r.zyskPLN), dn = sumPLN(dv, d => d.nettoPLN);
    const kosztWal = sumPLN(poz, p => p.koszt), zrWal = sumPLN(real, r => r.zysk), dnWal = sumPLN(dv, d => d.netto);
    const k_ = konto[s.konto] || {};
    return { ...s, typ: k_.typ || '', walutaKonta: k_.waluta || '', pozycje: poz, zamkniete: real, dywidendy: dv, wartosc: w, koszt: k,
      niezreal: w - k, niezrealPct: k ? (w - k) / k : 0, zrealizowany: zr, dywidendyNetto: dn, wynik: w - k + zr + dn,
      wolne: has(s.kapital) ? num(s.kapital) - kosztWal + zrWal + dnWal : null,
      udzial: wartosc ? w / wartosc : 0 };
  });

  // konta
  const konta = S.konta.map(k => {
    const w = sumPLN(pozycje.filter(p => p.konto === k.nazwa), p => p.wartoscPLN);
    const g = num(k.gotowka) * rateNow(k.waluta);
    const kap = sumPLN(wplaty.filter(x => x.konto === k.nazwa), x => num(x.kwotaPLN));
    return { ...k, wartoscPozycji: w, gotowkaPLN: g, razem: w + g, kapital: kap, zysk: kap ? w + g - kap : null, zyskPct: kap ? (w + g - kap) / kap : null };
  });

  const groupBy = (arr, f, v) => { const m = {}; arr.forEach(x => { const k = f(x); m[k] = (m[k] || 0) + v(x); }); return m; };
  const klasy = groupBy(pozycje, p => p.klasa, p => p.wartoscPLN); if (gotowkaPLN) klasy['Gotówka'] = gotowkaPLN;
  const waluty = groupBy(pozycje, p => p.waluta, p => p.wartoscPLN); gotowka.forEach(g => { if (g.pln) waluty[g.waluta] = (waluty[g.waluta] || 0) + g.pln; });

  // model 2.1
  const wModelu = p => ((konto[p.konto] || {}).model || 'TAK') !== 'NIE';
  const koszyki = groupBy(pozycje.filter(wModelu), p => p.koszyk || 'POZA MODELEM', p => p.wartoscPLN);
  const cele = S.cele.filter(c => c.koszyk);
  const totModel = cele.reduce((a, c) => a + (koszyki[c.koszyk] || 0), 0);
  const model = cele.map(c => { const v = koszyki[c.koszyk] || 0, cel = num(c.cel) / 100;
    return { ...c, celPct: cel, wartosc: v, udzial: totModel ? v / totModel : 0, roznica: cel * totModel - v,
      odchylenie: totModel ? (v / totModel - cel) * 100 : 0 }; });
  const poza = Object.entries(koszyki).filter(([k]) => !cele.some(c => c.koszyk === k)).reduce((a, [, v]) => a + v, 0);
  function rozdziel(kwota) {
    const T2 = totModel + kwota; const def = model.map(m => Math.max(0, m.celPct * T2 - m.wartosc)); const sd = def.reduce((a, b) => a + b, 0);
    return model.map((m, i) => sd ? kwota * def[i] / sd : 0);
  }

  // podatki
  const typKonta = s => (konto[(strat[s] || {}).konto] || {}).typ || 'Opodatkowane';
  const klasaOf = t => (instr[t] || {}).klasa || '';
  function podatki(rok, strataPrev = 0, kryptoPrev = 0) {
    const stawka = num(S.ustawienia.stawka) / 100;
    const sprzedaze = T.realized.filter(r => r.rok === rok && typKonta(r.strategia) === 'Opodatkowane');
    const pap = sprzedaze.filter(r => klasaOf(r.ticker) !== 'Krypto');
    const przychod = sumPLN(pap, r => r.przychodPLN), koszty = sumPLN(pap, r => r.kosztPLN), dochod = przychod - koszty;
    const podstawa = Math.max(0, Math.round(dochod - strataPrev)), podatekPap = Math.round(podstawa * stawka);
    const dv = dyw.filter(d => d.rok === rok && d.typ === 'Opodatkowane');
    const dywBrutto = sumPLN(dv, d => d.bruttoPLN), dywPobrany = sumPLN(dv, d => d.podatekPLN), dywDoplata = Math.round(sumPLN(dv, d => d.doplata));
    const kPrzych = sumPLN(sprzedaze.filter(r => klasaOf(r.ticker) === 'Krypto'), r => r.przychodPLN);
    const kKoszt = sumPLN(txs.filter(t => t.typ === 'KUPNO' && +t.data.slice(0, 4) === rok && klasaOf(t.ticker) === 'Krypto' && typKonta(t.strategia) === 'Opodatkowane'),
      t => { const cur = curOf(t.ticker); return (num(t.ilosc) * num(t.cena) + num(t.prowizja)) * (cur === 'PLN' ? 1 : (has(t.kurs) ? num(t.kurs) : rateNow(cur))); });
    const kDochod = Math.max(0, kPrzych - kKoszt - kryptoPrev), kNadwyzka = Math.max(0, kKoszt + kryptoPrev - kPrzych);
    const kPodatek = Math.round(Math.round(kDochod) * stawka);
    return { rok, sprzedaze: pap, przychod, koszty, dochod, podstawa, podatekPap, dywBrutto, dywPobrany, dywDoplata, dywidendy: dv,
      kPrzych, kKoszt, kDochod, kNadwyzka, kPodatek, razem: podatekPap + dywDoplata + kPodatek,
      brakKursow: pap.some(r => !r.kursOk) || dv.some(d => !d.kursOk) };
  }

  const zrealizowany = sumPLN(P.realized, r => r.zyskPLN);
  const dywNetto = sumPLN(dyw, d => d.nettoPLN);
  const lata = [...new Set([...T.realized.map(r => r.rok), ...dyw.map(d => d.rok), new Date().getFullYear()])].sort((a, b) => b - a);

  return { rateNow, pozycje, zamkniete: P.realized, dyw, strategie, konta, klasy, waluty, model, poza, rozdziel, podatki, lata,
    wartosc, wartoscPozycji, gotowkaPLN, kapital, kapitalRealny, kapitalRealnyNa, inflNow: II.now, inflLast: II.lastMonth,
    zysk: wartosc - kapital, zyskPct: kapital ? (wartosc - kapital) / kapital : 0,
    zyskRealny: wartosc - kapitalRealny, zyskRealnyPct: kapitalRealny ? (wartosc - kapitalRealny) / kapitalRealny : 0,
    niezreal: wartoscPozycji - sumPLN(pozycje, p => p.kosztPLN), zrealizowany, dywNetto, warnings,
    usd: rateNow('USD') ? wartosc / rateNow('USD') : null };
}

if (typeof module !== 'undefined') module.exports = { calc, defaultState, inflIndex, num, has, r2, todayStr };
