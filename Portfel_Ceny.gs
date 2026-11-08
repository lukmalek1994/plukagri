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
