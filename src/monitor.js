/* ===================== MONITOR SKLEPÓW (np. Chińska Panda 2026) =====================
   Lista sklepów i ustawienia zapisują się w arkuszu („Monitor sklepów”, „Monitor – ustawienia”).
   Sprawdza je skrypt Portfel_Ceny.gs w arkuszu (działa też przy zamkniętej aplikacji) i zapisuje wyniki
   w „Monitor – stan” i „Monitor – sklepy”, które aplikacja tylko odczytuje. */
const MON_SKLEPY_DOMYSLNE = [
  ['Srebrna Mennica', 'https://srebrnamennica.pl/pl/szukaj?controller=search&s={q}', 'lista'],
  ['Mennica Skarbowa', 'mennicaskarbowa.pl', 'auto'],
  ['Mennica Polska', 'sklep.mennica.com.pl', 'auto'],
  ['Tavex', 'https://tavex.pl/srebro/srebrne-monety-bulionowe/', 'lista'],
  ['Mennica Kapitałowa', 'https://mennicakapitalowa.pl/search.php?text={q}', 'lista'],
  ['Mennica Wrocławska', 'mennicawroclawska.pl', 'auto'],
  ['Goldenmark', 'goldenmark.com', 'auto'],
  ['79element', '79element.pl', 'auto'],
  ['Mennica Metali Szlachetnych', 'mennicams.pl', 'auto'],
  ['Mennica Mazovia', 'mennicamazovia.pl', 'auto'],
  ['Metal Market', 'metalmarket.eu', 'auto'],
  ['Wyroby Mennicze', 'wyrobymennicze.pl', 'auto'],
  ['AG Market', 'agmarket.pl', 'auto'],
  ['GoldBroker.pl', 'https://goldbroker.pl/serie-monet/chinska-panda/', 'lista'],
  ['GoldInvest24', 'goldinvest24.pl', 'auto'],
  ['Szlachetne Inwestycje', 'sklep.szlachetneinwestycje.pl', 'auto'],
  ['StoneX Bullion (PL)', 'https://stonexbullion.com/pl/srebrne-monety/chinska-panda/', 'lista'],
];
const MON_WYKLUCZ = 'złota, złoty, złote, gold, złocona, złocony, pozłacana, pozłacany, gilded, kolorowana, kolorowany, kolorowa, kolor, color, colour, colorized, four seasons, cztery pory roku, spring, summer, autumn, winter, wiosna, lato, jesień, zima, golden ring, chameleon, black, pink, proof, hologram, 1 g, 3 g, 8 g, 15 g, 150 g, 1 kg, 2025, 2027';
const MON_UST_DOMYSLNE = { wlaczony: 'TAK', szukaj: 'panda', wymagane: 'panda, 2026', wyklucz: MON_WYKLUCZ, cenaMax: '', ntfy: '', email: 'TAK', minuty: 10, przedsprzedaz: 'TAK' };
const MON_TYP = { auto: 'auto – sama znajdzie wyszukiwarkę', lista: 'lista – strona wyszukiwania / kategorii', produkt: 'produkt – jedna strona produktu' };
let MON = { stan: null, sklepy: null, ts: 0, blad: '', busy: false };

/* domyślna lista tylko lokalnie – bez oznaczania do zapisu: gdy arkusz ma już listę (np. z drugiego urządzenia), wygrywa arkusz;
   gdy arkusz jest pusty, pullAll sam wyśle listę lokalną */
function monInit() {
  let zm = [];
  if (!S.monitor) { S.monitor = MON_SKLEPY_DOMYSLNE.map(([sklep, adres, typ]) => ({ id: uid(), aktywny: 'TAK', sklep, adres, typ, notatka: '' })); zm.push('monitor'); }
  if (!S.monitorUst) { S.monitorUst = []; zm.push('monitorUst'); }
  Object.entries(MON_UST_DOMYSLNE).forEach(([k, v]) => { if (!S.monitorUst.some(x => x.klucz === k)) { S.monitorUst.push({ klucz: k, wartosc: k === 'ntfy' ? 'portfel-' + uid() + uid() : v }); if (!zm.includes('monitorUst')) zm.push('monitorUst'); } });
  return zm;
}
const monUst = k => { const r = (S.monitorUst || []).find(x => x.klucz === k); return r ? r.wartosc : MON_UST_DOMYSLNE[k]; };
function monSetUst(o) { Object.entries(o).forEach(([k, v]) => { const r = S.monitorUst.find(x => x.klucz === k); if (r) r.wartosc = v; else S.monitorUst.push({ klucz: k, wartosc: v }); }); }

