# Mój portfel

Aplikacja do monitorowania portfela inwestycyjnego (kokpit, strategie, PIT-38, inflacja) z zapisem danych w Google Sheets.
Kod jest publiczny, dane nie – trafiają wyłącznie do arkusza Google właściciela i do jego przeglądarki.

Pliki: `index.html` – gotowa aplikacja; `src/` – źródła; `build.py` – składa `src/` w `index.html`.


Aplikacja to jeden plik `index.html`. Nie potrzebuje serwera ani bazy danych. Dane trzymasz w swoim arkuszu Google, a kopia zostaje w przeglądarce.

---

## Krok 1. Strona na GitHub Pages (ok. 5 minut)

1. Zaloguj się na github.com i kliknij **New repository**.
   - Nazwa: `plukagri`
   - Widoczność: **Public** (darmowe GitHub Pages tego wymaga, a w repozytorium jest tylko kod, bez Twoich danych)
   - Kliknij **Create repository**.
2. Plik `index.html` jest już w tym repozytorium.
3. Wejdź w **Settings → Pages**. W polu *Source* wybierz **Deploy from a branch**, branch **main**, folder **/(root)**, potem **Save**.
4. Po ok. minucie strona działa pod adresem: `https://lukmalek1994.github.io/plukagri/`

> ⚠️ Nigdy nie wrzucaj do repozytorium plików z eksportu (`portfel-….json`, `transakcje-….csv`). Wtedy Twoje dane byłyby publiczne.

Aplikacja działa od razu, ale dane zapisują się wtedy tylko w przeglądarce. Żeby trafiały też do arkusza Google, wykonaj krok 2.

---

## Krok 2. Połączenie z Google Sheets (ok. 15 minut, jednorazowo)

Robisz to raz. Dzięki temu aplikacja może zapisywać dane w **Twoim** arkuszu po zalogowaniu **Twoim** kontem Google.

1. Wejdź na **console.cloud.google.com** i zaloguj się swoim kontem Google.
2. Na górze kliknij wybór projektu, potem **Nowy projekt**. Nazwa: `Portfel`. Kliknij **Utwórz** i wybierz ten projekt.
3. Włącz Google Sheets API: w menu **Interfejsy API i usługi → Biblioteka** wyszukaj **Google Sheets API** i kliknij **Włącz**.
4. Ustaw ekran zgody: **Interfejsy API i usługi → Ekran zgody OAuth** (lub *Google Auth Platform*).
   - Nazwa aplikacji: `Mój portfel`. Jako e-mail podaj swój adres.
   - Odbiorcy: **Zewnętrzni**.
   - W sekcji **Użytkownicy testowi** dodaj swój adres Gmail.
   - Zostaw aplikację w trybie **Testowanie**. Nie publikuj jej. Tylko użytkownicy testowi, czyli Ty, mogą się zalogować.
5. Utwórz identyfikator: **Interfejsy API i usługi → Dane logowania → Utwórz dane logowania → Identyfikator klienta OAuth**.
   - Typ aplikacji: **Aplikacja internetowa**
   - **Autoryzowane źródła JavaScript:** dodaj `https://lukmalek1994.github.io` (bez `/plukagri` i bez ukośnika na końcu)
   - Kliknij **Utwórz** i skopiuj **Identyfikator klienta**. Wygląda tak: `123456789-abc…apps.googleusercontent.com`.
6. Otwórz swoją aplikację i wejdź w **Ustawienia i Google**.
   - **Client ID:** wklej identyfikator z punktu 5.
   - **ID arkusza:** wklej ID swojego arkusza (z adresu między `/d/` a `/edit`) albo zostaw puste – aplikacja założy nowy arkusz.
   - Kliknij **Zaloguj przez Google**.
7. Google pokaże ostrzeżenie „Aplikacja nie została zweryfikowana”. To normalne, bo to Twoja prywatna aplikacja. Kliknij **Zaawansowane → Otwórz Mój portfel (niebezpieczne)** i zezwól na dostęp do arkuszy.
8. Aplikacja sama doda w arkuszu zakładki (Transakcje, Dywidendy, Wpłaty, Strategie…) i od tej chwili zapisuje do niego każdą zmianę.

**Drugie urządzenie (np. telefon):** otwórz ten sam adres. W Ustawieniach wklej ten sam Client ID oraz **ID arkusza**, czyli fragment adresu arkusza między `/d/` a `/edit`. Potem zaloguj się.

---

---

## Ceny złota, srebra i krypto (Yahoo Finance)

