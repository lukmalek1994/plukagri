/**
 * Portfel – ceny z Yahoo Finance dla arkusza danych aplikacji „Mój portfel”.
 *
 * Instalacja: otwórz arkusz z danymi → Rozszerzenia → Apps Script → usuń przykładowy kod,
 * wklej ten plik → Zapisz (ikona dyskietki). Gotowe – aplikacja sama wpisze formuły.
 *
 * Użycie w komórce:  =YAHOO("GC=F")   złoto (USD za uncję)
 *                    =YAHOO("SI=F")   srebro (USD za uncję)
 *                    =YAHOO("BTC-USD"), =YAHOO("CSPX.L"), =YAHOO("PKN.WA") …
 * Aplikacja dopisuje do symbolu datę po znaku „|” (np. "GC=F|2026-11-08"), żeby cena odświeżała się codziennie –
 * wszystko po „|” jest ignorowane. Jeden argument = brak problemu z przecinkiem/średnikiem w polskim arkuszu.
 */

/**
 * Bieżąca cena instrumentu z Yahoo Finance.
 * @param {string} symbol Symbol Yahoo, np. "GC=F" (złoto), "SI=F" (srebro), "BTC-USD" (opcjonalnie z "|data").
 * @param {string} odswiez Opcjonalnie dowolna wartość (np. data) wymuszająca odświeżenie.
 * @return {number} Cena w walucie notowania.
 * @customfunction
 */
