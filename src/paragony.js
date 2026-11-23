/* ===================== MOJE FINANSE – PARAGONY Z ZAKUPU METALI FIZYCZNYCH =====================
   Dane paragonu/faktury -> zakładka „Paragony metale” w arkuszu. Plik -> Google Drive: „Portfel – paragony metale/<rok>”.
   Paragon można powiązać z transakcją KUPNO instrumentu z klasy Złoto/Srebro (lista „zakupy bez paragonu”). */
const PAR_FOLDER = 'Portfel – paragony metale';
const PAR_METALE = ['Srebro', 'Złoto', 'Platyna', 'Pallad', 'Inne'];
const PAR_DOK = ['Paragon', 'Faktura', 'Certyfikat', 'Potwierdzenie zamówienia', 'Umowa kupna-sprzedaży', 'Inne'];
const PAR_KIER = ['Zakup', 'Sprzedaż'];
const parKier = p => p.kierunek === 'Sprzedaż' ? 'Sprzedaż' : 'Zakup';   // stare wpisy bez pola = zakup
const parLista = () => (S.paragony = S.paragony || []);
const parMetalIns = i => !!i && (['Złoto', 'Srebro', 'Platyna', 'Pallad'].includes(i.klasa) || /złot|srebr|platyn|pallad|gold|silver/i.test(String(i.nazwa || '') + ' ' + i.ticker) && i.klasa !== 'Akcje/ETF');
const parMetalTx = t => (t.typ === 'KUPNO' || t.typ === 'SPRZEDAŻ') && parMetalIns(S.instrumenty.find(i => i.ticker === t.ticker));
const parMetalZIns = i => !i ? 'Inne' : PAR_METALE.find(m => i.klasa === m) || (/złot|gold/i.test(i.nazwa + i.ticker) ? 'Złoto' : /srebr|silver/i.test(i.nazwa + i.ticker) ? 'Srebro' : 'Inne');
// kwota w PLN z transakcji (cena w walucie instrumentu × kurs NBP D-1); zakup: + prowizja, sprzedaż: − prowizja
function parKwotaTx(t) {
  const i = S.instrumenty.find(x => x.ticker === t.ticker) || {}, pln = (i.waluta || 'PLN') === 'PLN';
  const k = pln ? 1 : num(t.kurs) || (C && C.rateNow(i.waluta)) || 0;
  return k ? r2((num(t.ilosc) * num(t.cena) + (t.typ === 'SPRZEDAŻ' ? -1 : 1) * num(t.prowizja)) * k) : '';
}