Google Finance słabo radzi sobie z kruszcami, dlatego dla złota, srebra i BTC aplikacja używa Yahoo Finance przez mały skrypt w arkuszu:

1. Otwórz arkusz z danymi i wybierz **Rozszerzenia → Apps Script**.
2. Usuń przykładowy kod, wklej zawartość pliku `Portfel_Ceny.gs` z tego repozytorium i kliknij **Zapisz**.
3. W aplikacji, w zakładce **Instrumenty i ceny**, wpisz symbol z przedrostkiem `YAHOO:`, np. `YAHOO:GC=F` (złoto), `YAHOO:SI=F` (srebro), `YAHOO:BTC-USD`. Dla złota, srebra i BTC te symbole są już ustawione domyślnie.

Ceny odświeżają się raz dziennie, przy pierwszym otwarciu aplikacji. Inne instrumenty mogą dalej korzystać z Google Finance (np. `LON:CSPX`, `WSE:PKN`) albo również z Yahoo (`YAHOO:CSPX.L`, `YAHOO:PKN.WA`).

**Wyszukiwanie symboli:** w „Instrumenty i ceny → ＋ Instrument” wpisz nazwę lub ticker (np. `cspx`, `orlen`, `złoto`) i kliknij **Szukaj**. Aplikacja zapyta Yahoo Finance przez Twój arkusz (funkcja `YAHOO_SZUKAJ` ze skryptu, wyniki w zakładce „Szukaj”). Kliknięcie wyniku uzupełnia ticker, nazwę, klasę, walutę i symbol. Gdy nic się nie znajdzie, wpisz dane ręcznie.

## Jak to działa na co dzień

- **Zapis:** każda zmiana w aplikacji trafia do arkusza w ciągu 1–2 sekund. Stan widać w plakietce u góry („Zapisano w Google Sheets ✓”).
- **Logowanie w każdej sesji:** po otwarciu aplikacji kliknij raz plakietkę, żeby się zalogować. Google ze względów bezpieczeństwa nie pozwala logować się bez kliknięcia. Bez logowania zmiany czekają w przeglądarce i wyślą się po zalogowaniu.
- **Edycja w arkuszu:** zmiany wpisane bezpośrednio w arkuszu aplikacja wczyta po kliknięciu „Synchronizuj teraz”.
- **Ceny:** arkusz liczy je sam funkcją GOOGLEFINANCE na podstawie symbolu z „Instrumenty i ceny” (np. `LON:CSPX`, `NASDAQ:AAPL`, `WSE:PKN`, `CURRENCY:XAUUSD`). Gdy symbol nie działa, wpisz cenę ręcznie.
- **Kursy walut:** pobierają się z NBP przy otwarciu aplikacji. Kurs NBP z dnia poprzedzającego transakcję (do PIT-38) uzupełnia się sam w formularzu.
- **Historia wartości:** aplikacja zapisuje wartość portfela raz dziennie, przy pierwszym otwarciu danego dnia.
- **Inflacja:** pobiera się automatycznie raz dziennie (Polska: Eurostat HICP, USA: BLS CPI-U, z bazy FRED). Na jej podstawie kokpit pokazuje zysk realny.
- **Konta:** każde konto ma w menu własną stronę (pozycje, strategie, gotówka, wpłaty). Nowe dodajesz przez „＋ Dodaj konto”, usuwasz w „Edytuj / usuń konto”.
- **Zakładka „Podsumowanie” w arkuszu:** aplikacja buduje ją sama (kafelki, strategie, konta, instrumenty z alokacją 2.1, wykresy). Liczy się formułami z danych arkusza, więc działa także bez aplikacji. Przebudowuje się po dodaniu nowej strategii, konta lub instrumentu; ręcznie: Ustawienia → „Odśwież Podsumowanie w arkuszu”.
- **Kopia zapasowa:** dane są w arkuszu Google (z historią wersji: *Plik → Historia wersji*), w przeglądarce, a dodatkowo możesz je zapisać przyciskiem *Eksport* w Ustawieniach.

## Bezpieczeństwo

- W kodzie na GitHubie nie ma żadnych haseł ani kluczy. Client ID jest publicznym identyfikatorem i sam niczego nie otwiera.
- Do arkusza ma dostęp tylko osoba zalogowana na Twoje konto Google. Aplikacja jest w trybie testowym, więc zalogować się możesz wyłącznie Ty. Ktoś z linkiem do strony zobaczy pustą aplikację.
- Zalecane: włącz weryfikację dwuetapową na koncie Google.