/* odczyt wyników skryptu z arkusza */
async function monOdswiez(cicho) {
  if (CFG.demo || !CFG.sheetId) { MON.blad = 'Połącz aplikację z arkuszem Google (Ustawienia i Google).'; return; }
  if (!(await ensureToken())) { MON.blad = 'Zaloguj się do Google (plakietka u góry), żeby zobaczyć wyniki monitora.'; if (!cicho) render(); return; }
  if (MON.busy) return; MON.busy = true;
  try {
    const q = ["'Monitor – stan'!A1:H500", "'Monitor – sklepy'!A1:E200"].map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const res = await gapi('GET', `${SHEETS}/${CFG.sheetId}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
    const [a, b] = res.valueRanges.map(v => (v.values || []).slice(1));
    const d = v => typeof v === 'number' ? new Date(Math.round((v - 25569) * 864e5)) : (v ? new Date(v) : null);
    MON.stan = a.map(r => ({ sklep: r[0], nazwa: r[1], stan: String(r[2] || ''), cena: r[3], waluta: r[4], url: r[5], od: d(r[6]), spr: d(r[7]) }));
    MON.sklepy = b.map(r => ({ sklep: r[0], adres: r[1], stan: String(r[2] || ''), url: r[3], spr: d(r[4]) }));
    MON.ts = Date.now(); MON.blad = '';
  } catch (e) { MON.blad = /Unable to parse range/i.test(e.message) ? 'Skrypt jeszcze nie sprawdzał sklepów – włącz monitor w arkuszu (instrukcja niżej).' : e.message; }
  MON.busy = false; if (ROUTE === 'monitor') render();
}
const monDobry = s => /^dostępny|^przedsprzedaż|^na zamówienie/.test(s) && !/za drogo/.test(s);
const MON_TAG = s => /^dostępny/.test(s) && !/za drogo/.test(s) ? `<span class="tag" style="background:#e7f6ec;color:#166534">● ${esc(s)}</span>`
  : monDobry(s) ? `<span class="tag" style="background:#fef3c7;color:#92400e">● ${esc(s)}</span>`
  : /^niedostępny/.test(s) ? `<span class="tag">${esc(s)}</span>` : `<span class="tag" style="background:#fde2e2;color:#b91c1c">${esc(s)}</span>`;
const monCzas = d => d && !isNaN(d) ? d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
const monCena = x => x.cena ? nf2.format(num(x.cena)) + ' ' + esc(x.waluta || 'PLN') : '–';

function vMonitor() {
  monInit();
  if (!MON.ts && !MON.busy && !MON.blad) setTimeout(() => monOdswiez(true), 50);
  const L = MON.stan || [], dob = L.filter(x => monDobry(x.stan)), spr = L.concat(MON.sklepy || []).map(x => x.spr).filter(Boolean).sort((a, b) => b - a)[0];
  const akt = S.monitor.filter(s => s.aktywny !== 'NIE').length, wl = monUst('wlaczony') !== 'NIE', topic = String(monUst('ntfy') || '');
  const stanSk = a => (MON.sklepy || []).find(x => String(x.adres) === String(a));
  const tblP = table([
    { h: 'Stan', f: x => MON_TAG(x.stan) }, { h: 'Sklep', f: x => `<b>${esc(x.sklep)}</b>` },
    { h: 'Produkt', f: x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.nazwa || x.url)}</a>` },
    { h: 'Cena', n: 1, f: monCena }, { h: 'Stan od', f: x => `<span class="mut">${monCzas(x.od)}</span>` },
  ], L, { empty: MON.busy ? 'Wczytywanie wyników z arkusza…' : MON.blad ? esc(MON.blad) : 'Żaden sklep nie ma teraz produktu pasującego do frazy (lub skrypt jeszcze nie sprawdzał).' });
  const tblS = table([
    { h: 'Aktywny', f: s => s.aktywny === 'NIE' ? '<span class="tag">wył.</span>' : '<span class="tag" style="background:#e7f6ec;color:#166534">tak</span>' },
    { h: 'Sklep · odczyt przez skrypt', f: s => { const x = stanSk(s.adres);
      const st = !x ? '<span class="mut">jeszcze nie sprawdzano</span>' : /^OK|^strona produktu/.test(x.stan) ? `<span class="pos">${esc(x.stan)}</span>` : `<span class="neg">${esc(x.stan)}</span>`;
      return `<b>${esc(s.sklep)}</b>${s.notatka ? ` <span class="mut">${esc(s.notatka)}</span>` : ''}<div style="font-size:12px">${st}</div>`; } },
    { h: 'Typ', f: s => esc(s.typ || 'auto') }, { h: 'Adres', f: s => `<span class="mut" style="word-break:break-all;font-size:12px">${esc(s.adres)}</span>` },
  ], S.monitor, { click: s => `editMonSklep('${s.id}')` });
  const kroki = `<ol class="mut" style="font-size:13px;line-height:1.7;margin:0">
      <li><b>Telefon:</b> zainstaluj darmową aplikację <b>ntfy</b> (Google Play / App Store), kliknij <b>＋</b> i zasubskrybuj temat <b style="user-select:all">${esc(topic || '— ustaw w „Ustawienia wyszukiwania”')}</b>. Nazwa tematu jest losowa, żeby nikt inny go nie odgadł.</li>
      <li><b>Arkusz:</b> Rozszerzenia → Apps Script → wklej aktualny plik <b>Portfel_Ceny.gs</b> z repozytorium (podmień cały kod) → Zapisz.</li>
      <li>Odśwież arkusz → menu <b>Portfel → 🪙 Włącz monitor sklepów</b>. Google raz zapyta o zgodę (pobieranie stron, e-mail, działanie w tle).</li>
      <li>Sprawdź <b>Portfel → 🪙 Wyślij testowe powiadomienie</b> – powinno przyjść na telefon.</li></ol>
    <div class="mut" style="font-size:12px;margin-top:8px">Skrypt działa na Twoim koncie Google co ${esc(monUst('minuty'))} min i powiadamia raz, gdy produkt zmieni stan na dostępny (lub przedsprzedaż / na zamówienie). Zmiany listy sklepów i ustawień z aplikacji skrypt widzi przy następnym sprawdzeniu. Limit Google dla kont prywatnych to ok. 90 min pracy skryptów dziennie, dlatego najczęściej co 5 min.</div>`;
  return ['Monitor sklepów', 'Powiadomienie, gdy w polskim sklepie z metalami pojawi się szukana moneta', `
    ${wl ? '' : '<div class="alert info">Monitor jest wstrzymany – włącz go w „Ustawienia wyszukiwania”.</div>'}
    <div class="kpis">${kpi('Dostępne teraz', `<span class="${dob.length ? 'pos' : ''}">${dob.length}</span>`, dob.length ? esc(dob.map(x => x.sklep).filter((v, i, a) => a.indexOf(v) === i).join(', ')) : 'w żadnym sklepie')}
      ${kpi('Szukam', esc(monUst('wymagane')), 'cena max: ' + (num(monUst('cenaMax')) ? nf2.format(num(monUst('cenaMax'))) + ' zł' : 'bez limitu'))}
      ${kpi('Sklepy', `${akt} / ${S.monitor.length}`, 'aktywne / wszystkie')}
      ${kpi('Ostatnie sprawdzenie', monCzas(spr), `<a onclick="monOdswiez()" style="cursor:pointer">${MON.busy ? 'wczytywanie…' : '↻ odśwież'}</a>`)}</div>
    <div class="card"><h3>Znalezione produkty</h3>${tblP}</div>
    <div class="card" style="margin-top:16px"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Sklepy</h3>
      <span class="row"><button class="btn sm ghost" onclick="monPrzywrocListe()">Dodaj brakujące z listy domyślnej</button><button class="btn sm" onclick="editMonSklep()">＋ Sklep</button></span></div>
      <div class="mut" style="font-size:12px;margin:6px 0 10px">„auto” – wystarczy domena, skrypt sam znajdzie wyszukiwarkę sklepu. Gdy sklep jest na czerwono, wklej adres strony z listą Pand (typ „lista”, w adresie możesz użyć {q} zamiast frazy) albo adres konkretnego produktu (typ „produkt” – sprawdzany bez filtra słów).</div>${tblS}</div>
    <div class="card" style="margin-top:16px"><h3>Jak włączyć powiadomienia na telefon</h3>${kroki}</div>`,
    `<button class="btn ghost" onclick="editMonUst()">Ustawienia wyszukiwania</button><button class="btn" onclick="editMonSklep()">＋ Sklep</button>`];
}

