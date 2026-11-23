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
    .addSeparator()
    .addItem('🪙 Włącz monitor sklepów', 'WLACZ_MONITOR')
    .addItem('🪙 Sprawdź sklepy teraz', 'MONITOR_SKLEPOW')
    .addItem('🪙 Wyślij testowe powiadomienie', 'TEST_POWIADOMIENIA')
    .addItem('🪙 Wyłącz monitor sklepów', 'WYLACZ_MONITOR')
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

/* =====================================================================
 * MONITOR SKLEPÓW (np. Chińska Panda 2026 w polskich sklepach z metalami)
 * Lista sklepów i ustawienia: aplikacja → Planowanie → Monitor sklepów
 *   (zapisują się w arkuszach „Monitor sklepów” i „Monitor – ustawienia”).
 * Menu „Portfel” → „Włącz monitor sklepów” – sprawdzanie co 5–30 minut.
 * Wyniki: arkusze „Monitor – stan” (produkty) i „Monitor – sklepy” (czy sklep da się odczytać).
 * Powiadomienie: push przez ntfy (aplikacja ntfy na telefonie) i/lub e-mail,
 *   gdy produkt staje się dostępny (raz na każdą zmianę stanu).
 * ===================================================================== */
var MON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
var MON_WZORY = [   // typowe adresy wyszukiwarek sklepów (PrestaShop, WooCommerce, IdoSell, Shoper, Magento, Shopify…)
  '/szukaj?controller=search&s={q}', '/pl/szukaj?controller=search&s={q}', '/?s={q}&post_type=product', '/search.php?text={q}',
  '/pl/search.html?text={q}', '/pl/searchquery/{q}', '/searchquery/{q}', '/catalogsearch/result/?q={q}', '/search?q={q}',
  '/pl/search?q={q}', '/szukaj?q={q}', '/wyszukiwanie?q={q}', '/search?search={q}', '/?s={q}'];
var MON_OK = { instock: 'dostępny', limitedavailability: 'dostępny', onlineonly: 'dostępny', instoreonly: 'dostępny',
  preorder: 'przedsprzedaż', presale: 'przedsprzedaż', backorder: 'na zamówienie', madetoorder: 'na zamówienie',
  outofstock: 'niedostępny', soldout: 'niedostępny', discontinued: 'niedostępny' };

function monUst_() {
  var u = { szukaj: 'panda', wymagane: 'panda, 2026', wyklucz: '', cenaMax: '', ntfy: '', email: 'TAK', minuty: 10, przedsprzedaz: 'TAK', wlaczony: 'TAK' };
  var sh = SpreadsheetApp.getActive().getSheetByName('Monitor – ustawienia');
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[0] !== '') u[String(r[0])] = r[1]; });
  return u;
}
function monSklepy_() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Monitor sklepów');
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getValues(), c = {};
  v[0].forEach(function (h, i) { c[String(h)] = i; });
  return v.slice(1).map(function (r) {
    return { sklep: String(r[c['Sklep']] || ''), adres: String(r[c['Adres']] || '').trim(), typ: String(r[c['Typ']] || 'auto'), aktywny: String(r[c['Aktywny']] || 'TAK') };
  }).filter(function (s) { return s.adres && s.aktywny !== 'NIE'; });
}
function monMinuty_(u) { var m = Number(u.minuty) || 10; return [5, 10, 15, 30].reduce(function (a, b) { return Math.abs(b - m) < Math.abs(a - m) ? b : a; }); }

