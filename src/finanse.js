/* ===================== MOJE FINANSE – POTWIERDZENIA PRZELEWÓW =====================
   Dane przelewu -> zakładka „Finanse” w arkuszu. Plik potwierdzenia (PDF / zdjęcie) -> Twój Google Drive,
   folder „Portfel – potwierdzenia przelewów” (uprawnienie drive.file: aplikacja widzi tylko pliki, które sama tam wgrała). */
const DRIVE = 'https://www.googleapis.com/drive/v3/files', DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3/files';
const FIN_FOLDER = 'Portfel – potwierdzenia przelewów';
const FIN_TYPY = ['Przelew wychodzący', 'Przelew przychodzący', 'Wpłata na konto inwestycyjne', 'Wypłata z konta inwestycyjnego', 'Inne'];
const FIN_WAL = ['PLN', 'USD', 'EUR', 'GBP', 'CHF'];
const finWych = t => t === 'Przelew wychodzący' || t === 'Wpłata na konto inwestycyjne';   // pieniądze wychodzą z banku
const finInw = t => t === 'Wpłata na konto inwestycyjne' || t === 'Wypłata z konta inwestycyjnego';
const finLista = () => (S.finanse = S.finanse || []);

/* ---------- Google Drive ---------- */
function driveGotowy() {
  if (CFG.demo) { toast('W trybie demo pliki nie są wysyłane'); return false; }
  if (!SYNC.token || Date.now() > SYNC.exp) { toast('Zaloguj się do Google – kliknij plakietkę u góry'); return false; }
  if (!SYNC.drive) { toast('Brak zgody na Google Drive – kliknij „Zaloguj przez Google” w Ustawieniach i zaznacz dostęp do plików'); return false; }
  return true;
}
async function driveFetch(method, url, body, raw) {
  const r = await fetch(url, { method, headers: Object.assign({ Authorization: 'Bearer ' + SYNC.token }, body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined });
  if (r.status === 401) { SYNC.token = null; throw new Error('Sesja Google wygasła – zaloguj się ponownie'); }
  if (!r.ok) { let t = ''; try { t = (await r.json()).error.message; } catch (e) {} const er = new Error(`Google Drive ${r.status} ${t}`); er.status = r.status; throw er; }
  return raw ? r.blob() : r.json();
}
let FIN_PENDING = null;
function finFolder() { return FIN_PENDING || (FIN_PENDING = _finFolder().finally(() => FIN_PENDING = null)); }
async function _finFolder() {
  if (CFG.finFolderId) {
    try { const f = await driveFetch('GET', `${DRIVE}/${CFG.finFolderId}?fields=id,trashed`); if (!f.trashed) return f.id; } catch (e) { if (e.status !== 404) throw e; }
  }
  const q = encodeURIComponent(`name='${FIN_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await driveFetch('GET', `${DRIVE}?q=${q}&fields=files(id)&spaces=drive`);
  const id = found.files && found.files[0] ? found.files[0].id
    : (await driveFetch('POST', `${DRIVE}?fields=id`, { name: FIN_FOLDER, mimeType: 'application/vnd.google-apps.folder' })).id;
  CFG.finFolderId = id; saveCfg(); return id;
}
// dowolny folder (opcjonalnie wewnątrz innego), zapamiętany w CFG.driveDirs
const DIR_PENDING = {};
function driveFolder(nazwa, parent) { const k = (parent || 'root') + '/' + nazwa; return DIR_PENDING[k] || (DIR_PENDING[k] = _driveFolder(nazwa, parent).finally(() => delete DIR_PENDING[k])); }
async function _driveFolder(nazwa, parent) {
  const key = (parent || 'root') + '/' + nazwa; CFG.driveDirs = CFG.driveDirs || {};
  const znany = CFG.driveDirs[key];
  if (znany) { try { const f = await driveFetch('GET', `${DRIVE}/${znany}?fields=id,trashed`); if (!f.trashed) return f.id; } catch (e) { if (e.status !== 404) throw e; } }
  const q = encodeURIComponent(`name='${nazwa.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parent ? ` and '${parent}' in parents` : ''));
  const found = await driveFetch('GET', `${DRIVE}?q=${q}&fields=files(id)&spaces=drive`);
  const id = found.files && found.files[0] ? found.files[0].id
    : (await driveFetch('POST', `${DRIVE}?fields=id`, Object.assign({ name: nazwa, mimeType: 'application/vnd.google-apps.folder' }, parent ? { parents: [parent] } : {}))).id;
  CFG.driveDirs[key] = id; saveCfg(); return id;
}
const finNazwaPliku = (f, file) => {
  const ext = (String(file.name).match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
  const cz = [f.data, f.kontrahent || f.typ, has(f.kwota) ? nf2.format(num(f.kwota)) + ' ' + (f.waluta || 'PLN') : ''].filter(Boolean).join(' ');
  return (cz.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'potwierdzenie') + ext;
};
async function driveWyslij(file, nazwa, folderId, props) {
  const folder = folderId || await finFolder();
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(Object.assign({ name: nazwa, parents: [folder] }, props ? { appProperties: props } : {}))], { type: 'application/json' }));
  fd.append('file', file);
  return driveFetch('POST', `${DRIVE_UP}?uploadType=multipart&fields=id,name,webViewLink,mimeType`, fd);
}
async function driveDoKosza(id) { if (id) await driveFetch('PATCH', `${DRIVE}/${id}?fields=id`, { trashed: true }); }

