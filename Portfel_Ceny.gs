/**
 * Portfel – ceny z Yahoo Finance (na bazie Twojej funkcji GOLD_YF_USD).
 * Wklej do arkusza z danymi: Rozszerzenia → Apps Script → Zapisz.
 * Aplikacja wpisuje w kolumnie „Cena auto” formuły =GOLD_YF_USD() i =SILVER_YF_USD().
 */

function GOLD_YF_USD() {
  return yahooCena_("GC=F", "gold_yf");
}

function SILVER_YF_USD() {
  return yahooCena_("SI=F", "silver_yf");
}

function BTC_YF_USD() {
  return yahooCena_("BTC-USD", "btc_yf");
}

function yahooCena_(symbol, klucz) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(klucz);
  if (cached) return Number(cached);

  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=1d&interval=1d";
  const res = UrlFetchApp.fetch(url);
  const json = JSON.parse(res.getContentText());

  const price = json.chart.result[0].meta.regularMarketPrice;

  cache.put(klucz, price, 1000);
  return price;
}
