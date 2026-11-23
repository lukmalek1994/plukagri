/* ===================== PLIKI NA GOOGLE DRIVE – wspólne dla: potwierdzeń przelewów, dokumentów PIT, paragonów =====================
   - wysyłka po kolei (kolejka), żeby równoległe wysyłki nie tworzyły podwójnych folderów
   - po wysłaniu wpis odszukiwany po ID (synchronizacja mogła w międzyczasie podmienić tabelę)
   - każdy plik dostaje w Drive appProperties {portfelTab, portfelId} – po nich „Sprawdź pliki” odnajduje zgubione powiązania */
const WYSYLANE = new Set();
let KOLEJKA_PLIKOW = Promise.resolve();
function plikMod(tab) {
  return {
    finanse: { lista: finLista, tytul: 'potwierdzeń przelewów', folder: () => finFolder(), foldery: [FIN_FOLDER], podfoldery: false, nazwa: finNazwaPliku, ok: 'Potwierdzenie zapisane w Google Drive ✓',
      opis: f => [f.data, f.kontrahent || f.typ, has(f.kwota) ? money(num(f.kwota), f.waluta || 'PLN') : ''].filter(Boolean).join(' · '),
      nowy: file => ({ id: uid(), data: todayStr(), typ: 'Przelew wychodzący', waluta: 'PLN', kwota: '', notatka: 'do uzupełnienia – ' + file.name }) },
    dokumenty: { lista: pitLista, tytul: 'dokumentów PIT', folder: async d => driveFolder(String(d.rok), await driveFolder(PIT_FOLDER)), foldery: [PIT_FOLDER], podfoldery: true, nazwa: pitNazwaPliku, ok: 'Dokument zapisany w Google Drive ✓',
      opis: d => [d.rok, pitKrotko(d.rodzaj), d.konto || d.wystawca].filter(Boolean).join(' · '),
      nowy: file => { const n = file.name.toUpperCase(), y = n.match(/20\d\d/); const hit = /UPO/.test(n) ? 2 : /8C/.test(n) ? 0 : /PIT.?38/.test(n) ? 1 : /PIT.?37/.test(n) ? 4 : /PIT.?11/.test(n) ? 6 : /ZG/.test(n) ? 7 : 11;
        return { id: uid(), rok: y ? y[0] : pitRokDomyslny(), rodzaj: PIT_RODZAJE[hit], data: todayStr(), notatka: 'do uzupełnienia – ' + file.name }; } },
    paragony: { lista: parLista, tytul: 'paragonów', folder: async p => driveFolder(String(p.data || todayStr()).slice(0, 4), await driveFolder(PAR_FOLDER)), foldery: [PAR_FOLDER], podfoldery: true, nazwa: parNazwaPliku, ok: 'Paragon zapisany w Google Drive ✓',
      opis: p => [p.data, parKier(p), p.metal, p.produkt].filter(Boolean).join(' · '),
      nowy: file => ({ id: uid(), data: todayStr(), kierunek: (FILT.par && FILT.par.kier) || 'Zakup', metal: 'Srebro', waluta: 'PLN', dokument: 'Paragon', notatka: 'do uzupełnienia – ' + file.name }) },
  }[tab];
}
const ustawPlik = (rec, r, typ) => Object.assign(rec, { plik: r.name, plikId: r.id, plikUrl: r.webViewLink || `https://drive.google.com/file/d/${r.id}/view`, plikTyp: r.mimeType || typ || '' });

function dolaczPlik(tab, id, file) {
  WYSYLANE.add(id); render();
  KOLEJKA_PLIKOW = KOLEJKA_PLIKOW.then(() => _dolaczPlik(tab, id, file)).catch(() => {});
  return KOLEJKA_PLIKOW;
}
async function _dolaczPlik(tab, id, file) {
  const M = plikMod(tab);
  try {
    let rec = M.lista().find(x => x.id === id); if (!rec) return;
    const r = await driveWyslij(file, M.nazwa(rec, file), await M.folder(rec), { portfelTab: tab, portfelId: id });
    rec = M.lista().find(x => x.id === id);
    if (!rec) { driveDoKosza(r.id).catch(() => {}); return; }   // wpis usunięty w trakcie wysyłania
    const stary = rec.plikId;
    ustawPlik(rec, r, file.type); changed(tab); toast(M.ok);
    if (stary && stary !== r.id) driveDoKosza(stary).catch(() => {});
  } catch (e) { toast('Nie udało się wysłać pliku: ' + e.message); }
  finally { WYSYLANE.delete(id); render(); }
}