/* wysłanie pliku dla zapisanego wpisu (po zamknięciu formularza) */

/* ---------- widok ---------- */
function vFinanse() {
  const L = finLista(), F = FILT.fin || (FILT.fin = { rok: '', typ: '', q: '', brak: false });
  const lata = [...new Set(L.map(f => String(f.data).slice(0, 4)).filter(Boolean))].sort().reverse();
  const q = String(F.q || '').toLowerCase();
  const rows = L.filter(f => (!F.rok || String(f.data).startsWith(F.rok)) && (!F.typ || f.typ === F.typ) && (!F.brak || !f.plikId)
    && (!q || [f.kontrahent, f.tytul, f.kategoria, f.bank, f.notatka, f.plik].some(v => String(v || '').toLowerCase().includes(q))))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  // sumy w podziale na waluty
  const sumy = (lst, wych) => { const m = {}; lst.filter(f => finWych(f.typ) === wych && f.typ !== 'Inne').forEach(f => { const w = f.waluta || 'PLN'; m[w] = (m[w] || 0) + num(f.kwota); });
    const e = Object.entries(m).sort((a, b) => a[0] === 'PLN' ? -1 : b[0] === 'PLN' ? 1 : 0); return e.length ? e.map(([w, v]) => money(v, w)).join('<br>') : '–'; };
  const brak = rows.filter(f => !f.plikId).length;
  const opt = (v, cur, lab) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(lab || v)}</option>`;
  const filtry = `<div class="row fin-f">
      <select onchange="FILT.fin.rok=this.value;render()">${opt('', F.rok, 'Wszystkie lata')}${lata.map(r => opt(r, F.rok)).join('')}</select>
      <select onchange="FILT.fin.typ=this.value;render()">${opt('', F.typ, 'Wszystkie rodzaje')}${FIN_TYPY.map(t => opt(t, F.typ)).join('')}</select>
      <input type="search" placeholder="Szukaj: odbiorca, tytuł, kategoria…" value="${esc(F.q || '')}" onchange="FILT.fin.q=this.value;render()">
      <label class="chk"><input type="checkbox" ${F.brak ? 'checked' : ''} onchange="FILT.fin.brak=this.checked;render()"> tylko bez pliku</label>
      <span class="sp" style="flex:1"></span>${skanBtn('finanse')}${CFG.finFolderId ? `<a class="btn ghost sm" href="https://drive.google.com/drive/folders/${esc(CFG.finFolderId)}" target="_blank" rel="noopener">📁 Folder w Google Drive</a>` : ''}</div>`;
  const plikCel = f => WYSYLANE.has(f.id) ? '<span class="mut">⏳ wysyłanie…</span>'
    : f.plikId ? `<a onclick="event.stopPropagation();finPodglad('${f.id}')" title="${esc(f.plik || '')}">📎 Podgląd</a>`
    : `<label class="fin-add" onclick="event.stopPropagation()">＋ dodaj plik<input type="file" accept="image/*,application/pdf" style="display:none" onchange="finPlikDoWpisu('${f.id}',this.files[0])"></label>`;
  const wpl = f => { const w = f.wplata && S.wplaty.find(x => x.id === f.wplata); return w ? `<div class="mut" style="font-size:11.5px">↧ wpłata: ${esc(w.konto)}</div>` : ''; };
  const tbl = table([
    { h: 'Data', f: f => esc(f.data) },
    { h: 'Rodzaj', f: f => `<span class="tag ${finWych(f.typ) ? 'sell' : f.typ === 'Inne' ? '' : 'buy'}">${esc(f.typ || '')}</span>` },
    { h: 'Odbiorca / nadawca', f: f => `<b>${esc(f.kontrahent || '–')}</b>${f.tytul ? `<div class="mut" style="font-size:12px">${esc(f.tytul)}</div>` : ''}${wpl(f)}` },
    { h: 'Kategoria', f: f => f.kategoria ? `<span class="tag">${esc(f.kategoria)}</span>` : '' },
    { h: 'Z konta', f: f => esc(f.bank || '') },
    { h: 'Kwota', n: 1, f: f => `<span class="${f.typ === 'Inne' ? '' : finWych(f.typ) ? 'neg' : 'pos'}">${f.typ === 'Inne' ? '' : finWych(f.typ) ? '−' : '+'}${money(num(f.kwota), f.waluta || 'PLN')}</span>` },
    { h: 'Potwierdzenie', f: plikCel },
  ], rows, { empty: L.length ? 'Brak przelewów dla wybranych filtrów' : 'Nie masz jeszcze żadnych potwierdzeń – dodaj pierwsze przyciskiem „＋ Potwierdzenie” albo upuść plik powyżej', click: f => `editFinanse('${f.id}')` });
  const info = !SYNC.token && !CFG.demo ? `<div class="alert info">Pliki potwierdzeń zapisują się na Twoim Google Drive. <a onclick="syncNow()"><b>Zaloguj się do Google</b></a>, żeby móc je dodawać i oglądać. Same dane przelewów możesz wpisywać także bez logowania.</div>`
    : SYNC.token && !SYNC.drive && !CFG.demo ? `<div class="alert">Aplikacja nie ma jeszcze zgody na zapis plików w Google Drive. Kliknij <a onclick="googleConnect(true)"><b>Zaloguj ponownie</b></a> i zaznacz dostęp do plików.</div>` : '';
  return ['Moje finanse', 'Potwierdzenia przelewów – dane w arkuszu, pliki na Twoim Google Drive', `${info}
    <div class="kpis">${kpi('Przelewów', rows.length, F.rok ? 'w ' + F.rok : 'łącznie', 'main')}${kpi('Wychodzące', sumy(rows, true))}${kpi('Przychodzące', sumy(rows, false))}${kpi('Bez pliku', brak, brak ? '<a onclick="FILT.fin.brak=true;render()">pokaż</a>' : 'wszystko ma potwierdzenie')}</div>
    <label class="dropzone" ondragover="event.preventDefault();this.classList.add('on')" ondragleave="this.classList.remove('on')" ondrop="event.preventDefault();this.classList.remove('on');plikiDodaj('finanse',event.dataTransfer.files)">
      <input type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="plikiDodaj('finanse',this.files);this.value=''">
      <b>🧾 Upuść tutaj potwierdzenie przelewu</b><span class="mut">PDF lub zdjęcie z telefonu – albo kliknij, aby wybrać plik (można kilka naraz)</span></label>
    <div class="card" style="margin-top:16px"><h3>Przelewy <small>${rows.length} poz.</small></h3>${filtry}${tbl}</div>`,
    `<button class="btn" onclick="editFinanse()">＋ Potwierdzenie</button>`];
}

/* ---------- formularz ---------- */
function editFinanse(id, plikStart) {
  const L = finLista();
  const f = L.find(x => x.id === id) || { data: todayStr(), typ: 'Przelew wychodzący', waluta: 'PLN', bank: (L[L.length - 1] || {}).bank || '' };
  let plik = plikStart || null;
  const wplOpc = [['', '– brak –'], ['__new', '＋ utwórz nową wpłatę/wypłatę z tych danych'],
    ...S.wplaty.slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).map(w => [w.id, `${w.data} · ${w.konto} · ${nf2.format(num(w.kwotaPLN))} zł`])];
  const form = modal(id ? 'Edytuj potwierdzenie' : 'Nowe potwierdzenie przelewu', [
    { k: 'data', l: 'Data przelewu', t: 'date' }, { k: 'typ', l: 'Rodzaj', t: 'select', o: FIN_TYPY },
    { k: 'kwota', l: 'Kwota', t: 'number' }, { k: 'waluta', l: 'Waluta', t: 'select', o: FIN_WAL },
    { k: 'kontrahent', l: 'Odbiorca / nadawca', ph: 'np. XTB S.A., Urząd Skarbowy' }, { k: 'kategoria', l: 'Kategoria', ph: 'np. Inwestycje, Podatki, Mieszkanie' },
    { k: 'tytul', l: 'Tytuł przelewu', full: 1 },
    { k: 'bank', l: 'Z konta / bank', ph: 'np. mBank osobiste' },
    { k: 'wplata', l: 'Powiązana wpłata (Wpłaty i wypłaty)', t: 'select', o: wplOpc },
    { k: 'kontoInw', l: 'Konto inwestycyjne dla nowej wpłaty', t: 'select', o: S.konta.map(k => k.nazwa) },
    { k: 'notatka', l: 'Notatka', full: 1 },
  ], f, o => {
    if (!o.data || !(o.kwota > 0)) return 'Uzupełnij datę i kwotę (dodatnią – kierunek wynika z rodzaju)';
    if (!finInw(o.typ) && o.wplata === '__new') o.wplata = '';
    if (o.wplata === '__new') {
      const znak = o.typ === 'Wypłata z konta inwestycyjnego' ? -1 : 1, pln = o.waluta === 'PLN';
      const kurs = pln ? 1 : (C && C.rateNow(o.waluta)) || 0;
      if (!pln && !kurs) return 'Nie znam kursu ' + o.waluta + ' – utwórz wpłatę ręcznie w „Wpłaty i wypłaty”';
      const w = { id: uid(), data: o.data, konto: o.kontoInw, kwotaPLN: r2(znak * o.kwota * kurs), kwotaWal: pln ? '' : znak * o.kwota,
        notatka: ['Przelew', o.kontrahent, o.tytul].filter(Boolean).join(' · ') + (pln ? '' : ` (przeliczone po kursie ${kurs})`) };
      S.wplaty.push(w); changed('wplaty'); o.wplata = w.id;
    }
    delete o.kontoInw;
    let rec = f;
    if (id) Object.assign(f, o); else { rec = { id: uid(), ...o }; L.push(rec); }
    changed('finanse'); toast('Zapisano przelew');
    if (plik) dolaczPlik('finanse', rec.id, plik);
  }, id ? () => {
    S.finanse = L.filter(x => x.id !== id); changed('finanse');
    if (f.plikId) { if (SYNC.token && SYNC.drive) driveDoKosza(f.plikId).then(() => toast('Plik przeniesiony do kosza Google Drive')).catch(() => toast('Wpis usunięty – plik został na Google Drive'));
      else toast('Wpis usunięty – plik został na Google Drive (zaloguj się, by usuwać też pliki)'); }
  } : null);
  // lista podpowiedzi kategorii i banków
  const dl = (name, vals) => { const el = form.elements[name], idl = 'dl_' + name; el.setAttribute('list', idl);
    form.insertAdjacentHTML('beforeend', `<datalist id="${idl}">${[...new Set(vals.filter(Boolean))].map(v => `<option value="${esc(v)}">`).join('')}</datalist>`); };
  dl('kategoria', ['Inwestycje', 'Podatki', ...L.map(x => x.kategoria)]); dl('bank', L.map(x => x.bank)); dl('kontrahent', L.map(x => x.kontrahent));
  // pole pliku
  const zone = document.createElement('label'); zone.className = 'full fin-plik';
  const opis = () => plik ? `📎 <b>${esc(plik.name)}</b> <span class="mut">(${nf0.format(plik.size / 1024)} kB – wyśle się po zapisaniu)</span>`
    : f.plikId ? `📎 <b>${esc(f.plik || 'plik')}</b> <span class="mut">– kliknij, aby podmienić</span>` : '<b>＋ Dołącz potwierdzenie</b> <span class="mut">PDF lub zdjęcie (możesz też upuścić plik tutaj)</span>';
  zone.innerHTML = `Plik potwierdzenia<div class="dropzone sm"><span class="fin-opis">${opis()}</span></div><input type="file" accept="image/*,application/pdf" style="display:none">`;
  form.appendChild(zone);
  const ustaw = file => { if (!file) return; if (file.size > 25 * 1024 * 1024) return toast('Plik jest za duży (maks. 25 MB)'); plik = file; zone.querySelector('.fin-opis').innerHTML = opis(); };
  zone.querySelector('input').onchange = e => ustaw(e.target.files[0]);
  const dz = zone.querySelector('.dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('on'); }); dz.addEventListener('dragleave', () => dz.classList.remove('on'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('on'); ustaw(e.dataTransfer.files[0]); });
  // linki poza <label>, żeby kliknięcie nie otwierało okna wyboru pliku
  const pod = [f.plikId ? `<a onclick="finPodglad('${f.id}')">Podgląd</a> · <a href="${esc(f.plikUrl)}" target="_blank" rel="noopener">Otwórz w Google Drive</a>` : '',
    !CFG.demo && (!SYNC.token || !SYNC.drive) ? '<span style="color:#b45309">Aby dołączyć plik, najpierw zaloguj się do Google (plakietka u góry).</span>' : ''].filter(Boolean).join('<br>');
  if (pod) zone.insertAdjacentHTML('afterend', `<div class="full help" style="font-size:11.5px;margin-top:-6px">${pod}</div>`);
  if (plikStart) ustaw(plikStart);
  // pola wpłaty tylko dla wpłat/wypłat na konto inwestycyjne
  const pokaz = () => { const inw = finInw(form.elements.typ.value);
    form.elements.wplata.closest('label').style.display = inw ? '' : 'none';
    form.elements.kontoInw.closest('label').style.display = inw && form.elements.wplata.value === '__new' ? '' : 'none'; };
  form.elements.typ.addEventListener('change', pokaz); form.elements.wplata.addEventListener('change', pokaz); pokaz();
  // sprawdzenie logowania dopiero przy zapisie z plikiem
  const save = form.closest('.modal').querySelector('[data-a=save]'), orig = save.onclick;
  save.onclick = () => { if (plik && !driveGotowy()) { if (!confirm('Nie można teraz wysłać pliku na Google Drive.\n\nZapisać sam wpis bez pliku? (plik dodasz później w tabeli)')) return; plik = null; } orig(); };
}
function finPlikDoWpisu(id, file) {
  const f = finLista().find(x => x.id === id); if (!f || !file) return;
  if (file.size > 25 * 1024 * 1024) return toast('Plik jest za duży (maks. 25 MB)');
  if (!driveGotowy()) return;
  dolaczPlik('finanse', f.id, file);
}

/* ---------- podgląd ---------- */
function finPodglad(id) { const f = finLista().find(x => x.id === id); if (f) podgladPliku(f, f.kontrahent || f.typ, `${esc(f.data)} · ${money(num(f.kwota), f.waluta || 'PLN')}`); }
async function podgladPliku(f, tytul, podtytul) {
  if (!f || !f.plikId) return;
  if (!SYNC.token || Date.now() > SYNC.exp || !SYNC.drive) { window.open(f.plikUrl, '_blank', 'noopener'); return; }
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal fin-podglad"><h2>${esc(tytul)} <small class="mut">${podtytul || ''}</small></h2>
    <div class="fin-view"><div class="empty">Wczytywanie…</div></div>
    <div class="actions"><a class="btn ghost" href="${esc(f.plikUrl)}" target="_blank" rel="noopener">Otwórz w Google Drive</a><a class="btn ghost" data-a="dl" style="display:none">⬇ Pobierz</a><span class="sp"></span><button class="btn" data-a="close">Zamknij</button></div></div>`;
  document.body.appendChild(bg);
  let url = '';
  const close = () => { bg.remove(); if (url) URL.revokeObjectURL(url); };
  bg.addEventListener('click', e => { if (e.target === bg) close(); }); bg.querySelector('[data-a=close]').onclick = close;
  try {
    const blob = await driveFetch('GET', `${DRIVE}/${f.plikId}?alt=media`, null, true);
    url = URL.createObjectURL(blob);
    const t = blob.type || f.plikTyp || '', box = bg.querySelector('.fin-view');
    box.innerHTML = t.startsWith('image/') ? `<img src="${url}" alt="">` : t === 'application/pdf' ? `<iframe src="${url}"></iframe>` : `<div class="empty">Podgląd niedostępny dla tego typu pliku – użyj „Pobierz”.</div>`;
    const a = bg.querySelector('[data-a=dl]'); a.href = url; a.download = f.plik || 'potwierdzenie'; a.style.display = '';
  } catch (e) {
    bg.querySelector('.fin-view').innerHTML = `<div class="empty">Nie udało się wczytać pliku (${esc(e.message)}).<br>Spróbuj „Otwórz w Google Drive”.</div>`;
  }
}
