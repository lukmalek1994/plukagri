/* ===================== MOJE FINANSE – DOKUMENTY PIT =====================
   Dane dokumentu -> zakładka „Dokumenty PIT” w arkuszu. Plik -> Google Drive: „Portfel – dokumenty PIT/<rok>”. */
const PIT_FOLDER = 'Portfel – dokumenty PIT';
const PIT_RODZAJE = ['PIT-8C (od brokera)', 'PIT-38 (zeznanie)', 'UPO (potwierdzenie złożenia)', 'Potwierdzenie zapłaty podatku', 'PIT-37', 'PIT-36', 'PIT-11', 'PIT/ZG',
  'Korekta zeznania', 'Pismo / decyzja z urzędu', 'Certyfikat rezydencji / W-8BEN', 'Inne'];
const pitLista = () => (S.dokumenty = S.dokumenty || []);
const pitRokDomyslny = () => { const d = new Date(); return String(d.getMonth() <= 4 ? d.getFullYear() - 1 : d.getFullYear()); };   // do maja: rozliczamy poprzedni rok
const pitKrotko = r => String(r || '').replace(/\s*\(.*\)$/, '');

/* konta „Opodatkowane” z operacjami w danym roku -> od każdego broker powinien przysłać PIT-8C */
function pitKontaZRuchem(rok) {
  const kontoStrat = n => (S.strategie.find(s => s.nazwa === n) || {}).konto;
  const opod = new Set(S.konta.filter(k => k.typ === 'Opodatkowane').map(k => k.nazwa)), m = new Set();
  S.transakcje.filter(t => t.typ === 'SPRZEDAŻ' && String(t.data).startsWith(rok)).forEach(t => { const k = kontoStrat(t.strategia); if (opod.has(k)) m.add(k); });
  S.dywidendy.filter(d => String(d.data).startsWith(rok)).forEach(d => { const k = kontoStrat(d.strategia); if (opod.has(k)) m.add(k); });
  return [...m];
}