function WLACZ_MONITOR() {
  var u = monUst_(), m = monMinuty_(u);
  WYLACZ_MONITOR(true);
  ScriptApp.newTrigger('MONITOR_SKLEPOW').timeBased().everyMinutes(m).create();
  PropertiesService.getScriptProperties().setProperty('mon_minuty', String(m));
  MONITOR_SKLEPOW();
  try { SpreadsheetApp.getUi().alert('Monitor sklepów włączony – sprawdzanie co ' + m + ' min.\n\nWyniki: arkusz „Monitor – stan”.' + (u.ntfy ? '\nPowiadomienia push: temat ntfy „' + u.ntfy + '”.' : '\nUstaw temat ntfy w aplikacji, żeby dostawać powiadomienia push.') + (String(u.email) !== 'NIE' ? '\nE-mail: ' + Session.getEffectiveUser().getEmail() : '')); } catch (e) {}
}
function WYLACZ_MONITOR(cicho) {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'MONITOR_SKLEPOW') ScriptApp.deleteTrigger(t); });
  PropertiesService.getScriptProperties().deleteProperty('mon_minuty');
  if (cicho !== true) try { SpreadsheetApp.getUi().alert('Monitor sklepów wyłączony.'); } catch (e) {}
}
function TEST_POWIADOMIENIA() {
  var u = monUst_();
  monWyslij_(u, [{ sklep: 'Test', nazwa: 'To jest testowe powiadomienie z monitora sklepów', stan: 'dostępny', cena: '', waluta: '', url: SpreadsheetApp.getActive().getUrl() }]);
  try { SpreadsheetApp.getUi().alert('Wysłano test' + (u.ntfy ? ' na ntfy („' + u.ntfy + '”)' : '') + (String(u.email) !== 'NIE' ? ' i na e-mail' : '') + '.'); } catch (e) {}
}