/* kilka plików naraz: 1 plik -> formularz; więcej -> osobny wpis dla każdego (do uzupełnienia) */
function plikiDodaj(tab, files) {
  files = [...(files || [])].filter(f => f && f.size); if (!files.length) return;
  const edit = { finanse: editFinanse, dokumenty: editDokument, paragony: editParagon }[tab];
  if (files.length === 1) return edit(null, files[0]);
  const zaDuze = files.filter(f => f.size > 25 * 1024 * 1024); files = files.filter(f => f.size <= 25 * 1024 * 1024);
  if (zaDuze.length) toast(`Pominięto za duże pliki (maks. 25 MB): ${zaDuze.map(f => f.name).join(', ')}`);
  if (!files.length || !driveGotowy()) return;
  if (!confirm(`Dodać ${files.length} plików jako ${files.length} osobne wpisy?\n\nKażdy wpis dostanie notatkę „do uzupełnienia” – kwotę i resztę danych wpiszesz potem, klikając wiersz.`)) return;
  const M = plikMod(tab);
  files.forEach(file => { const rec = M.nowy(file); M.lista().push(rec); dolaczPlik(tab, rec.id, file); });
  changed(tab); render(); toast(`Dodano ${files.length} wpisy – pliki wysyłają się po kolei`);
}

