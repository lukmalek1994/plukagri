/* ===================== ALERTY CENOWE I PORTFELA DOCELOWEGO ===================== */
const ATYP = { 'KUPNO': 'Cena spadnie do (kupno)', 'SPRZEDAŻ': 'Cena wzrośnie do (sprzedaż)', 'ŚREDNIA': 'Zmiana od mojej średniej ceny zakupu', 'CEL': 'Odchylenie koszyka od portfela docelowego' };
const tickList = c => String(c.tickery || c.koszyk || '').split(',').map(s => s.trim()).filter(Boolean);
function yahooOf(ticker) {
  const i = S.instrumenty.find(x => x.ticker === ticker) || {}; const s = String(i.symbol || '').trim();
  if (/^YAHOO:/i.test(s)) return s.slice(6);
  if (s.startsWith('=')) return /GOLD/i.test(s) ? 'GC=F' : /SILVER/i.test(s) ? 'SI=F' : '';
  const m = s.match(/^([A-Z]+):(.+)$/i);
  if (m) { const ex = m[1].toUpperCase(), x = m[2];
    if (ex === 'CURRENCY') return x.length === 6 && /BTC|ETH/.test(x) ? x.slice(0, 3) + '-' + x.slice(3) : x + '=X';
    return x + ({ WSE: '.WA', LON: '.L', ETR: '.DE', FRA: '.DE', AMS: '.AS', EPA: '.PA', BIT: '.MI', SWX: '.SW', TSE: '.TO' }[ex] || ''); }
  return s || ticker || '';
}
const cenaInstr = t => { const i = S.instrumenty.find(x => x.ticker === t); return i ? (has(i.cena) ? num(i.cena) : num(i.cenaAuto)) : 0; };
function sredniaZakupu(ticker, konto) {
  const poz = C.pozycje.filter(p => p.ticker === ticker && (!konto || p.konto === konto)), q = poz.reduce((a, p) => a + p.ilosc, 0);
  return q ? poz.reduce((a, p) => a + p.koszt, 0) / q : 0;
}
/* stan alertu: ok / blisko / osiągnięty */
function alertEval(a) {
  const poziom = num(a.poziom), prog = has(a.prog) ? num(a.prog) : 3, cur = (S.instrumenty.find(i => i.ticker === a.ticker) || {}).waluta || '';
  const f2 = v => nf2.format(v) + (cur ? ' ' + cur : '');
  if (a.typ === 'KUPNO' || a.typ === 'SPRZEDAŻ') {
    const c = cenaInstr(a.ticker); if (!c || !poziom) return { stan: 'brak', opis: 'brak ceny' };
    const dist = (c / poziom - 1) * 100;   // + powyżej poziomu
    const hit = a.typ === 'KUPNO' ? c <= poziom : c >= poziom, near = a.typ === 'KUPNO' ? dist <= prog : -dist <= prog;
    return { stan: hit ? 'osiągnięty' : near ? 'blisko' : 'ok', teraz: f2(c), cel: f2(poziom), odl: hit ? 0 : Math.abs(dist), opis: `cena ${f2(c)}, poziom ${f2(poziom)}` };
  }
  if (a.typ === 'ŚREDNIA') {
    const avg = sredniaZakupu(a.ticker, a.konto), c = cenaInstr(a.ticker); if (!avg || !c) return { stan: 'brak', opis: 'brak pozycji lub ceny' };
    const v = (c / avg - 1) * 100, hit = poziom < 0 ? v <= poziom : v >= poziom, near = poziom < 0 ? v <= poziom + prog : v >= poziom - prog;
    return { stan: hit ? 'osiągnięty' : near ? 'blisko' : 'ok', teraz: (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%', cel: (poziom > 0 ? '+' : '') + poziom + '%', odl: hit ? 0 : Math.abs(v - poziom),
      opis: `${(v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',')}% od średniej ${f2(avg)}`, pp: 1 };
  }
  if (a.typ === 'CEL') {
    const M = C.modelFor(a.konto || ''), r = M.rows.find(x => x.koszyk === a.koszyk); if (!r || !M.tot) return { stan: 'brak', opis: 'brak koszyka w portfelu docelowym' };
    const v = Math.abs(r.odchylenie), hit = v >= poziom, near = v >= poziom - prog;
    const txt = `udział ${(r.udzial * 100).toFixed(1).replace('.', ',')}% vs cel ${(r.celPct * 100).toFixed(0)}% (${r.odchylenie >= 0 ? '+' : '−'}${v.toFixed(1).replace('.', ',')} pp)`;
    return { stan: hit ? 'osiągnięty' : near ? 'blisko' : 'ok', teraz: (r.odchylenie >= 0 ? '+' : '−') + v.toFixed(1).replace('.', ',') + ' pp', cel: '±' + poziom + ' pp', odl: hit ? 0 : poziom - v, opis: txt, pp: 1,
      rada: r.odchylenie > 0 ? 'nadwyżka – rozważ sprzedaż / wstrzymanie zakupów' : 'niedobór – rozważ dokupienie' };
  }
  return { stan: 'brak', opis: '' };
}
function alertNazwa(a) {
  if (a.typ === 'CEL') return `${a.koszyk} – ${a.konto || 'cały portfel'}`;
  return a.ticker + (a.typ === 'ŚREDNIA' && a.konto ? ` (${a.konto})` : '');
}
const STAN_TAG = { 'osiągnięty': '<span class="tag" style="background:#fde2e2;color:#b91c1c">● osiągnięty</span>', 'blisko': '<span class="tag" style="background:#fef3c7;color:#92400e">● blisko</span>', 'ok': '<span class="tag" style="background:#e7f6ec;color:#166534">czeka</span>', 'brak': '<span class="tag">brak danych</span>' };
function alertyAktywne() { return (S.alerty || []).filter(a => a.aktywny !== 'NIE').map(a => ({ a, e: alertEval(a) })); }

/* dane dla skryptu w arkuszu (żeby mógł sprawdzać alerty, gdy aplikacja jest zamknięta) */
function prepAlerty() {
  if (!S.alerty || !S.alerty.length || !C) return false;
  let zm = false;
  S.alerty.forEach(a => {
    const o = { yahoo: a.yahooR || (a.typ === 'CEL' ? '' : yahooOf(a.ticker)), waluta: a.typ === 'CEL' ? 'PLN' : ((S.instrumenty.find(i => i.ticker === a.ticker) || {}).waluta || ''),
      cenaApp: a.typ === 'CEL' ? '' : Math.round(cenaInstr(a.ticker) * 1e4) / 1e4, srednia: a.typ === 'ŚREDNIA' ? Math.round(sredniaZakupu(a.ticker, a.konto) * 1e4) / 1e4 : '', dane: '', opis: ATYP[a.typ] + ': ' + alertNazwa(a) };
    if (a.typ === 'CEL') {
      const rows = S.cele.filter(c => (c.konto || '') === (a.konto || '') && (c.koszyk || c.tickery)), row = rows.find(c => c.koszyk === a.koszyk);
      if (row) { const wM = p => a.konto ? p.konto === a.konto : ((S.konta.find(k => k.nazwa === p.konto) || {}).model || 'TAK') !== 'NIE';
        const all = [...new Set(rows.flatMap(tickList))], it = all.map(t => { const poz = C.pozycje.filter(p => p.ticker === t && wM(p)), q = poz.reduce((s, p) => s + p.ilosc, 0), w = poz.reduce((s, p) => s + p.wartoscPLN, 0);
          return [yahooOf(t), Math.round(q * 1e6) / 1e6, (S.instrumenty.find(i => i.ticker === t) || {}).waluta || 'PLN', q ? Math.round(w / q * 1e4) / 1e4 : 0, tickList(row).includes(t) ? 1 : 0]; });
        o.dane = JSON.stringify({ it, cel: num(row.cel) }); }
    }
    Object.entries(o).forEach(([k, v]) => { if (String(a[k] ?? '') !== String(v)) { a[k] = v; zm = true; } });
  });
  return zm;
}

/* powiadomienia przeglądarki (gdy aplikacja jest otwarta) */
function alertyPowiadom() {
  if (!C || CFG.demo) return;
  const seen = lsGet('portfel_alert_seen', {}), nowe = [];
  alertyAktywne().forEach(({ a, e }) => { const k = a.id; if ((e.stan === 'blisko' || e.stan === 'osiągnięty') && seen[k] !== e.stan) nowe.push({ a, e }); if (e.stan !== 'brak') seen[k] = e.stan; });
  lsSet('portfel_alert_seen', seen);
  if (nowe.length && 'Notification' in window && Notification.permission === 'granted')
    nowe.forEach(({ a, e }) => { try { new Notification(`${e.stan === 'osiągnięty' ? '🔔 Alert osiągnięty' : '⏳ Blisko alertu'}: ${alertNazwa(a)}`, { body: e.opis + (e.rada ? ' – ' + e.rada : '') }); } catch (er) {} });
}
async function wlaczPowiadomienia() {
  if (!('Notification' in window)) return toast('Ta przeglądarka nie obsługuje powiadomień');
  const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Powiadomienia włączone' : 'Powiadomienia zablokowane w przeglądarce'); render();
}

/* box w kokpicie */
function alertyBox() {
  const L = alertyAktywne().filter(x => x.e.stan === 'blisko' || x.e.stan === 'osiągnięty').sort((x, y) => (x.e.stan === 'osiągnięty' ? 0 : 1) - (y.e.stan === 'osiągnięty' ? 0 : 1));
  if (!L.length) return '';
  return `<div class="alert info" style="cursor:pointer" onclick="go('alerty')">🔔 <b>Alerty:</b> ${L.map(({ a, e }) => `${e.stan === 'osiągnięty' ? '<b class="neg">' : '<b style="color:#92400e">'}${esc(alertNazwa(a))}</b> ${esc(e.opis)}${e.rada ? ' – ' + esc(e.rada) : ''}`).join(' · ')}</div>`;
}

/* widok */
function vAlerty() {
  const L = (S.alerty || []).map(a => ({ a, e: a.aktywny === 'NIE' ? { stan: 'wył', opis: '' } : alertEval(a) }));
  const ord = { 'osiągnięty': 0, 'blisko': 1, 'ok': 2, 'brak': 3, 'wył': 4 };
  L.sort((x, y) => ord[x.e.stan] - ord[y.e.stan] || (x.e.odl ?? 99) - (y.e.odl ?? 99));
  const perm = 'Notification' in window ? Notification.permission : 'brak';
  const cnt = s => L.filter(x => x.e.stan === s).length;
  const tbl = table([
    { h: 'Stan', f: x => x.e.stan === 'wył' ? '<span class="tag">wyłączony</span>' : STAN_TAG[x.e.stan] },
    { h: 'Rodzaj', f: x => esc(ATYP[x.a.typ] || x.a.typ) }, { h: 'Instrument / koszyk', f: x => `<b>${esc(alertNazwa(x.a))}</b>${x.a.notatka ? ` <span class="mut">${esc(x.a.notatka)}</span>` : ''}` },
    { h: 'Teraz', n: 1, f: x => esc(x.e.teraz || '–') }, { h: 'Poziom alertu', n: 1, f: x => esc(x.e.cel || '–') },
    { h: 'Odległość', n: 1, f: x => x.e.odl === undefined ? '–' : x.e.odl === 0 ? '<b class="neg">osiągnięty</b>' : x.e.odl.toFixed(1).replace('.', ',') + (x.e.pp ? ' pp' : '%') },
    { h: 'Wskazówka', f: x => `<span class="mut">${esc(x.e.rada || '')}</span>` },
  ], L, { empty: 'Brak alertów – dodaj pierwszy przyciskiem „＋ Alert”', click: x => `editAlert('${x.a.id}')` });
  return ['Alerty', 'Powiadomienia o zbliżającej się cenie kupna / sprzedaży i o odchyleniu od portfela docelowego', `
    <div class="kpis">${kpi('Osiągnięte', `<span class="${cnt('osiągnięty') ? 'neg' : ''}">${cnt('osiągnięty')}</span>`, 'wymagają decyzji')}${kpi('Blisko', String(cnt('blisko')), 'w progu „blisko”')}${kpi('Czekają', String(cnt('ok')))}
      ${kpi('Powiadomienia w przeglądarce', perm === 'granted' ? '<span class="pos">włączone</span>' : perm === 'denied' ? '<span class="neg">zablokowane</span>' : `<button class="btn sm" onclick="wlaczPowiadomienia()">Włącz</button>`, 'działają, gdy aplikacja jest otwarta')}</div>
    <div class="card">${tbl}</div>
    <div class="card" style="margin-top:16px"><h3>Powiadomienia e-mail, gdy aplikacja jest zamknięta</h3>
      <ol class="mut" style="font-size:13px;line-height:1.7;margin:0">
        <li>Alerty zapisują się w Twoim arkuszu w zakładce <b>Alerty</b> (razem z danymi potrzebnymi do sprawdzania).</li>
        <li>W arkuszu wklej aktualny skrypt <b>Portfel_Ceny.gs</b> (Rozszerzenia → Apps Script) i zapisz.</li>
        <li>Odśwież arkusz – pojawi się menu <b>Portfel</b> → <b>Włącz alerty e-mail</b>. Google raz zapyta o zgodę (wysyłanie maili i działanie w tle).</li>
        <li>Od tej pory co 30 minut skrypt sprawdza ceny (Yahoo) i wysyła maila na Twój adres Gmail, gdy alert jest blisko lub osiągnięty – raz na każdy stan.</li></ol>
      <div class="mut" style="font-size:12px;margin-top:8px">Wszystko działa na Twoim koncie Google – nic nie trafia na GitHub ani na zewnętrzne serwery. Notowania Yahoo mogą mieć ok. 15 min opóźnienia.</div></div>`,
    `<button class="btn" onclick="editAlert()">＋ Alert</button>`];
}
function editAlert(id, preset = {}) {
  S.alerty = S.alerty || [];
  const a = S.alerty.find(x => x.id === id) || Object.assign({ typ: 'KUPNO', ticker: (C.pozycje[0] || S.instrumenty[0] || {}).ticker || '', konto: '', koszyk: '', poziom: '', prog: 3, aktywny: 'TAK' }, preset);
  const koszyki = [...new Set(S.cele.filter(c => c.koszyk).map(c => (c.konto || '') + '|' + c.koszyk))].map(x => { const [k, n] = x.split('|'); return [x, `${n} – ${k || 'cały portfel'}`]; });
  const form = modal(id ? 'Edytuj alert' : 'Nowy alert', [
    { k: 'typ', l: 'Rodzaj alertu', t: 'select', o: Object.entries(ATYP), full: 1 },
    { k: 'ticker', l: 'Instrument', t: 'select', o: S.instrumenty.map(i => [i.ticker, `${i.ticker} – ${i.nazwa || ''} (${i.waluta})`]) },
    { k: 'kk', l: 'Koszyk portfela docelowego', t: 'select', o: koszyki.length ? koszyki : [['', 'brak – zdefiniuj portfel docelowy']] },
    { k: 'konto', l: 'Konto (dla średniej ceny)', t: 'select', o: [['', 'wszystkie konta'], ...S.konta.map(k => k.nazwa)] },
    { k: 'poziom', l: 'Poziom', t: 'number', help: ' ' }, { k: 'prog', l: 'Próg „blisko”', t: 'number', help: ' ' },
    { k: 'aktywny', l: 'Aktywny', t: 'select', o: ['TAK', 'NIE'] }, { k: 'notatka', l: 'Notatka (np. „dokupić 2 szt.”)', full: 1 },
    { k: 'yahooR', l: 'Symbol Yahoo dla skryptu (opcjonalnie)', ph: 'wyliczany automatycznie', full: 1 },
  ], { ...a, kk: (a.konto || '') + '|' + (a.koszyk || '') }, o => {
    if (!o.poziom && o.poziom !== 0) return 'Podaj poziom';
    const out = { ...a, ...o, id: a.id || uid() };
    if (o.typ === 'CEL') { const [k, n] = String(o.kk || '|').split('|'); out.konto = k; out.koszyk = n; out.ticker = ''; if (!n) return 'Wybierz koszyk'; if (out.poziom <= 0) return 'Podaj odchylenie w pp (np. 5)'; }
    else out.koszyk = '';
    if (o.typ !== 'ŚREDNIA' && o.typ !== 'CEL') out.konto = '';
    delete out.kk;
    if (id) Object.assign(a, out); else S.alerty.push(out);
    prepAlerty(); changed('alerty');
  }, id ? () => { S.alerty = S.alerty.filter(x => x.id !== id); changed('alerty'); } : null);
  const upd = () => { const t = form.elements.typ.value, show = (k, v) => { form.elements[k].closest('label').style.display = v ? '' : 'none'; };
    show('ticker', t !== 'CEL'); show('kk', t === 'CEL'); show('konto', t === 'ŚREDNIA'); show('yahooR', t !== 'CEL');
    if (t === 'CEL' && !id && form.elements.prog.value === '3') form.elements.prog.value = 1;
    const tk = form.elements.ticker.value, cur = (S.instrumenty.find(i => i.ticker === tk) || {}).waluta || '', c = cenaInstr(tk);
    $('#help_poziom').textContent = t === 'CEL' ? 'Odchylenie udziału od celu w punktach procentowych, np. 5' : t === 'ŚREDNIA' ? `Zmiana w %, np. −10 (spadek) lub 25 (wzrost). Średnia: ${sredniaZakupu(tk, form.elements.konto.value) ? nf2.format(sredniaZakupu(tk, form.elements.konto.value)) + ' ' + cur : 'brak pozycji'}` : `Cena w ${cur || 'walucie instrumentu'}${c ? ' · teraz ' + nf2.format(c) : ''}`;
    $('#help_prog').textContent = t === 'KUPNO' || t === 'SPRZEDAŻ' ? 'W %: „blisko”, gdy cena jest tyle od poziomu (np. 3)' : 'W pp: „blisko”, gdy brakuje tyle do poziomu (np. 1)'; };
  ['typ', 'ticker', 'konto'].forEach(k => form.elements[k].addEventListener('change', upd)); upd();
}
