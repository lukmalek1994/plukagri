/* ===================== FIRE: ile brakuje do niezależności finansowej ===================== */
// oczekiwane realne (po inflacji) roczne stopy zwrotu dla klas aktywów – założenia, można nadpisać własną stopą
const FIRE_KLASY = { 'Akcje/ETF': 5, 'Obligacje': 1.5, 'Obligacje skarbowe': 1.5, 'Złoto': 1.5, 'Srebro': 1.5, 'Krypto': 5, 'Gotówka': 0, 'Inne': 3 };

function fireDane() {
  const CP = calcPLN(), f = CFG.fire || {};
  const wykl = new Set(f.wyklucz || []);
  const konta = CP.konta.map(k => ({ ...k, wlicz: !wykl.has(k.nazwa) }));
  const kontaW = konta.filter(k => k.wlicz).map(k => k.nazwa);
  const poz = CP.pozycje.filter(p => kontaW.includes(p.konto));
  const gotowka = konta.filter(k => k.wlicz).reduce((a, k) => a + k.gotowkaPLN, 0);
  const wartosc = poz.reduce((a, p) => a + p.wartoscPLN, 0) + gotowka;
  // struktura -> oczekiwana stopa realna
  const klasy = {}; poz.forEach(p => { klasy[p.klasa] = (klasy[p.klasa] || 0) + p.wartoscPLN; }); if (gotowka) klasy['Gotówka'] = (klasy['Gotówka'] || 0) + gotowka;
  const stopaAuto = wartosc ? Object.entries(klasy).reduce((a, [k, v]) => a + (FIRE_KLASY[k] ?? FIRE_KLASY.Inne) * v, 0) / wartosc : 5;
  // podatek Belki przy wypłatach z kont opodatkowanych (od części stanowiącej zysk)
  const typ = Object.fromEntries(CP.konta.map(k => [k.nazwa, k.typ]));
  const pozOp = poz.filter(p => typ[p.konto] === 'Opodatkowane');
  const wOp = pozOp.reduce((a, p) => a + p.wartoscPLN, 0), kOp = pozOp.reduce((a, p) => a + (p.kosztPLNr ?? p.kosztPLN), 0);
  const udzialOp = wartosc ? wOp / wartosc : 0, zyskFrac = wOp ? Math.max(0, (wOp - kOp) / wOp) : 0;
  // średnie wpłaty z ostatnich 12 miesięcy
  const od = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const wpl12 = S.wplaty.filter(w => w.data >= od && kontaW.includes(w.konto)).reduce((a, w) => a + num(w.kwotaPLN), 0);
  // dochód pasywny netto z ostatnich 12 miesięcy
  const pas12 = CP.dyw.filter(d => d.data >= od && kontaW.includes((S.strategie.find(s => s.nazwa === d.strategia) || {}).konto)).reduce((a, d) => a + (d.nettoPLNprawdziwe ?? d.nettoPLN), 0);
  const xr = xirrPortfel(S, CP);
  const inflPL = (() => { const r = S.inflacja.filter(x => has(x.mm)).slice(-12); return r.length === 12 ? r.reduce((a, x) => a * (1 + num(x.mm) / 100), 1) - 1 : null; })();
  return { CP, konta, wartosc, klasy, stopaAuto, udzialOp, zyskFrac, wplAvg: wpl12 / 12, pas12, xr, inflPL };
}

/* symulacja w dzisiejszych złotych (stopa realna), miesięcznie; zwraca miesiąc osiągnięcia celu */
function fireSym(V0, wplata, stopa, wzrost, cel, maxLat = 60) {
  const r = Math.pow(1 + stopa / 100, 1 / 12) - 1; let V = V0, c = wplata, wpl = V0; const pts = [[0, V0]]; let m = null;
  if (V0 >= cel) m = 0;
  for (let i = 1; i <= maxLat * 12; i++) {
    V = V * (1 + r) + c; wpl += c;
    if (i % 12 === 0) { c *= 1 + wzrost / 100; pts.push([i, V]); }
    if (m === null && V >= cel) m = i;
  }
  return { m, pts, V };
}