function editMonSklep(id) {
  const s = S.monitor.find(x => x.id === id) || { aktywny: 'TAK', typ: 'auto', sklep: '', adres: '', notatka: '' };
  modal(id ? 'Edytuj sklep' : 'Nowy sklep', [
    { k: 'sklep', l: 'Nazwa sklepu' }, { k: 'aktywny', l: 'Aktywny', t: 'select', o: ['TAK', 'NIE'] },
    { k: 'adres', l: 'Adres', full: 1, ph: 'np. mennicaskarbowa.pl albo https://sklep.pl/szukaj?q={q}', help: 'Domena (typ auto), strona wyszukiwania lub kategorii (lista) albo strona produktu.' },
    { k: 'typ', l: 'Typ adresu', t: 'select', o: Object.entries(MON_TYP), full: 1 }, { k: 'notatka', l: 'Notatka', full: 1 },
  ], s, o => {
    if (!o.sklep) return 'Podaj nazwę sklepu';
    if (!o.adres || !/[a-z0-9-]+\.[a-z]{2,}/i.test(o.adres)) return 'Podaj adres sklepu (np. sklep.pl)';
    if (o.typ === 'auto' && /^(https?:\/\/)?[^\/]+\/.+/i.test(o.adres) && !/^(https?:\/\/)?[^\/]+\/pl\/?$/i.test(o.adres)) o.typ = 'lista';
    if (id) Object.assign(s, o); else S.monitor.push({ ...o, id: uid() });
    changed('monitor');
  }, id ? () => { S.monitor = S.monitor.filter(x => x.id !== id); changed('monitor'); } : null);
}
function monPrzywrocListe() {
  const host = a => String(a).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
  const mam = new Set(S.monitor.map(s => host(s.adres)));
  const nowe = MON_SKLEPY_DOMYSLNE.filter(([, a]) => !mam.has(host(a)));
  nowe.forEach(([sklep, adres, typ]) => S.monitor.push({ id: uid(), aktywny: 'TAK', sklep, adres, typ, notatka: '' }));
  if (nowe.length) changed('monitor'); toast(nowe.length ? `Dodano ${nowe.length} sklepów` : 'Wszystkie sklepy z listy domyślnej już są'); render();
}
function editMonUst() {
  const v = Object.fromEntries(Object.keys(MON_UST_DOMYSLNE).map(k => [k, monUst(k)]));
  modal('Ustawienia wyszukiwania', [
    { k: 'wlaczony', l: 'Monitor', t: 'select', o: [['TAK', 'włączony'], ['NIE', 'wstrzymany']] },
    { k: 'minuty', l: 'Sprawdzaj co', t: 'select', o: [['5', '5 minut'], ['10', '10 minut'], ['15', '15 minut'], ['30', '30 minut']] },
    { k: 'wymagane', l: 'Nazwa musi zawierać (wszystkie, po przecinku)', full: 1, help: 'np. „panda, 2026” – wielkość liter i polskie znaki bez znaczenia' },
    { k: 'wyklucz', l: 'Pomijaj, gdy nazwa zawiera (całe słowa, po przecinku)', t: 'textarea', full: 1, help: 'Odsiewa złote Pandy, kolorowane i inne wersje, inne roczniki i wagi. Chińska Panda od 2016 r. ma 30 g zamiast 1 oz.' },
    { k: 'szukaj', l: 'Słowo do wyszukiwarki sklepu', help: 'Krótkie, np. „panda” – wyniki filtruje skrypt' },
    { k: 'cenaMax', l: 'Cena maksymalna za sztukę (PLN)', t: 'number', help: 'Puste = bez limitu. Droższe oferty widać w tabeli, ale bez powiadomienia.' },
    { k: 'przedsprzedaz', l: 'Powiadamiaj też o przedsprzedaży / „na zamówienie”', t: 'select', o: ['TAK', 'NIE'] },
    { k: 'email', l: 'Powiadomienie e-mail (Gmail)', t: 'select', o: ['TAK', 'NIE'] },
    { k: 'ntfy', l: 'Temat ntfy (powiadomienia push na telefon)', full: 1, help: 'Ten sam temat zasubskrybuj w aplikacji ntfy. Puste = bez push.' },
  ], v, o => {
    if (!monLista(o.wymagane).length) return 'Podaj przynajmniej jedno słowo, np. panda';
    if (o.ntfy && !/^[A-Za-z0-9_-]{6,64}$/.test(o.ntfy)) return 'Temat ntfy: same litery, cyfry, - i _ (6–64 znaki)';
    monSetUst({ ...o, minuty: Number(o.minuty) || 10 }); changed('monitorUst');
  });
}
const monLista = s => String(s || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