function vParagony() {
  const L = parLista(), F = FILT.par || (FILT.par = { rok: '', metal: '', kier: '', q: '' });
  const lata = [...new Set(L.map(p => String(p.data).slice(0, 4)).filter(Boolean))].sort().reverse();
  const q = String(F.q || '').toLowerCase();
  const rows = L.filter(p => (!F.rok || String(p.data).startsWith(F.rok)) && (!F.metal || p.metal === F.metal) && (!F.kier || parKier(p) === F.kier)
    && (!q || [p.sklep, p.produkt, p.notatka, p.plik, p.dokument].some(v => String(v || '').toLowerCase().includes(q))))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const opt = (v, cur, lab) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(lab || v)}</option>`;
  // zakupy metali w transakcjach, do których nie ma jeszcze paragonu
  const powiazane = new Set(L.map(p => p.transakcja).filter(Boolean));
  const bez = S.transakcje.filter(t => parMetalTx(t) && !powiazane.has(t.id)).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const wszystkieZak = S.transakcje.filter(parMetalTx).length;
  // sumy
  const plnK = p => (p.waluta || 'PLN') === 'PLN' ? num(p.kwota) : 0;
  const suma = rows.filter(p => parKier(p) === 'Zakup').reduce((a, p) => a + plnK(p), 0), sumaS = rows.filter(p => parKier(p) === 'Sprzedaż').reduce((a, p) => a + plnK(p), 0);
  const perMetal = {}; rows.forEach(p => { const m = p.metal || 'Inne'; perMetal[m] = (perMetal[m] || 0) + (parKier(p) === 'Sprzedaż' ? -1 : 1) * plnK(p); });
  const bezPliku = rows.filter(p => !p.plikId).length;
  const plikCel = p => p.plikStan ? '<span class="mut">⏳ wysyłanie…</span>'
    : p.plikId ? `<a onclick="event.stopPropagation();parPodglad('${p.id}')" title="${esc(p.plik || '')}">📎 Podgląd</a>`
    : `<label class="fin-add" onclick="event.stopPropagation()">＋ dodaj plik<input type="file" accept="image/*,application/pdf" style="display:none" onchange="parPlikDoWpisu('${p.id}',this.files[0])"></label>`;
  const txOpis = p => { const t = p.transakcja && S.transakcje.find(x => x.id === p.transakcja); return t ? `<div class="mut" style="font-size:11.5px">⇄ ${t.typ === 'SPRZEDAŻ' ? 'sprzedaż' : 'kupno'} ${esc(t.ticker)} · ${esc(t.strategia)} · ${nfq.format(num(t.ilosc))} szt.</div>` : ''; };
  const tbl = table([
    { h: 'Data', f: p => esc(p.data) },
    { h: 'Rodzaj', f: p => `<span class="tag ${parKier(p) === 'Sprzedaż' ? 'sell' : 'buy'}">${parKier(p)}</span>` },
    { h: 'Metal', f: p => `<span class="tag ${p.metal === 'Złoto' ? 'par-au' : p.metal === 'Srebro' ? 'par-ag' : ''}">${esc(p.metal || '')}</span>` },
    { h: 'Produkt', f: p => `<b>${esc(p.produkt || '–')}</b>${txOpis(p)}` },
    { h: 'Sklep / kontrahent', f: p => `${esc(p.sklep || '')}${p.dokument ? `<div class="mut" style="font-size:12px">${esc(p.dokument)}${p.numer ? ' ' + esc(p.numer) : ''}</div>` : ''}` },
    { h: 'Ilość', n: 1, f: p => has(p.ilosc) ? nfq.format(num(p.ilosc)) + ' szt.' : '' },
    { h: 'Kwota', n: 1, f: p => has(p.kwota) ? `<span class="${parKier(p) === 'Sprzedaż' ? 'pos' : ''}">${parKier(p) === 'Sprzedaż' ? '+' : ''}${money(num(p.kwota), p.waluta || 'PLN')}</span>` : '' },
    { h: 'Plik', f: plikCel },
  ], rows, { empty: L.length ? 'Brak paragonów dla wybranych filtrów' : 'Nie masz jeszcze paragonów – dodaj pierwszy przyciskiem „＋ Paragon” albo upuść plik powyżej', click: p => `editParagon('${p.id}')` });
  const bezTbl = bez.length ? `<div class="card" style="margin-top:16px"><h3>Transakcje metali bez paragonu <small>${bez.length} z ${wszystkieZak} transakcji kupna i sprzedaży · kliknij, aby dodać paragon</small></h3>${table([
    { h: 'Data', f: t => esc(t.data) }, { h: 'Typ', f: t => `<span class="tag ${t.typ === 'SPRZEDAŻ' ? 'sell' : 'buy'}">${t.typ === 'SPRZEDAŻ' ? 'Sprzedaż' : 'Kupno'}</span>` }, { h: 'Instrument', f: t => `<b>${esc(t.ticker)}</b>` }, { h: 'Strategia', f: t => esc(t.strategia) },
    { h: 'Notatka', f: t => `<span class="mut" style="font-size:12.5px">${esc(String(t.notatka || '').replace(/\s*XTB#\S+/, ''))}</span>` },
    { h: 'Ilość', n: 1, f: t => nfq.format(num(t.ilosc)) }, { h: 'Kwota PLN', n: 1, f: t => { const k = parKwotaTx(t); return k === '' ? '–' : zlPLN(k); } },
    { h: '', f: t => `<a onclick="event.stopPropagation();editParagon(null,null,'${t.id}')">＋ paragon</a>` },
  ], bez.slice(0, F.bezAll ? 999 : 8), { click: t => `editParagon(null,null,'${t.id}')` })}${bez.length > 8 && !F.bezAll ? `<div style="margin-top:8px"><a onclick="FILT.par.bezAll=true;render()">pokaż wszystkie (${bez.length})</a></div>` : ''}</div>` : '';
  const info = !SYNC.token && !CFG.demo ? `<div class="alert info">Zdjęcia i skany paragonów zapisują się na Twoim Google Drive. <a onclick="syncNow()"><b>Zaloguj się do Google</b></a>, żeby móc je dodawać i oglądać.</div>`
    : SYNC.token && !SYNC.drive && !CFG.demo ? `<div class="alert">Aplikacja nie ma jeszcze zgody na zapis plików w Google Drive. Kliknij <a onclick="googleConnect(true)"><b>Zaloguj ponownie</b></a> i zaznacz dostęp do plików.</div>` : '';
  const folder = (CFG.driveDirs || {})['root/' + PAR_FOLDER];
  const metaleKpi = Object.entries(perMetal).sort((a, b) => b[1] - a[1]).map(([m, v]) => `${esc(m)}: ${zlPLN(v, 0)}`).join('<br>') || '–';
  return ['Paragony – metale fizyczne', 'Paragony i faktury z zakupu i sprzedaży złota, srebra i innych kruszców – dane w arkuszu, pliki na Twoim Google Drive', `${info}
    <div class="kpis">${kpi('Paragonów', rows.length, F.rok ? 'w ' + F.rok : 'łącznie', 'main')}${kpi('Wydano na zakupy', zlPLN(suma, 0))}${kpi('Uzyskano ze sprzedaży', zlPLN(sumaS, 0))}${kpi('Netto według metalu', metaleKpi, 'zakupy − sprzedaże')}${kpi('Transakcje bez paragonu', bez.length, bez.length ? 'z transakcji w aplikacji' : 'wszystko udokumentowane')}${bezPliku ? kpi('Wpisy bez pliku', bezPliku) : ''}</div>
    <label class="dropzone" ondragover="event.preventDefault();this.classList.add('on')" ondragleave="this.classList.remove('on')" ondrop="event.preventDefault();this.classList.remove('on');editParagon(null,event.dataTransfer.files[0])">
      <input type="file" accept="image/*,application/pdf" style="display:none" onchange="editParagon(null,this.files[0]);this.value=''">
      <b>🪙 Upuść tutaj paragon lub fakturę</b><span class="mut">zdjęcie z telefonu albo PDF – albo kliknij, aby wybrać plik</span></label>
    ${bezTbl}
    <div class="card" style="margin-top:16px"><h3>Paragony <small>${rows.length} poz.</small></h3>
      <div class="row fin-f"><select onchange="FILT.par.rok=this.value;render()">${opt('', F.rok, 'Wszystkie lata')}${lata.map(r => opt(r, F.rok)).join('')}</select>
        <select onchange="FILT.par.kier=this.value;render()">${opt('', F.kier || '', 'Zakupy i sprzedaże')}${PAR_KIER.map(k => opt(k, F.kier || '')).join('')}</select>
        <select onchange="FILT.par.metal=this.value;render()">${opt('', F.metal, 'Wszystkie metale')}${PAR_METALE.map(m => opt(m, F.metal)).join('')}</select>
        <input type="search" placeholder="Szukaj: sklep, produkt, notatka…" value="${esc(F.q || '')}" onchange="FILT.par.q=this.value;render()">
        ${folder ? `<span class="sp" style="flex:1"></span><a class="btn ghost sm" href="https://drive.google.com/drive/folders/${esc(folder)}" target="_blank" rel="noopener">📁 Folder w Google Drive</a>` : ''}</div>
      ${tbl}</div>`,
    `<button class="btn" onclick="editParagon()">＋ Paragon</button>`];
}

/* ---------- formularz ---------- */
function editParagon(id, plikStart, txId) {
  const L = parLista();
  let p = L.find(x => x.id === id);
  if (!p) {
    p = { data: todayStr(), kierunek: (FILT.par && FILT.par.kier) || 'Zakup', dokument: 'Paragon', metal: 'Srebro', waluta: 'PLN', sklep: (L[L.length - 1] || {}).sklep || '' };
    const t = txId && S.transakcje.find(x => x.id === txId);
    if (t) { const i = S.instrumenty.find(x => x.ticker === t.ticker);
      Object.assign(p, { data: t.data, transakcja: t.id, kierunek: t.typ === 'SPRZEDAŻ' ? 'Sprzedaż' : 'Zakup', metal: parMetalZIns(i), ilosc: num(t.ilosc), kwota: parKwotaTx(t), produkt: String(t.notatka || '').replace(/\s*XTB#\S+/, '').trim() || (i && i.nazwa) || '' }); }
  }
  let plik = plikStart || null;
  const powiazane = new Set(L.filter(x => x.id !== id).map(x => x.transakcja).filter(Boolean));
  const txOpc = [['', '– brak –'], ...S.transakcje.filter(t => parMetalTx(t) && (!powiazane.has(t.id) || t.id === p.transakcja))
    .sort((a, b) => String(b.data).localeCompare(String(a.data))).map(t => [t.id, `${t.data} · ${t.typ === 'SPRZEDAŻ' ? 'sprzedaż' : 'kupno'} · ${t.ticker} · ${nfq.format(num(t.ilosc))} szt.${t.notatka ? ' · ' + String(t.notatka).replace(/\s*XTB#\S+/, '').slice(0, 30) : ''}`])];
  const form = modal(id ? 'Edytuj paragon' : 'Nowy paragon – metale fizyczne', [
    { k: 'kierunek', l: 'Rodzaj transakcji', t: 'select', o: PAR_KIER }, { k: 'data', l: 'Data', t: 'date' },
    { k: 'metal', l: 'Metal', t: 'select', o: PAR_METALE },
    { k: 'produkt', l: 'Produkt', full: 1, ph: 'np. Chińska Panda 2024 30 g, Krugerrand 1 oz, sztabka 100 g' },
    { k: 'ilosc', l: 'Ilość (szt.)', t: 'number' }, { k: 'kwota', l: 'Kwota', t: 'number', help: 'zakup: ile zapłaciłeś · sprzedaż: ile dostałeś' },
    { k: 'waluta', l: 'Waluta', t: 'select', o: FIN_WAL }, { k: 'sklep', l: 'Sklep / kontrahent', ph: 'np. Mennica Polska, Goldenmark, Tavex' },
    { k: 'dokument', l: 'Rodzaj dokumentu', t: 'select', o: PAR_DOK }, { k: 'numer', l: 'Numer paragonu / faktury' },
    { k: 'transakcja', l: 'Powiązana transakcja', t: 'select', o: txOpc, full: 1, help: 'Kupno lub sprzedaż metalu wpisana w Transakcjach – dzięki temu wiesz, które transakcje mają paragon.' },
    { k: 'notatka', l: 'Notatka', full: 1 },
  ], p, o => {
    if (!o.data) return 'Podaj datę';
    let rec = p;
    if (id) Object.assign(p, o); else { rec = { id: uid(), ...o }; L.push(rec); }
    changed('paragony'); toast('Zapisano paragon');
    if (plik) setTimeout(() => parDolaczPlik(rec, plik), 0);
  }, id ? () => {
    S.paragony = L.filter(x => x.id !== id); changed('paragony');
    if (p.plikId) { if (SYNC.token && SYNC.drive) driveDoKosza(p.plikId).then(() => toast('Plik przeniesiony do kosza Google Drive')).catch(() => toast('Wpis usunięty – plik został na Google Drive'));
      else toast('Wpis usunięty – plik został na Google Drive (zaloguj się, by usuwać też pliki)'); }
  } : null);
  const dl = (name, vals) => { const el = form.elements[name], idl = 'dl_par_' + name; el.setAttribute('list', idl);
    form.insertAdjacentHTML('beforeend', `<datalist id="${idl}">${[...new Set(vals.filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`); };
  dl('sklep', ['Mennica Polska', 'Goldenmark', 'Tavex', 'Mennica Skarbowa', 'Flying Atom', ...L.map(x => x.sklep)]); dl('produkt', L.map(x => x.produkt));
  // wybór transakcji uzupełnia puste pola
  form.elements.transakcja.addEventListener('change', () => { const t = S.transakcje.find(x => x.id === form.elements.transakcja.value); if (!t) return;
    const E = form.elements, i = S.instrumenty.find(x => x.ticker === t.ticker);
    E.data.value = t.data; E.kierunek.value = t.typ === 'SPRZEDAŻ' ? 'Sprzedaż' : 'Zakup'; E.metal.value = parMetalZIns(i); if (!E.ilosc.value) E.ilosc.value = num(t.ilosc);
    if (!E.kwota.value) { const k = parKwotaTx(t); if (k !== '') { E.kwota.value = k; E.waluta.value = 'PLN'; } }
    if (!E.produkt.value) E.produkt.value = String(t.notatka || '').replace(/\s*XTB#\S+/, '').trim() || (i && i.nazwa) || ''; });
  // pole pliku
  const zone = document.createElement('label'); zone.className = 'full fin-plik';
  const opis = () => plik ? `📎 <b>${esc(plik.name)}</b> <span class="mut">(${nf0.format(plik.size / 1024)} kB – wyśle się po zapisaniu)</span>`
    : p.plikId ? `📎 <b>${esc(p.plik || 'plik')}</b> <span class="mut">– kliknij, aby podmienić</span>` : '<b>＋ Dołącz zdjęcie lub PDF</b> <span class="mut">(możesz też upuścić plik tutaj)</span>';
  zone.innerHTML = `Plik paragonu<div class="dropzone sm"><span class="fin-opis">${opis()}</span></div><input type="file" accept="image/*,application/pdf" style="display:none">`;
  form.appendChild(zone);
  const ustaw = file => { if (!file) return; if (file.size > 25 * 1024 * 1024) return toast('Plik jest za duży (maks. 25 MB)'); plik = file; zone.querySelector('.fin-opis').innerHTML = opis(); };
  zone.querySelector('input').onchange = e => ustaw(e.target.files[0]);
  const dz = zone.querySelector('.dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('on'); }); dz.addEventListener('dragleave', () => dz.classList.remove('on'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('on'); ustaw(e.dataTransfer.files[0]); });
  const pod = [p.plikId ? `<a onclick="parPodglad('${p.id}')">Podgląd</a> · <a href="${esc(p.plikUrl)}" target="_blank" rel="noopener">Otwórz w Google Drive</a>` : '',
    !CFG.demo && (!SYNC.token || !SYNC.drive) ? '<span style="color:#b45309">Aby dołączyć plik, najpierw zaloguj się do Google (plakietka u góry).</span>' : ''].filter(Boolean).join('<br>');
  if (pod) zone.insertAdjacentHTML('afterend', `<div class="full help" style="font-size:11.5px;margin-top:-6px">${pod}</div>`);
  if (plikStart) ustaw(plikStart);
  const save = form.closest('.modal').querySelector('[data-a=save]'), orig = save.onclick;
  save.onclick = () => { if (plik && !driveGotowy()) { if (!confirm('Nie można teraz wysłać pliku na Google Drive.\n\nZapisać sam wpis bez pliku? (plik dodasz później w tabeli)')) return; plik = null; } orig(); };
}

const parNazwaPliku = (p, file) => {
  const ext = (String(file.name).match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
  return ([p.data, parKier(p) === 'Sprzedaż' ? 'sprzedaż' : '', p.metal, p.produkt, p.sklep].filter(Boolean).join(' ').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'paragon') + ext;
};
async function parDolaczPlik(p, file) {
  const stary = p.plikId;
  p.plikStan = 'wysyłanie'; render();
  try {
    const glowny = await driveFolder(PAR_FOLDER), rokF = await driveFolder(String(p.data || todayStr()).slice(0, 4), glowny);
    const r = await driveWyslij(file, parNazwaPliku(p, file), rokF);
    Object.assign(p, { plik: r.name, plikId: r.id, plikUrl: r.webViewLink || `https://drive.google.com/file/d/${r.id}/view`, plikTyp: r.mimeType || file.type || '' });
    delete p.plikStan; changed('paragony'); render(); toast('Paragon zapisany w Google Drive ✓');
    if (stary && stary !== r.id) driveDoKosza(stary).catch(() => {});
  } catch (e) { delete p.plikStan; render(); toast('Nie udało się wysłać pliku: ' + e.message); }
}
function parPlikDoWpisu(id, file) {
  const p = parLista().find(x => x.id === id); if (!p || !file) return;
  if (file.size > 25 * 1024 * 1024) return toast('Plik jest za duży (maks. 25 MB)');
  if (!driveGotowy()) return;
  parDolaczPlik(p, file);
}
function parPodglad(id) { const p = parLista().find(x => x.id === id); if (p) podgladPliku(p, p.produkt || p.metal || 'Paragon', esc([p.data, p.sklep, has(p.kwota) ? money(num(p.kwota), p.waluta || 'PLN') : ''].filter(Boolean).join(' · '))); }
