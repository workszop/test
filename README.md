# Planer budżetu marketingowego

Statyczna aplikacja webowa (HTML/CSS/JS, bez frameworków i bez builda) do planowania rocznego budżetu marketingowego. Dla każdej kategorii podajesz udział procentowy (lub kwotę) i oczekiwany ROI, a aplikacja liczy zwrot netto, wartość brutto i ROI portfela.

## Uruchomienie

Wystarczy otworzyć `index.html` w przeglądarce. Eksport XLSX wymaga połączenia z internetem (biblioteka SheetJS ładowana z CDN).

## Struktura

```
index.html        widoki: lista planów i edytor
css/styles.css    style (jasny i ciemny motyw, responsywność)
js/calc.js        czysta logika obliczeń i walidacji (bez DOM)
js/storage.js     zapis w localStorage
js/app.js         interfejs i eksport
tests/            testy logiki (node:test)
```

## Testy

```
node --test tests/calc.test.js
```

Testy obejmują przykłady akceptacyjne z PRD (AC-01 do AC-04, AC-06).

## Wzory

- Kwota kategorii: `Kwota_k = Budżet × Procent_k / 100`
- Zwrot netto: `Zwrot_k = Kwota_k × ROI_k`
- Wartość brutto: `Wartość_k = Kwota_k × (1 + ROI_k)`
- ROI portfela (ważony budżetem): `Σ Zwrot_k / Σ Kwota_k × 100%`
- Rezerwa: `Budżet − Σ Kwota_k` (nie wlicza się do ROI portfela)

## Zakres i ograniczenia (wersja 1.0)

- Dane są zapisywane w przeglądarce (localStorage), a nie na serwerze. Plany nie synchronizują się między urządzeniami.
- Brak logowania i kont użytkowników (PRD: wersja z logowaniem wymaga backendu).
- Scenariusze są wyliczane z globalnego mnożnika ROI (−30% / 0% / +30%). Nie są zapisywane osobno w planie. Dla ROI ujemnego scenariusz optymistyczny także poprawia wynik (mnożnik działa na wartość bezwzględną).
- Eksport CSV używa separatora `;` i kropki jako separatora dziesiętnego, żeby poprawnie otwierał się w polskim Excelu.
- Eksport XLSX zawiera arkusze „Plan” (z formułami) i „Podsumowanie” (z odwołaniami do „Plan”). Wykresów w pliku XLSX nie ma.
- Eksport PDF, widok tylko do odczytu na mobile i wersja angielska nie są w tej wersji.
- ROI jest szacunkowy i podawany ręcznie. Aplikacja nie pobiera danych zewnętrznych.