function fireWyniki() {
  const D = fireDane(), f = CFG.fire || {};
  const o = {
    wydatki: has(f.wydatki) ? num(f.wydatki) : (num((CFG.sym || {}).wydatki) || 5000),
    swr: has(f.swr) ? num(f.swr) : 4,
    stopa: has(f.stopa) ? num(f.stopa) : Math.round(D.stopaAuto * 10) / 10,
    wplata: has(f.wplata) ? num(f.wplata) : Math.round(D.wplAvg),
    wzrost: has(f.wzrost) ? num(f.wzrost) : 0,
    lata: has(f.lata) ? num(f.lata) : 15,
    rok: has(f.rok) ? num(f.rok) : '',
    belka: f.belka !== false,
  };
  const roczne = o.wydatki * 12;
  // podatek przy wypłatach: 19% od części zysku na kontach opodatkowanych; udział zysku rośnie z czasem -> liczymy dla momentu FIRE
  const celDla = zf => roczne / (o.swr / 100) / (1 - (o.belka ? 0.19 * zf * D.udzialOp : 0));
  let cel = celDla(D.zyskFrac), sym = fireSym(D.wartosc, o.wplata, o.stopa, o.wzrost, cel);
  for (let k = 0; k < 3 && sym.m; k++) {   // udział zysku w chwili FIRE: (wartość − wpłacony kapitał) / wartość
    const n = sym.m, r = Math.pow(1 + o.stopa / 100, 1 / 12) - 1; let V = D.wartosc, baza = D.wartosc * (1 - D.zyskFrac), c = o.wplata;
    for (let i = 1; i <= n; i++) { V = V * (1 + r) + c; baza += c; if (i % 12 === 0) c *= 1 + o.wzrost / 100; }
    cel = celDla(V ? Math.max(0, 1 - baza / V) : D.zyskFrac); sym = fireSym(D.wartosc, o.wplata, o.stopa, o.wzrost, cel);
  }
  const efTax = cel ? 1 - roczne / (o.swr / 100) / cel : 0;
  const r = Math.pow(1 + o.stopa / 100, 1 / 12) - 1, n = o.lata * 12;
  const potrzebnaWplata = n > 0 ? Math.max(0, (cel - D.wartosc * Math.pow(1 + r, n)) * r / (Math.pow(1 + r, n) - 1 || 1)) : 0;
  const coast = cel / Math.pow(1 + o.stopa / 100, o.lata);
  const bezpiecznieTeraz = D.wartosc * o.swr / 100 / 12 * (1 - efTax);
  return { D, o, cel, sym, efTax, potrzebnaWplata, coast, bezpiecznieTeraz, brakuje: Math.max(0, cel - D.wartosc), postep: cel ? D.wartosc / cel : 0 };
}

function fireSet(k, v) { CFG.fire = CFG.fire || {}; if (v === '' || v === null) delete CFG.fire[k]; else CFG.fire[k] = v; saveCfg(); render(); }
function fireKonto(nazwa, wlicz) { CFG.fire = CFG.fire || {}; const s = new Set(CFG.fire.wyklucz || []); wlicz ? s.delete(nazwa) : s.add(nazwa); CFG.fire.wyklucz = [...s]; saveCfg(); render(); }