function YAHOO(symbol, odswiez) {
  symbol = String(symbol || '').split('|')[0].trim();
  if (!symbol) return '';
  var cache = CacheService.getScriptCache();
  var key = 'yf_' + symbol;
  var hit = cache.get(key);
  if (hit) return Number(hit);

  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=5d&interval=1d';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res.getResponseCode() !== 200) {
    // zapasowy serwer Yahoo
    res = UrlFetchApp.fetch(url.replace('query1', 'query2'), { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  }
  if (res.getResponseCode() !== 200) throw new Error('Yahoo: brak odpowiedzi dla ' + symbol + ' (' + res.getResponseCode() + ')');

  var result = JSON.parse(res.getContentText()).chart.result;
  if (!result || !result.length) throw new Error('Yahoo: nieznany symbol ' + symbol);
  var meta = result[0].meta;
  var cena = Number(meta.regularMarketPrice);
  if (!isFinite(cena) || cena <= 0) {
    // brak ceny bieżącej (np. weekend) → ostatnie zamknięcie
    var closes = (result[0].indicators.quote[0].close || []).filter(function (x) { return x; });
    cena = closes.length ? Number(closes[closes.length - 1]) : NaN;
  }
  if (!isFinite(cena) || cena <= 0) throw new Error('Yahoo: brak ceny dla ' + symbol);
  if (meta.currency === 'GBp' || meta.currency === 'GBX') cena = cena / 100;   // pensy → funty

  cache.put(key, String(cena), 1800);   // 30 minut
  return cena;
}

/** Zgodność ze starym arkuszem: złoto w USD za uncję. @customfunction */
function GOLD_YF_USD() { return YAHOO('GC=F'); }

/** Zgodność ze starym arkuszem: srebro w USD za uncję. @customfunction */
function SILVER_YF_USD() { return YAHOO('SI=F'); }

/**
 * Wyszukiwarka symboli Yahoo dla aplikacji (zakładka „Szukaj” w arkuszu).
 * Zwraca do 8 wierszy: symbol, nazwa, giełda, typ, waluta, cena.
 * @param {string} zapytanie Nazwa lub ticker (opcjonalnie z "|cokolwiek" – ignorowane).
 * @customfunction
 */
function YAHOO_SZUKAJ(zapytanie) {
  var q = String(zapytanie || '').split('|')[0].trim();
  if (!q) return '';
  var url = 'https://query2.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=8&newsCount=0';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res.getResponseCode() !== 200) res = UrlFetchApp.fetch(url.replace('query2', 'query1'), { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res.getResponseCode() !== 200) return [['BŁĄD', 'Yahoo nie odpowiada (' + res.getResponseCode() + ')', '', '', '', '']];
  var quotes = (JSON.parse(res.getContentText()).quotes || []).filter(function (x) { return x.symbol; }).slice(0, 8);
  if (!quotes.length) return [['BRAK', '', '', '', '', '']];
  return quotes.map(function (x) {
    var cur = '', cena = '';
    try {
      var r = UrlFetchApp.fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(x.symbol) + '?range=1d&interval=1d',
        { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.getResponseCode() === 200) {
        var m = JSON.parse(r.getContentText()).chart.result[0].meta;
        cur = m.currency || ''; cena = Number(m.regularMarketPrice) || '';
        if (cur === 'GBp' || cur === 'GBX') { cur = 'GBP'; if (cena) cena = cena / 100; }
      }
    } catch (e) {}
    return [x.symbol, x.longname || x.shortname || '', x.exchDisp || x.exchange || '', x.quoteType || '', cur, cena];
  });
}

/**
 * Dane z FRED (zapasowo dla aplikacji, gdy przeglądarka nie może pobrać inflacji sama).
 * Zwraca kolumny: miesiąc (RRRR-MM), wartość indeksu.
 * @param {string} id Identyfikator serii FRED, np. "CPIAUCNS" (opcjonalnie z "|cokolwiek").
 * @customfunction
 */
function DANE_FRED(id) {
  id = String(id || '').split('|')[0].trim();
  if (!id) return '';
  var res = UrlFetchApp.fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + encodeURIComponent(id), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('FRED ' + res.getResponseCode());
  var out = [];
  res.getContentText().trim().split(/\r?\n/).slice(1).forEach(function (l) {
    var p = l.split(','), v = parseFloat(p[1]);
    if (isFinite(v) && p[0] >= '2014-01') out.push([p[0].slice(0, 7), v]);
  });
  return out.length ? out : [['BRAK', '']];
}

/**
 * Notowania historyczne (dzienne, do 10 lat) – dla porównania z benchmarkami w aplikacji.
 * Użycie: =YAHOO_HIST("CSPX.L")  → dwie kolumny: data (rrrr-mm-dd) i cena zamknięcia.
 * Tekst po znaku | jest ignorowany (aplikacja dopisuje tam znacznik czasu).
 */
function YAHOO_HIST(symbol) {
  symbol = String(symbol || '').split('|')[0].trim();
  if (!symbol) return '';
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=10y&interval=1d';
  var opt = { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } };
  var res = UrlFetchApp.fetch(url, opt);
  if (res.getResponseCode() !== 200) res = UrlFetchApp.fetch(url.replace('query1', 'query2'), opt);
  if (res.getResponseCode() !== 200) throw new Error('Yahoo: brak odpowiedzi dla ' + symbol + ' (' + res.getResponseCode() + ')');
  var r = JSON.parse(res.getContentText()).chart.result;
  if (!r || !r.length || !r[0].timestamp) throw new Error('Yahoo: brak notowań dla ' + symbol);
  r = r[0];
  var cur = String(r.meta.currency || ''), div = (cur === 'GBp' || cur === 'GBX') ? 100 : 1;
  var adj = r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
  var cl = adj || r.indicators.quote[0].close || [];
  var tz = r.meta.exchangeTimezoneName || 'UTC', out = [];
  for (var i = 0; i < r.timestamp.length; i++) {
    var v = Number(cl[i]);
    if (!isFinite(v) || v <= 0) continue;
    out.push([Utilities.formatDate(new Date(r.timestamp[i] * 1000), tz, 'yyyy-MM-dd'), v / div]);
  }
  if (!out.length) throw new Error('Yahoo: brak notowań dla ' + symbol);
  return out;
}