/* ---------- pomocnicze ---------- */
function monNorm_(s) {
  return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/[-_+/|,.:;()\[\]"']+/g, ' ').replace(/(\d)\s*(g|gr|gram|gramow|gramy)\b/g, '$1 g').replace(/\s+/g, ' ').trim();
}
function monLista_(s) { return String(s || '').split(/[,;\n]/).map(monNorm_).filter(function (x) { return x; }); }
function monPasuje_(tekst, wym, wyk) {
  var t = ' ' + monNorm_(tekst) + ' ';
  for (var i = 0; i < wym.length; i++) if (t.indexOf(wym[i]) < 0) return false;
  for (var j = 0; j < wyk.length; j++) if (t.indexOf(' ' + wyk[j] + ' ') >= 0) return false;   // wykluczenia: całe słowa / frazy
  return true;
}
function monHost_(url) { var m = String(url).match(/^https?:\/\/([^\/?#]+)/i); return m ? m[1].toLowerCase().replace(/^www\./, '') : ''; }
function monOrigin_(url) { var m = String(url).match(/^(https?:\/\/[^\/?#]+)/i); return m ? m[1] : ''; }
function monAbs_(base, href) {
  href = String(href || '').replace(/&amp;/g, '&').trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (href.indexOf('//') === 0) return 'https:' + href;
  if (href.charAt(0) === '/') return monOrigin_(base) + href;
  return base.replace(/[?#].*$/, '').replace(/\/[^\/]*$/, '/') + href;
}
function monTekst_(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
}
function monPobierz_(urls) {   // równolegle, bez wyjątków
  if (!urls.length) return [];
  var req = urls.map(function (u) { return { url: u, muteHttpExceptions: true, followRedirects: true, validateHttpsCertificates: true,
    headers: { 'User-Agent': MON_UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'pl-PL,pl;q=0.9' } }; });
  var out = [];
  for (var i = 0; i < req.length; i += 20) {
    var part = req.slice(i, i + 20), res;
    try { res = UrlFetchApp.fetchAll(part); }
    catch (e) { res = part.map(function (r) { try { return UrlFetchApp.fetch(r.url, r); } catch (e2) { return null; } }); }
    res.forEach(function (r) {
      if (!r) return out.push({ kod: 0, html: '' });
      var kod = r.getResponseCode(), html = '';
      try { html = r.getContentText('UTF-8'); } catch (e) { try { html = r.getContentText(); } catch (e2) {} }
      out.push({ kod: kod, html: html });
    });
  }
  return out;
}
/* linki do produktów pasujących do frazy */
function monLinki_(base, html, wym, wyk) {
  var host = monHost_(base), re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi, m, seen = {}, out = [];
  while ((m = re.exec(html)) && out.length < 40) {
    var attrs = m[1], hm = attrs.match(/href\s*=\s*["']([^"'#]+)["']/i); if (!hm) continue;
    var href = hm[1]; if (/^(javascript|mailto|tel):/i.test(href)) continue;
    var url = monAbs_(base, href); if (monHost_(url) !== host) continue;
    if (/add-to-cart|addtocart|koszyk|basket|\/cart|wishlist|ulubion|compare|porown|controller=search|[?&](s|q|text|search)=|searchquery|\/szukaj|\/search/i.test(url)) continue;
    var title = (attrs.match(/title\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    var alt = (m[2].match(/alt\s*=\s*["']([^"']*)["']/i) || [])[1] || '';
    var slug = decodeURIComponent(url.replace(/^https?:\/\/[^\/]+/, '').replace(/\?.*$/, '')).replace(/[-_\/.]+/g, ' ');
    var tekst = monTekst_(m[2]) + ' ' + title + ' ' + alt + ' ' + slug;
    if (!monPasuje_(tekst, wym, wyk)) continue;
    var key = /\.php/i.test(url) ? url : url.replace(/\?.*$/, '');
    if (seen[key]) continue; seen[key] = 1;
    out.push({ url: key, tekst: monTekst_(m[2]).trim() || title || alt });
  }
  return out;
}
function monCzyJakasPanda_(html, szukaj) {   // czy strona wygląda na wyniki wyszukiwania (jest jakikolwiek link z frazą)
  var q = monNorm_(szukaj).split(' ')[0] || 'panda';
  return /<a\b/i.test(html) && monNorm_(monTekst_(html)).indexOf(q) >= 0 && (String(html).match(/<a\b/gi) || []).length > 20;
}
/* stan produktu ze strony produktu */
function monProdukt_(html, slowo) {
  var o = { stan: 'nieznany', cena: '', waluta: '', nazwa: '' }, m;
  m = html.match(/"availability"\s*:\s*"(?:https?:\/\/schema\.org\/)?([A-Za-z]+)"/i)
    || html.match(/itemprop=["']availability["'][^>]*(?:content|href)=["'](?:https?:\/\/schema\.org\/)?([A-Za-z]+)["']/i)
    || html.match(/(?:content|href)=["'](?:https?:\/\/schema\.org\/)?([A-Za-z]+)["'][^>]*itemprop=["']availability["']/i);
  if (m && MON_OK[m[1].toLowerCase()]) o.stan = MON_OK[m[1].toLowerCase()];
  if (o.stan === 'nieznany') {
    m = html.match(/property=["']product:availability["'][^>]*content=["']([^"']+)["']/i) || html.match(/content=["']([^"']+)["'][^>]*property=["']product:availability["']/i);
    if (m) { var a = m[1].toLowerCase().replace(/[\s_-]/g, ''); o.stan = /instock|available$/.test(a) ? 'dostępny' : /preorder/.test(a) ? 'przedsprzedaż' : /backorder|availablefororder/.test(a) ? 'na zamówienie' : /outofstock|oos|soldout/.test(a) ? 'niedostępny' : 'nieznany'; }
  }
  if (o.stan === 'nieznany') {
    var t = monNorm_(monTekst_(html));
    if (/niedostepn|wyprzedan|brak w magazynie|brak towaru|chwilowo brak|powiadom o dostepnosci|powiadom mnie|sold out|out of stock|czekamy na dostaw/.test(t)) o.stan = 'niedostępny';
    else if (/dodaj do koszyka|do koszyka|kup teraz|w magazynie|produkt dostepny|dostepna liczba/.test(t)) o.stan = 'dostępny';
  }
  m = html.match(/"price"\s*:\s*"?([\d][\d\s.,]*)"?/i) || html.match(/property=["']product:price:amount["'][^>]*content=["']([\d.,]+)["']/i)
    || html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i);
  if (m) { var p = m[1].replace(/\s/g, ''); if (/,\d{1,2}$/.test(p)) p = p.replace(/\./g, '').replace(',', '.'); else p = p.replace(/,/g, ''); if (isFinite(Number(p)) && Number(p) > 0) o.cena = Number(p); }
  if (!o.cena) { m = monTekst_(html).match(/(\d{1,3}(?:[ \u00a0]?\d{3})*[,.]\d{2})\s*(?:zł|pln)/i); if (m) o.cena = Number(m[1].replace(/[ \u00a0]/g, '').replace(',', '.')); }
  m = html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/) || html.match(/product:price:currency["'][^>]*content=["']([A-Z]{3})["']/i);
  o.waluta = m ? m[1].toUpperCase() : (o.cena ? 'PLN' : '');
  // nazwa: nagłówek h1, potem og:title i <title> – pierwsza, która zawiera główne słowo frazy (h1 rzadko zawiera nazwę sklepu)
  var kand = [html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i), html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i), html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)]
    .map(function (x) { return x ? monTekst_(x[1]).replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : ''; });
  var glowne = slowo ? monNorm_(slowo) : '';
  o.nazwa = kand.filter(function (x) { return x && (!glowne || monNorm_(x).indexOf(glowne) >= 0); })[0] || '';
  return o;
}

/* ---------- główne sprawdzanie ---------- */
function MONITOR_SKLEPOW() {
  var start = Date.now(), u = monUst_(), props = PropertiesService.getScriptProperties();
  // interwał ustawiony w aplikacji – skrypt sam poprawia wyzwalacz
  var minWyzw = props.getProperty('mon_minuty');
  if (minWyzw && Number(minWyzw) !== monMinuty_(u)) { WYLACZ_MONITOR(true); ScriptApp.newTrigger('MONITOR_SKLEPOW').timeBased().everyMinutes(monMinuty_(u)).create(); props.setProperty('mon_minuty', String(monMinuty_(u))); }
  if (String(u.wlaczony) === 'NIE') return;
  var wym = monLista_(u.wymagane), wyk = monLista_(u.wyklucz), q = encodeURIComponent(String(u.szukaj || 'panda'));
  var sklepy = monSklepy_(), stanSklepu = {}, listy = [];   // listy: { s, url }
  // 1) adresy list produktów
  var doWykrycia = [];
  sklepy.forEach(function (s) {
    var a = s.adres; if (!/^https?:\/\//i.test(a)) a = 'https://' + a.replace(/^\/+/, '');
    s.url = a;
    if (s.typ === 'produkt') return;
    if (s.typ === 'lista' || /[?]|\/.+/.test(a.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/(pl\/?)?$/, ''))) { listy.push({ s: s, url: a.replace('{q}', q) }); return; }
    var wz = props.getProperty('monpat_' + monHost_(a));
    if (wz) { listy.push({ s: s, url: monOrigin_(a) + wz.replace('{q}', q), wz: wz }); return; }
    var fail = {}; try { fail = JSON.parse(props.getProperty('monfail_' + monHost_(a)) || '{}'); } catch (e) {}
    if (fail.t && Date.now() - fail.t < 6 * 3600e3 && fail.adres === s.adres) { stanSklepu[s.adres] = [s, fail.msg + ' (ponowna próba co 6 h)', '']; return; }   // nie męczymy sklepu co kilka minut
    doWykrycia.push(s);
  });
  // 1a) wykrywanie wyszukiwarki (raz na sklep, wynik zapamiętany)
  if (doWykrycia.length) {
    var prob = []; doWykrycia.forEach(function (s) { MON_WZORY.forEach(function (w) { prob.push({ s: s, w: w, url: monOrigin_(s.url) + w.replace('{q}', q) }); }); });
    var r0 = monPobierz_(prob.map(function (p) { return p.url; })), zn = {};
    prob.forEach(function (p, i) {
      if (zn[p.s.adres]) return; var r = r0[i];
      if (r.kod === 200 && monCzyJakasPanda_(r.html, u.szukaj)) { zn[p.s.adres] = 1; props.setProperty('monpat_' + monHost_(p.s.url), p.w); listy.push({ s: p.s, url: p.url, html: r.html, wz: p.w }); }
    });
    doWykrycia.forEach(function (s) { if (!zn[s.adres]) {
      var kody = prob.filter(function (p) { return p.s === s; }).map(function (p, i) { return r0[prob.indexOf(p)].kod; });
      var msg = kody.every(function (k) { return k === 403 || k === 503 || k === 429; }) ? 'blokuje skrypt (HTTP ' + kody[0] + ') – wpisz adres strony produktu lub listy' : kody.every(function (k) { return k === 0; }) ? 'brak połączenia ze sklepem' : 'nie znaleziono wyszukiwarki – wpisz adres strony z listą produktów (typ „lista”)';
      stanSklepu[s.adres] = [s, msg, '']; props.setProperty('monfail_' + monHost_(s.url), JSON.stringify({ t: Date.now(), msg: msg, adres: s.adres }));
    } });
  }
  // 2) strony list (jeśli nie pobrane przy wykrywaniu)
  var bez = listy.filter(function (l) { return !l.html; }), rl = monPobierz_(bez.map(function (l) { return l.url; }));
  bez.forEach(function (l, i) { l.kod = rl[i].kod; l.html = rl[i].html; });
  var kandydaci = [];   // { s, url, tekst }
  listy.forEach(function (l) {
    if (l.kod && l.kod !== 200) { if (l.wz) props.deleteProperty('monpat_' + monHost_(l.url)); stanSklepu[l.s.adres] = [l.s, 'błąd HTTP ' + l.kod + (l.kod === 403 ? ' (sklep blokuje skrypt)' : ''), l.url]; return; }
    var L = monLinki_(l.url, l.html, wym, wyk).slice(0, 6);
    L.forEach(function (x) { kandydaci.push({ s: l.s, url: x.url, tekst: x.tekst }); });
    stanSklepu[l.s.adres] = [l.s, L.length ? 'OK – ' + L.length + ' pasujących' : 'OK – brak pasujących produktów', l.url];
  });
  sklepy.filter(function (s) { return s.typ === 'produkt'; }).forEach(function (s) { kandydaci.push({ s: s, url: s.url, tekst: s.sklep, bezFiltra: 1 }); stanSklepu[s.adres] = [s, 'strona produktu', s.url]; });
  // 3) strony produktów
  if (Date.now() - start > 240000) kandydaci = kandydaci.slice(0, 20);
  var rp = monPobierz_(kandydaci.map(function (k) { return k.url; })), wyniki = [], nowe = [], teraz = new Date();
  kandydaci.forEach(function (k, i) {
    var r = rp[i], o = r.kod === 200 ? monProdukt_(r.html, wym[0]) : { stan: r.kod ? 'błąd HTTP ' + r.kod : 'brak połączenia', cena: '', waluta: '', nazwa: '' };
    var nazwa = o.nazwa || k.tekst;
    if (!k.bezFiltra && o.nazwa && !monPasuje_(o.nazwa, [], wyk)) return;   // pełna nazwa ma słowo wykluczone (np. kolorowana / złota)
    var stan = o.stan, dobry = stan === 'dostępny' || (String(u.przedsprzedaz) !== 'NIE' && (stan === 'przedsprzedaż' || stan === 'na zamówienie'));
    if (dobry && Number(u.cenaMax) > 0 && o.cena && (o.waluta === 'PLN' || !o.waluta) && o.cena > Number(u.cenaMax)) { stan += ' (za drogo)'; dobry = false; }
    var key = 'mon_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, k.url)).slice(0, 22);
    var prev = {}; try { prev = JSON.parse(props.getProperty(key) || '{}'); } catch (e) {}
    if (prev.s !== stan) { if (dobry && !(prev.s && /^dostępny|^przedsprzedaż|^na zamówienie/.test(prev.s) && !/za drogo/.test(prev.s))) nowe.push({ sklep: k.s.sklep, nazwa: nazwa, stan: stan, cena: o.cena, waluta: o.waluta, url: k.url });
      if (!/^błąd|^brak połączenia/.test(stan)) { prev = { s: stan, t: teraz.toISOString() }; props.setProperty(key, JSON.stringify(prev)); } }
    wyniki.push([k.s.sklep, nazwa, stan, o.cena, o.waluta, k.url, prev.t ? new Date(prev.t) : '', teraz]);
  });
  // 4) zapis wyników
  var ss = SpreadsheetApp.getActive(), ord = function (s) { return /^dostępny/.test(s) ? 0 : /^przedsprzedaż|^na zamówienie/.test(s) ? 1 : /^niedostępny/.test(s) ? 3 : 2; };
  wyniki.sort(function (a, b) { return ord(a[2]) - ord(b[2]) || (Number(a[3]) || 9e9) - (Number(b[3]) || 9e9); });
  var sh = ss.getSheetByName('Monitor – stan') || ss.insertSheet('Monitor – stan');
  sh.clear(); sh.getRange(1, 1, 1, 8).setValues([['Sklep', 'Produkt', 'Stan', 'Cena', 'Waluta', 'Link', 'Stan od', 'Sprawdzono']]).setFontWeight('bold');
  if (wyniki.length) sh.getRange(2, 1, wyniki.length, 8).setValues(wyniki);
  var sk = Object.keys(stanSklepu).map(function (a) { var x = stanSklepu[a]; return [x[0].sklep, x[0].adres, x[1], x[2], teraz]; });
  var sh2 = ss.getSheetByName('Monitor – sklepy') || ss.insertSheet('Monitor – sklepy');
  sh2.clear(); sh2.getRange(1, 1, 1, 5).setValues([['Sklep', 'Adres', 'Stan', 'Sprawdzany adres', 'Sprawdzono']]).setFontWeight('bold');
  if (sk.length) sh2.getRange(2, 1, sk.length, 5).setValues(sk);
  // 5) powiadomienia
  if (nowe.length) monWyslij_(u, nowe);
}

function monWyslij_(u, lista) {
  var fmt = function (x) { return x.sklep + ': ' + x.nazwa + (x.cena ? ' – ' + x.cena + ' ' + (x.waluta || 'PLN') : '') + ' [' + x.stan + ']'; };
  if (u.ntfy) lista.slice(0, 5).forEach(function (x) {
    try {
      UrlFetchApp.fetch('https://ntfy.sh/', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ topic: String(u.ntfy).trim(), title: '🪙 ' + (x.stan === 'dostępny' ? 'Dostępna' : x.stan) + ': ' + x.sklep,
          message: x.nazwa + (x.cena ? '\n' + x.cena + ' ' + (x.waluta || 'PLN') : '') + (lista.length > 5 ? '\n(+' + (lista.length - 5) + ' innych – zobacz arkusz)' : ''),
          click: x.url, priority: 5, tags: ['coin'] }) });
    } catch (e) {}
  });
  if (String(u.email) !== 'NIE') {
    try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '🪙 Monitor sklepów: ' + fmt(lista[0]).slice(0, 120) + (lista.length > 1 ? ' (+' + (lista.length - 1) + ')' : ''),
      lista.map(function (x) { return fmt(x) + '\n  ' + x.url; }).join('\n\n') + '\n\nArkusz: ' + SpreadsheetApp.getActive().getUrl() + '\n(Monitor sklepów w Twoim arkuszu „Portfel”. Wyłączysz w menu Portfel → Wyłącz monitor sklepów.)'); } catch (e) {}
  }
}