function vFire() {
  const R = fireWyniki(), { D, o } = R, f = CFG.fire || {};
  const teraz = new Date(), dataZa = m => { const d = new Date(teraz); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 7); };
  const czas = m => m === null ? '<span class="neg">ponad 60 lat</span>' : m === 0 ? '<span class="pos">już teraz</span>' : `${Math.floor(m / 12)} l. ${m % 12} mies.`;
  const wiek = m => o.rok && m !== null ? ` · wiek ${teraz.getFullYear() + Math.floor(m / 12) - o.rok}` : '';
  const fld = (k, l, val, auto, step = 'any', help = '') => `<label>${l}<input type="number" step="${step}" value="${esc(has(f[k]) ? f[k] : '')}" placeholder="${esc(auto)}" onchange="fireSet('${k}',this.value===''?'':num(this.value))">${help ? `<span class="help">${help}</span>` : ''}</label>`;

  // scenariusze
  const stopy = [Math.max(0, o.stopa - 2), o.stopa, o.stopa + 2].map(x => Math.round(x * 10) / 10);
  const wpl = [0, o.wplata, Math.round(o.wplata * 1.5), Math.round(o.wplata * 2)].filter((v, i, a) => a.indexOf(v) === i);
  const scen = stopy.map(s => ({ s, c: wpl.map(c => fireSym(D.wartosc, c, s, o.wzrost, R.cel).m) }));
  const scenTbl = `<div class="tbl"><table><thead><tr><th>Stopa realna \\ wpłata mies.</th>${wpl.map(c => `<th class="n">${zlPLN(c, 0)}${c === o.wplata ? ' <span class="mut">(obecnie)</span>' : ''}</th>`).join('')}</tr></thead><tbody>
    ${scen.map(r => `<tr><td><b>${String(r.s).replace('.', ',')}%</b>${r.s === o.stopa ? ' <span class="mut">(założona)</span>' : ''}</td>${r.c.map((m, i) => `<td class="n" style="${r.s === o.stopa && wpl[i] === o.wplata ? 'background:#eef3fb;font-weight:600' : ''}">${czas(m)}${m ? `<br><span class="mut" style="font-size:11.5px">${dataZa(m)}</span>` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  // wykres: wartość w dzisiejszych zł (3 scenariusze) vs cel
  const lat = Math.min(60, Math.max(10, Math.ceil(((R.sym.m ?? 360) + 36) / 12)));
  const line = (s, name, color, dash) => ({ name, color, dash, points: fireSym(D.wartosc, o.wplata, s, o.wzrost, R.cel, lat).pts.map(([m, v]) => [dataZa(m) + '-01', v]) });
  const chart = lineChart([line(o.stopa, `Portfel (${String(o.stopa).replace('.', ',')}% realnie)`, '#1565C0'), line(stopy[0], `Pesymistycznie (${String(stopy[0]).replace('.', ',')}%)`, '#94a3b8', true),
    line(stopy[2], `Optymistycznie (${String(stopy[2]).replace('.', ',')}%)`, '#26A69A', true),
    { name: 'Cel FIRE', color: '#F9A825', dash: true, points: [[dataZa(0) + '-01', R.cel], [dataZa(lat * 12) + '-01', R.cel]] }], { area: false, pln: true, h: 280 });

  const klasyTxt = Object.entries(D.klasy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${pct(v / D.wartosc)} × ${String(FIRE_KLASY[k] ?? FIRE_KLASY.Inne).replace('.', ',')}%`).join(' · ');
  const pasPokrycie = R.o.wydatki ? D.pas12 / 12 / o.wydatki : 0;

  return ['FIRE – niezależność finansowa', 'Ile brakuje, żeby portfel pokrywał Twoje wydatki – liczone z aktualnych danych, w dzisiejszych złotych', `
    <div class="kpis">
      ${kpi('Cel FIRE', zlPLN(R.cel, 0), `${zlPLN(o.wydatki, 0)}/mies. · wypłata ${String(o.swr).replace('.', ',')}% rocznie${R.efTax > 0.0005 ? ` · z podatkiem Belki ~${pct(R.efTax)}` : ''}`, 'main')}
      ${kpi('Masz dziś', zlPLN(D.wartosc, 0), `${pct(R.postep)} celu`)}
      ${kpi('Brakuje', R.brakuje ? `<span class="neg">${zlPLN(R.brakuje, 0)}</span>` : '<span class="pos">0 zł – cel osiągnięty</span>', R.brakuje ? `${pct(1 - R.postep)} celu` : '')}
      ${kpi('FIRE osiągniesz', R.sym.m === null ? '<span class="neg">ponad 60 lat</span>' : R.sym.m === 0 ? '<span class="pos">teraz</span>' : dataZa(R.sym.m), `za ${czas(R.sym.m)}${wiek(R.sym.m)} · przy ${zlPLN(o.wplata, 0)}/mies.`)}
      ${kpi('Portfel wypłaca już dziś', zlPLN(R.bezpiecznieTeraz, 0) + '/mies.', `${pct(o.wydatki ? R.bezpiecznieTeraz / o.wydatki : 0)} wydatków (reguła ${String(o.swr).replace('.', ',')}%)`)}
    </div>
    <div class="card"><h3>Postęp do FIRE<span class="sp"></span><small>${zlPLN(D.wartosc, 0)} z ${zlPLN(R.cel, 0)}</small></h3>
      <div class="bar" style="height:16px"><i style="width:${Math.min(100, R.postep * 100).toFixed(1)}%;background:linear-gradient(90deg,#1565C0,#26A69A)"></i></div>
      <div class="row mut" style="font-size:12px;margin-top:6px;justify-content:space-between"><span>0</span><span>Coast FIRE (${o.lata} lat): ${zlPLN(R.coast, 0)}${D.wartosc >= R.coast ? ' <b class="pos">✓ osiągnięty</b>' : ''}</span><span>${zlPLN(R.cel, 0)}</span></div></div>
    <div class="grid g2" style="margin-top:16px"><div class="card"><h3>Prognoza w dzisiejszych złotych</h3>${chart}</div>
      <div class="card"><h3>Założenia <small>puste pole = wartość z Twoich danych</small></h3><div class="form">
        ${fld('wydatki', 'Miesięczne wydatki na emeryturze (zł)', o.wydatki, 5000)}
        ${fld('swr', 'Stopa wypłat rocznie (%)', o.swr, 4, '0.1', '4% – klasyczna reguła; na 40+ lat bezpieczniej 3–3,5%')}
        ${fld('wplata', 'Wpłata miesięczna (zł)', o.wplata, Math.round(D.wplAvg), 'any', `średnia z ostatnich 12 mies.: ${zlPLN(D.wplAvg, 0)}`)}
        ${fld('stopa', 'Stopa zwrotu realnie, po inflacji (%)', o.stopa, Math.round(D.stopaAuto * 10) / 10, '0.1', `wg struktury portfela: ${String(Math.round(D.stopaAuto * 10) / 10).replace('.', ',')}%`)}
        ${fld('wzrost', 'Realny wzrost wpłat co rok (%)', o.wzrost, 0, '0.5')}
        ${fld('lata', 'Horyzont dla wyliczeń (lat)', o.lata, 15, '1')}
        ${fld('rok', 'Rok urodzenia (opcjonalnie)', o.rok, '', '1')}
        <label>Podatek Belki przy wypłatach<select onchange="fireSet('belka',this.value==='1')"><option value="1" ${o.belka ? 'selected' : ''}>uwzględniaj (konta opodatkowane)</option><option value="0" ${o.belka ? '' : 'selected'}>pomiń</option></select></label>
      </div>
      <div class="mut" style="font-size:12px;margin-top:8px">Twoja dotychczasowa stopa (XIRR): ${D.xr === null ? 'brak danych' : pct(D.xr)} nominalnie${D.xr !== null && D.inflPL !== null ? `, ok. ${pct((1 + D.xr) / (1 + D.inflPL) - 1)} po inflacji` : ''}. Oczekiwana stopa wg struktury: ${klasyTxt || '–'}.</div></div></div>
    <div class="card" style="margin-top:16px"><h3>Kiedy FIRE – scenariusze <small>czas do celu przy różnej stopie i wpłacie</small></h3>${scenTbl}</div>
    <div class="grid g2e" style="margin-top:16px"><div class="card"><h3>Co zrobić, żeby zdążyć w ${o.lata} lat</h3>
      <div class="kpis" style="margin:0">${kpi(`Potrzebna wpłata`, zlPLN(R.potrzebnaWplata, 0) + '/mies.', R.potrzebnaWplata <= o.wplata ? '<span class="pos">obecne wpłaty wystarczą</span>' : `o ${zlPLN(R.potrzebnaWplata - o.wplata, 0)} więcej niż teraz`)}
      ${kpi('Coast FIRE', zlPLN(R.coast, 0), D.wartosc >= R.coast ? '<span class="pos">masz już tyle – bez dalszych wpłat cel przyjdzie sam</span>' : `tyle wystarczy mieć dziś bez dalszych wpłat (brakuje ${zlPLN(R.coast - D.wartosc, 0)})`)}</div>
      <div class="mut" style="font-size:12.5px;margin-top:10px">Każde 500 zł mniej wydatków miesięcznie obniża cel o ${zlPLN(500 * 12 / (o.swr / 100) / (1 - R.efTax), 0)}.</div></div>
      <div class="card"><h3>Dochód pasywny <small>ostatnie 12 mies., netto</small></h3>
      <div class="kpis" style="margin:0">${kpi('Dywidendy i odsetki', zlPLN(D.pas12 / 12, 0) + '/mies.', `${pct(pasPokrycie)} Twoich wydatków`)}${kpi('Rocznie', zlPLN(D.pas12, 0))}</div>
      <div class="mut" style="font-size:12.5px;margin-top:10px">Dochód pasywny jest już zawarty w stopie zwrotu – to podgląd, jaka część wydatków jest pokryta gotówką bez sprzedawania aktywów.</div></div></div>
    <div class="card" style="margin-top:16px"><h3>Konta wliczane do FIRE</h3>${table([
      { h: '', f: k => `<input type="checkbox" ${k.wlicz ? 'checked' : ''} onchange="fireKonto('${esc(k.nazwa)}',this.checked)">` },
      { h: 'Konto', f: k => `<b>${esc(k.nazwa)}</b> <span class="mut">${esc(k.typ)}</span>` }, { h: 'Wartość', n: 1, f: k => zlPLN(k.razem, 0) },
      { h: '', f: k => k.typ === 'IKE' || k.typ === 'IKZE' ? '<span class="mut">wypłata bez podatku po 60. r.ż. – przy wcześniejszym FIRE potrzebujesz pieniędzy także poza IKE</span>' : '' },
    ], D.konta)}</div>
    <div class="mut" style="font-size:12px;margin-top:10px">Wszystko w dzisiejszych złotych: stopa zwrotu jest realna (po inflacji), więc cel i prognozy nie wymagają przeliczania o inflację. Cel = roczne wydatki ÷ stopa wypłat, powiększony o podatek Belki od części zysku na kontach opodatkowanych (udział zysku szacowany na moment osiągnięcia FIRE). To symulacja przy stałej stopie – rzeczywiste wyniki będą się wahać.</div>`,
    `<button class="btn ghost" onclick="CFG.fire={};saveCfg();render()">Przywróć dane z portfela</button>`];
}