/* =====================================================================
 * ALERTY E-MAIL (działają, gdy aplikacja jest zamknięta)
 * Menu „Portfel” → „Włącz alerty e-mail” – sprawdzanie co 30 minut.
 * Alerty ustawiasz w aplikacji (zakładka Alerty); zapisują się w arkuszu „Alerty”.
 * ===================================================================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Portfel')
    .addItem('Włącz alerty e-mail (co 30 min)', 'WLACZ_ALERTY')
    .addItem('Sprawdź alerty teraz', 'SPRAWDZ_ALERTY')
    .addItem('Wyłącz alerty e-mail', 'WYLACZ_ALERTY')
    .addToUi();
}
function WLACZ_ALERTY() {
  WYLACZ_ALERTY(true);
  ScriptApp.newTrigger('SPRAWDZ_ALERTY').timeBased().everyMinutes(30).create();
  SPRAWDZ_ALERTY();
  try { SpreadsheetApp.getUi().alert('Alerty e-mail włączone. Skrypt sprawdza ceny co 30 minut i wyśle maila na ' + Session.getEffectiveUser().getEmail() + '.'); } catch (e) {}
}
function WYLACZ_ALERTY(cicho) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'SPRAWDZ_ALERTY') ScriptApp.deleteTrigger(t); });
  if (cicho !== true) try { SpreadsheetApp.getUi().alert('Alerty e-mail wyłączone.'); } catch (e) {}
}

/* bieżąca cena z Yahoo (cache 10 min) */
function cenaTeraz_(sym) {
  if (!sym) return null;
  var cache = CacheService.getScriptCache(), key = 'now_' + sym, hit = cache.get(key);
  if (hit) return Number(hit);
  try {
    var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=5m';
    var opt = { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0' } };
    var res = UrlFetchApp.fetch(url, opt);
    if (res.getResponseCode() !== 200) res = UrlFetchApp.fetch(url.replace('query1', 'query2'), opt);
    if (res.getResponseCode() !== 200) return null;
    var r = JSON.parse(res.getContentText()).chart.result[0], m = r.meta, p = Number(m.regularMarketPrice);
    if (!isFinite(p) || p <= 0) return null;
    if (m.currency === 'GBp' || m.currency === 'GBX') p = p / 100;
    cache.put(key, String(p), 600);
    return p;
  } catch (e) { return null; }
}
function kursPLN_(cur) { if (!cur || cur === 'PLN') return 1; return cenaTeraz_(cur === 'USD' ? 'PLN=X' : cur + 'PLN=X'); }
/* cena z Yahoo, ale gdy wygląda na inną jednostkę niż w aplikacji – cena z aplikacji */
function cenaSpójna_(sym, cenaApp) {
  var p = cenaTeraz_(sym), a = Number(cenaApp);
  if (p && a > 0 && (p / a > 2 || p / a < 0.5)) return a;
  return p || (a > 0 ? a : null);
}

function SPRAWDZ_ALERTY() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName('Alerty');
  if (!sh || sh.getLastRow() < 2) return;
  var v = sh.getDataRange().getValues(), h = v[0], c = {};
  h.forEach(function (x, i) { c[String(x)] = i; });
  var col = function (r, name) { return c[name] === undefined ? '' : r[c[name]]; };
  var props = PropertiesService.getScriptProperties(), wyniki = [], mail = [];
  for (var i = 1; i < v.length; i++) {
    var r = v[i], id = String(col(r, 'ID')); if (!id) continue;
    var akt = String(col(r, 'Aktywny')) !== 'NIE', typ = String(col(r, 'Typ')), poziom = Number(col(r, 'Poziom')), prog = col(r, 'Próg blisko') === '' ? 3 : Number(col(r, 'Próg blisko'));
    var nazwa = typ === 'CEL' ? col(r, 'Koszyk') + ' – ' + (col(r, 'Konto') || 'cały portfel') : String(col(r, 'Instrument'));
    var sym = String(col(r, 'Symbol Yahoo (ręczny)') || col(r, 'Symbol Yahoo')), cur = String(col(r, 'Waluta'));
    var stan = 'brak danych', opis = '', rada = '';
    if (akt) {
      if (typ === 'KUPNO' || typ === 'SPRZEDAŻ') {
        var p = cenaSpójna_(sym, col(r, 'Cena (aplikacja)'));
        if (p && poziom) { var d = (p / poziom - 1) * 100;
          var hit = typ === 'KUPNO' ? p <= poziom : p >= poziom, near = typ === 'KUPNO' ? d <= prog : -d <= prog;
          stan = hit ? 'osiągnięty' : near ? 'blisko' : 'czeka';
          opis = 'cena ' + p.toFixed(2) + ' ' + cur + ', poziom ' + poziom + ' ' + cur + (hit ? '' : ' (' + Math.abs(d).toFixed(1) + '% od poziomu)'); }
      } else if (typ === 'ŚREDNIA') {
        var p2 = cenaSpójna_(sym, col(r, 'Cena (aplikacja)')), avg = Number(col(r, 'Średnia cena zakupu'));
        if (p2 && avg) { var z = (p2 / avg - 1) * 100;
          var hit2 = poziom < 0 ? z <= poziom : z >= poziom, near2 = poziom < 0 ? z <= poziom + prog : z >= poziom - prog;
          stan = hit2 ? 'osiągnięty' : near2 ? 'blisko' : 'czeka';
          opis = (z >= 0 ? '+' : '') + z.toFixed(1) + '% od średniej ceny zakupu ' + avg + ' ' + cur + ' (alert przy ' + poziom + '%)'; }
      } else if (typ === 'CEL') {
        try {
          var D = JSON.parse(String(col(r, 'Dane dla skryptu (JSON)') || '{}')), tot = 0, kv = 0;
          (D.it || []).forEach(function (x) {   // [symbol, ilość, waluta, cena PLN z aplikacji, w koszyku]
            var fx = kursPLN_(x[2]), py = cenaTeraz_(x[0]), pln = py && fx ? py * fx : 0;
            if (!pln || (x[3] > 0 && (pln / x[3] > 2 || pln / x[3] < 0.5))) pln = x[3];
            var w = x[1] * pln; tot += w; if (x[4]) kv += w; });
          if (tot > 0) { var u = kv / tot * 100, dev = u - Number(D.cel), a = Math.abs(dev);
            stan = a >= poziom ? 'osiągnięty' : a >= poziom - prog ? 'blisko' : 'czeka';
            opis = 'udział ' + u.toFixed(1) + '% vs cel ' + D.cel + '% (' + (dev >= 0 ? '+' : '') + dev.toFixed(1) + ' pp, alert przy ±' + poziom + ' pp)';
            rada = dev > 0 ? 'nadwyżka – rozważ sprzedaż lub wstrzymanie zakupów' : 'niedobór – rozważ dokupienie'; }
        } catch (e) { opis = 'błąd danych: ' + e.message; }
      }
    } else stan = 'wyłączony';
    var prev = props.getProperty('alert_' + id) || '';
    if ((stan === 'blisko' || stan === 'osiągnięty') && prev !== stan) mail.push({ stan: stan, nazwa: nazwa, typ: typ, opis: opis, rada: rada, notatka: col(r, 'Notatka') });
    if (stan !== 'brak danych') props.setProperty('alert_' + id, stan === 'czeka' || stan === 'wyłączony' ? '' : stan);
    wyniki.push([id, nazwa, typ, stan, opis + (rada ? ' – ' + rada : ''), new Date()]);
  }
  var out = ss.getSheetByName('Alerty – stan') || ss.insertSheet('Alerty – stan');
  out.clear(); out.getRange(1, 1, 1, 6).setValues([['ID', 'Alert', 'Typ', 'Stan', 'Szczegóły', 'Sprawdzono']]).setFontWeight('bold');
  if (wyniki.length) out.getRange(2, 1, wyniki.length, 6).setValues(wyniki);
  if (mail.length) {
    mail.sort(function (x, y) { return (x.stan === 'osiągnięty' ? 0 : 1) - (y.stan === 'osiągnięty' ? 0 : 1); });
    var temat = mail.some(function (m) { return m.stan === 'osiągnięty'; }) ? '🔔 Portfel: alert osiągnięty – ' + mail[0].nazwa : '⏳ Portfel: zbliża się alert – ' + mail[0].nazwa;
    if (mail.length > 1) temat += ' (+' + (mail.length - 1) + ')';
    var body = mail.map(function (m) { return (m.stan === 'osiągnięty' ? 'OSIĄGNIĘTY: ' : 'BLISKO: ') + m.nazwa + '\n  ' + m.opis + (m.rada ? '\n  ' + m.rada : '') + (m.notatka ? '\n  Notatka: ' + m.notatka : ''); }).join('\n\n');
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), temat, body + '\n\nArkusz: ' + ss.getUrl() + '\n(Wysłane przez skrypt w Twoim arkuszu „Portfel”. Wyłączysz w menu Portfel → Wyłącz alerty e-mail.)');
  }
}
