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