/* ---------- „Sprawdź pliki na Drive”: odnajduje pliki bez wpisu i wpisy ze zgubionym plikiem ---------- */
const skanBtn = tab => CFG.demo ? '' : `<button class="btn ghost sm" onclick="skanujPliki('${tab}')" title="Porównuje pliki w Twoim Google Drive z wpisami w aplikacji i naprawia zgubione powiązania">🔍 Sprawdź pliki na Drive</button>`;
async function driveLista(q) {
  const out = []; let page = '';
  do {
    const r = await driveFetch('GET', `${DRIVE}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,webViewLink,mimeType,appProperties,createdTime,parents)&pageSize=1000&spaces=drive${page ? '&pageToken=' + page : ''}`);
    out.push(...(r.files || [])); page = r.nextPageToken || '';
  } while (page);
  return out;
}
async function skanujPliki(tab) {
  if (!driveGotowy()) return;
  const M = plikMod(tab), L = M.lista();
  toast('Sprawdzam pliki na Google Drive…');
  let pliki = [];
  try {
    const FOLDER = "mimeType='application/vnd.google-apps.folder'";
    // wszystkie foldery o tej nazwie (wcześniej mogło powstać kilka) + ich podfoldery lat
    let foldery = [];
    for (const n of M.foldery) foldery.push(...await driveLista(`name='${n}' and ${FOLDER} and trashed=false`));
    if (M.podfoldery && foldery.length) foldery.push(...await driveLista(`(${foldery.map(f => `'${f.id}' in parents`).join(' or ')}) and ${FOLDER} and trashed=false`));
    if (foldery.length) pliki = await driveLista(`(${foldery.map(f => `'${f.id}' in parents`).join(' or ')}) and not ${FOLDER} and trashed=false`);
    // pliki tej sekcji, które trafiły gdzie indziej (rozpoznane po appProperties)
    const znane = new Set(pliki.map(p => p.id));
    (await driveLista(`appProperties has { key='portfelTab' and value='${tab}' } and trashed=false`)).forEach(p => { if (!znane.has(p.id)) pliki.push(p); });
  } catch (e) { return toast('Nie udało się sprawdzić plików: ' + e.message); }

  const naDrive = new Map(pliki.map(p => [p.id, p]));
  const uzyte = new Set([...finLista(), ...pitLista(), ...parLista()].map(x => x.plikId).filter(Boolean));
  let naprawione = 0;
  // 1) wpisy wskazujące na plik, którego już nie ma (usunięty / w koszu) -> czyścimy powiązanie
  const zgubione = L.filter(x => x.plikId && !naDrive.has(x.plikId) && !WYSYLANE.has(x.id));
  // 2) pliki bez wpisu: najpierw dopasowanie po ID wpisu zapisanym przy wysyłce
  let sieroty = pliki.filter(p => !uzyte.has(p.id));
  sieroty = sieroty.filter(p => {
    const rec = p.appProperties && p.appProperties.portfelTab === tab && L.find(x => x.id === p.appProperties.portfelId);
    if (rec && (!rec.plikId || !naDrive.has(rec.plikId))) { ustawPlik(rec, p); naprawione++; return false; }
    return true;
  });
  if (naprawione) changed(tab);
  render();
  if (!zgubione.filter(x => !naDrive.has(x.plikId)).length && !sieroty.length) {
    return toast(naprawione ? `Naprawiono ${naprawione} powiązań – wszystko się zgadza ✓` : `Wszystko się zgadza ✓ (${pliki.length} plików na Drive)`);
  }
  pokazSkan(tab, sieroty, zgubione.filter(x => !uzyte.has(x.plikId) || !naDrive.has(x.plikId)), naprawione, pliki.length);
}
function pokazSkan(tab, sieroty, zgubione, naprawione, ile) {
  const M = plikMod(tab), L = M.lista();
  const bezPliku = () => L.filter(x => !x.plikId || zgubione.includes(x));
  const opcje = bezPliku().map(x => [x.id, M.opis(x)]);
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" style="width:min(760px,96vw)"><h2>Pliki ${esc(M.tytul)} na Google Drive</h2>
    <p class="mut" style="margin-top:0;font-size:13px">Na Drive jest ${ile} plików.${naprawione ? ` Automatycznie naprawiono ${naprawione} powiązań.` : ''}</p>
    ${sieroty.length ? `<h3 style="font-size:14px;margin:12px 0 6px">Pliki bez wpisu w aplikacji (${sieroty.length})</h3>
      <div class="skan">${sieroty.map(p => `<div class="skan-it"><a href="${esc(p.webViewLink || '#')}" target="_blank" rel="noopener">📎 ${esc(p.name)}</a>
        <span class="mut" style="font-size:11.5px">${esc(String(p.createdTime || '').slice(0, 10))}</span>
        <select data-f="${esc(p.id)}"><option value="__new">＋ utwórz nowy wpis</option>${opcje.map(([v, l]) => `<option value="${esc(v)}">przypisz do: ${esc(l)}</option>`).join('')}<option value="">pomiń</option></select></div>`).join('')}</div>` : ''}
    ${zgubione.length ? `<h3 style="font-size:14px;margin:14px 0 6px">Wpisy, których pliku nie ma już na Drive (${zgubione.length})</h3>
      <div class="mut" style="font-size:12.5px">${zgubione.map(x => '• ' + esc(M.opis(x)) + ' – ' + esc(x.plik || '')).join('<br>')}</div>
      <label class="chk" style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:13px"><input type="checkbox" data-a="czysc" checked> usuń w tych wpisach martwy link (plik możesz potem dodać ponownie)</label>` : ''}
    <div class="actions"><span class="sp"></span><button class="btn ghost" data-a="cancel">Anuluj</button><button class="btn" data-a="ok">Zastosuj</button></div></div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg) close(); }); bg.querySelector('[data-a=cancel]').onclick = close;
  bg.querySelector('[data-a=ok]').onclick = () => {
    let n = 0, uzyteWpisy = new Set();
    const cz = bg.querySelector('[data-a=czysc]');
    if (cz && cz.checked) zgubione.forEach(x => { ['plik', 'plikId', 'plikUrl', 'plikTyp'].forEach(k => x[k] = ''); n++; });
    bg.querySelectorAll('select[data-f]').forEach(sel => {
      const p = sieroty.find(s => s.id === sel.dataset.f), v = sel.value; if (!p || !v) return;
      let rec;
      if (v === '__new') { rec = M.nowy({ name: p.name }); L.push(rec); }
      else { if (uzyteWpisy.has(v)) return; rec = L.find(x => x.id === v); }
      if (!rec) return; uzyteWpisy.add(rec.id); ustawPlik(rec, p); n++;
      driveFetch('PATCH', `${DRIVE}/${p.id}?fields=id`, { appProperties: { portfelTab: tab, portfelId: rec.id } }).catch(() => {});
    });
    close(); if (n) { changed(tab); render(); toast(`Zapisano ${n} zmian`); }
  };
}