function vDokumenty() {
  const L = pitLista(), F = FILT.pit || (FILT.pit = { rok: pitRokDomyslny(), q: '' });
  const lata = [...new Set([F.rok, pitRokDomyslny(), String(new Date().getFullYear()), String(new Date().getFullYear() - 1), ...L.map(d => String(d.rok)), ...((C && C.lata) || []).map(String)].filter(Boolean))].sort().reverse();
  const q = String(F.q || '').toLowerCase();
  const rows = L.filter(d => (!F.rok || String(d.rok) === F.rok) && (!q || [d.rodzaj, d.wystawca, d.konto, d.notatka, d.plik].some(v => String(v || '').toLowerCase().includes(q))))
    .sort((a, b) => String(b.rok).localeCompare(String(a.rok)) || PIT_RODZAJE.indexOf(a.rodzaj) - PIT_RODZAJE.indexOf(b.rodzaj) || String(b.data).localeCompare(String(a.data)));
  const opt = (v, cur, lab) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(lab || v)}</option>`;

  // lista kontrolna dla wybranego roku
  let lista = '', P = null;
  if (F.rok) {
    const zRok = L.filter(d => String(d.rok) === F.rok), ma = (rodz, konto) => zRok.find(d => d.rodzaj === rodz && (!konto || d.konto === konto));
    const konta = pitKontaZRuchem(F.rok);
    try { P = C.podatki(+F.rok, num(CFG.strataPrev[F.rok]), num(CFG.kryptoPrev[F.rok])); } catch (e) {}
    const pozycje = [...konta.map(k => ({ rodz: PIT_RODZAJE[0], konto: k, opis: `PIT-8C – ${k}`, help: 'broker wysyła do końca lutego' })),
      { rodz: PIT_RODZAJE[1], opis: 'PIT-38 – złożone zeznanie', help: 'termin: 30 kwietnia' }, { rodz: PIT_RODZAJE[2], opis: 'UPO – potwierdzenie złożenia', help: 'z e-Urzędu Skarbowego' }];
    if (P && P.razem > 0) pozycje.push({ rodz: PIT_RODZAJE[3], opis: 'Potwierdzenie zapłaty podatku', help: `wg aplikacji ${zlPLN(P.razem, 0)}` });
    lista = `<div class="pit-check">${pozycje.map(p => { const d = ma(p.rodz, p.konto);
      return `<div class="pit-it ${d ? 'ok' : ''}"><span class="pit-ic">${d ? '✓' : '○'}</span><div><b>${esc(p.opis)}</b><div class="mut" style="font-size:11.5px">${d ? (d.plikId ? '📎 ' + esc(d.plik || 'plik') : 'wpis bez pliku') : esc(p.help)}</div></div>
        ${d ? (d.plikId ? `<a onclick="pitPodglad('${d.id}')">Podgląd</a>` : `<a onclick="editDokument('${d.id}')">dodaj plik</a>`) : `<a onclick='editDokument(null,null,${esc(JSON.stringify({ rok: F.rok, rodzaj: p.rodz, konto: p.konto || '' }))})'>＋ dodaj</a>`}</div>`; }).join('')}</div>
      ${!konta.length ? '<div class="mut" style="font-size:12px;margin-top:8px">W tym roku nie ma sprzedaży ani dywidend na kontach „Opodatkowane” – PIT-8C nie powinny przyjść.</div>' : ''}`;
  }
  const plikCel = d => WYSYLANE.has(d.id) ? '<span class="mut">⏳ wysyłanie…</span>'
    : d.plikId ? `<a onclick="event.stopPropagation();pitPodglad('${d.id}')" title="${esc(d.plik || '')}">📎 Podgląd</a>`
    : `<label class="fin-add" onclick="event.stopPropagation()">＋ dodaj plik<input type="file" accept="image/*,application/pdf" style="display:none" onchange="pitPlikDoWpisu('${d.id}',this.files[0])"></label>`;
  const tbl = table([
    { h: 'Rok', f: d => `<b>${esc(d.rok)}</b>` },
    { h: 'Dokument', f: d => `<span class="tag">${esc(pitKrotko(d.rodzaj))}</span>` },
    { h: 'Wystawca / konto', f: d => `${esc(d.wystawca || '')}${d.konto ? `<div class="mut" style="font-size:12px">${esc(d.konto)}</div>` : ''}` },
    { h: 'Data', f: d => esc(d.data || '') },
    { h: 'Kwota', n: 1, f: d => has(d.kwota) ? zlPLN(num(d.kwota)) : '' },
    { h: 'Notatka', f: d => `<span class="mut" style="font-size:12.5px">${esc(d.notatka || '')}</span>` },
    { h: 'Plik', f: plikCel },
  ], rows, { empty: L.length ? 'Brak dokumentów dla wybranych filtrów' : 'Nie masz jeszcze dokumentów – dodaj pierwszy przyciskiem „＋ Dokument” albo upuść plik powyżej', click: d => `editDokument('${d.id}')` });
  const info = !SYNC.token && !CFG.demo ? `<div class="alert info">Pliki dokumentów zapisują się na Twoim Google Drive. <a onclick="syncNow()"><b>Zaloguj się do Google</b></a>, żeby móc je dodawać i oglądać.</div>`
    : SYNC.token && !SYNC.drive && !CFG.demo ? `<div class="alert">Aplikacja nie ma jeszcze zgody na zapis plików w Google Drive. Kliknij <a onclick="googleConnect(true)"><b>Zaloguj ponownie</b></a> i zaznacz dostęp do plików.</div>` : '';
  const folder = (CFG.driveDirs || {})['root/' + PIT_FOLDER];
  return ['Dokumenty PIT', 'PIT-8C, zeznania, UPO i pisma z urzędu – dane w arkuszu, pliki na Twoim Google Drive', `${info}
    <div class="row fin-f"><select onchange="FILT.pit.rok=this.value;render()">${opt('', F.rok, 'Wszystkie lata')}${lata.map(r => opt(r, F.rok, 'Rok podatkowy ' + r)).join('')}</select>
      <input type="search" placeholder="Szukaj: dokument, wystawca, konto…" value="${esc(F.q || '')}" onchange="FILT.pit.q=this.value;render()">
      <span class="sp" style="flex:1"></span>${skanBtn('dokumenty')}${folder ? `<a class="btn ghost sm" href="https://drive.google.com/drive/folders/${esc(folder)}" target="_blank" rel="noopener">📁 Folder w Google Drive</a>` : ''}</div>
    ${F.rok ? `<div class="grid g2"><div class="card"><h3>Lista kontrolna ${esc(F.rok)} <small>podpowiedź na podstawie Twoich kont i operacji</small></h3>${lista}</div>
      <div class="card"><h3>Rozliczenie ${esc(F.rok)} wg aplikacji <small><a onclick="FILT.rok='${esc(F.rok)}';go('podatki')">szczegóły PIT-38 →</a></small></h3>
        ${P ? `<div class="kpis" style="margin:0">${kpi('Podatek do zapłaty', zlPLN(P.razem, 0), 'papiery + dywidendy + krypto', 'main')}${kpi('Dochód z papierów', plPLN(P.dochod))}</div>
        <div class="mut" style="font-size:12px;margin-top:8px">Porównaj z kwotami z PIT-8C od brokera przed złożeniem PIT-38.</div>` : '<div class="empty">Brak danych</div>'}</div></div>` : ''}
    <label class="dropzone" style="margin-top:16px" ondragover="event.preventDefault();this.classList.add('on')" ondragleave="this.classList.remove('on')" ondrop="event.preventDefault();this.classList.remove('on');plikiDodaj('dokumenty',event.dataTransfer.files)">
      <input type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="plikiDodaj('dokumenty',this.files);this.value=''">
      <b>📄 Upuść tutaj dokument PIT</b><span class="mut">PDF lub zdjęcie – albo kliknij, aby wybrać plik</span></label>
    <div class="card" style="margin-top:16px"><h3>Dokumenty <small>${rows.length} poz.</small></h3>${tbl}</div>`,
    `<button class="btn" onclick="editDokument()">＋ Dokument</button>`];
}

/* ---------- formularz ---------- */
function editDokument(id, plikStart, preset) {
  const L = pitLista();
  const d = L.find(x => x.id === id) || { rok: (FILT.pit && FILT.pit.rok) || pitRokDomyslny(), rodzaj: PIT_RODZAJE[0], data: todayStr(), ...(preset || {}) };
  if (!id && !d.wystawca && d.rodzaj === PIT_RODZAJE[0] && d.konto) d.wystawca = /xtb/i.test(d.konto) ? 'XTB S.A.' : '';
  let plik = plikStart || null;
  const form = modal(id ? 'Edytuj dokument' : 'Nowy dokument PIT', [
    { k: 'rok', l: 'Rok podatkowy', t: 'number' }, { k: 'rodzaj', l: 'Rodzaj dokumentu', t: 'select', o: PIT_RODZAJE },
    { k: 'wystawca', l: 'Wystawca', ph: 'np. XTB S.A., Urząd Skarbowy' }, { k: 'konto', l: 'Konto (opcjonalnie)', t: 'select', o: [['', '– brak –'], ...S.konta.map(k => k.nazwa)] },
    { k: 'data', l: 'Data dokumentu / złożenia', t: 'date' }, { k: 'kwota', l: 'Kwota (opcjonalnie)', t: 'number', help: 'np. podatek do zapłaty lub zwrot' },
    { k: 'notatka', l: 'Notatka', full: 1 },
  ], d, o => {
    if (!(o.rok > 1990)) return 'Podaj rok podatkowy';
    o.rok = String(Math.round(o.rok));
    let rec = d;
    if (id) Object.assign(d, o); else { rec = { id: uid(), ...o }; L.push(rec); }
    if (FILT.pit) FILT.pit.rok = o.rok;
    changed('dokumenty'); toast('Zapisano dokument');
    if (plik) dolaczPlik('dokumenty', rec.id, plik);
  }, id ? () => {
    S.dokumenty = L.filter(x => x.id !== id); changed('dokumenty');
    if (d.plikId) { if (SYNC.token && SYNC.drive) driveDoKosza(d.plikId).then(() => toast('Plik przeniesiony do kosza Google Drive')).catch(() => toast('Wpis usunięty – plik został na Google Drive'));
      else toast('Wpis usunięty – plik został na Google Drive (zaloguj się, by usuwać też pliki)'); }
  } : null);
  form.elements.wystawca.setAttribute('list', 'dl_pitw');
  form.insertAdjacentHTML('beforeend', `<datalist id="dl_pitw">${[...new Set(['XTB S.A.', 'Urząd Skarbowy', ...L.map(x => x.wystawca)].filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`);
  // pole pliku (jak w potwierdzeniach przelewów)
  const zone = document.createElement('label'); zone.className = 'full fin-plik';
  const opis = () => plik ? `📎 <b>${esc(plik.name)}</b> <span class="mut">(${nf0.format(plik.size / 1024)} kB – wyśle się po zapisaniu)</span>`
    : d.plikId ? `📎 <b>${esc(d.plik || 'plik')}</b> <span class="mut">– kliknij, aby podmienić</span>` : '<b>＋ Dołącz plik</b> <span class="mut">PDF lub zdjęcie (możesz też upuścić plik tutaj)</span>';
  zone.innerHTML = `Plik dokumentu<div class="dropzone sm"><span class="fin-opis">${opis()}</span></div><input type="file" accept="image/*,application/pdf" style="display:none">`;
  form.appendChild(zone);
  const ustaw = file => { if (!file) return; if (file.size > 25 * 1024 * 1024) return toast('Plik jest za duży (maks. 25 MB)'); plik = file; zone.querySelector('.fin-opis').innerHTML = opis();
    // podpowiedź rodzaju z nazwy pliku
    if (!id) { const n = file.name.toUpperCase(); const hit = /UPO/.test(n) ? 2 : /8C/.test(n) ? 0 : /PIT.?38/.test(n) ? 1 : /PIT.?37/.test(n) ? 4 : /PIT.?11/.test(n) ? 6 : /ZG/.test(n) ? 7 : -1;
      if (hit >= 0) form.elements.rodzaj.value = PIT_RODZAJE[hit]; const y = n.match(/20\d\d/); if (y && !preset) form.elements.rok.value = y[0]; } };
  zone.querySelector('input').onchange = e => ustaw(e.target.files[0]);
  const dz = zone.querySelector('.dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('on'); }); dz.addEventListener('dragleave', () => dz.classList.remove('on'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('on'); ustaw(e.dataTransfer.files[0]); });
  const pod = [d.plikId ? `<a onclick="pitPodglad('${d.id}')">Podgląd</a> · <a href="${esc(d.plikUrl)}" target="_blank" rel="noopener">Otwórz w Google Drive</a>` : '',
    !CFG.demo && (!SYNC.token || !SYNC.drive) ? '<span style="color:#b45309">Aby dołączyć plik, najpierw zaloguj się do Google (plakietka u góry).</span>' : ''].filter(Boolean).join('<br>');
  if (pod) zone.insertAdjacentHTML('afterend', `<div class="full help" style="font-size:11.5px;margin-top:-6px">${pod}</div>`);
  if (plikStart) ustaw(plikStart);
  const save = form.closest('.modal').querySelector('[data-a=save]'), orig = save.onclick;
  save.onclick = () => { if (plik && !driveGotowy()) { if (!confirm('Nie można teraz wysłać pliku na Google Drive.\n\nZapisać sam wpis bez pliku? (plik dodasz później w tabeli)')) return; plik = null; } orig(); };
}

const pitNazwaPliku = (d, file) => {
  const ext = (String(file.name).match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
  return ([d.rok, pitKrotko(d.rodzaj), d.konto || d.wystawca, d.data].filter(Boolean).join(' ').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'dokument') + ext;
};
function pitPlikDoWpisu(id, file) {
  const d = pitLista().find(x => x.id === id); if (!d || !file) return;
  if (file.size > 25 * 1024 * 1024) return toast('Plik jest za duży (maks. 25 MB)');
  if (!driveGotowy()) return;
  dolaczPlik('dokumenty', d.id, file);
}
function pitPodglad(id) { const d = pitLista().find(x => x.id === id); if (d) podgladPliku(d, `${pitKrotko(d.rodzaj)} za ${d.rok}`, esc([d.wystawca, d.konto, d.data].filter(Boolean).join(' · '))); }
