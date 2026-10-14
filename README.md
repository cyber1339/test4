# REPQUEST — Train. Fight. Evolve.

Calisthenics pentru masă musculară, cu progresie lentă, validare prin cameră (MediaPipe Pose) și alergare cu GPS. PWA: React + TypeScript + Vite + Tailwind. Totul rulează pe telefon; nu se trimite video nicăieri. Progresul se salvează local.

## Rulare
```bash
npm install     # descarcă și modelul AI local
npm test
npm run dev     # HTTPS (certificat auto-semnat), accesibil de pe telefon la https://<IP-PC>:5173
```
Fără programare: încarcă folderul pe GitHub și publică-l pe Vercel (vezi conversația). Camera și GPS cer HTTPS.

## Ce conține
- Exerciții validate prin cameră: flotări (înclinate, standard, diamant), tracțiuni, genoflexiuni, abdomene, dips, plus menținere cronometrată: plank, atârnare, L-sit.
- Marcate beta (validare aproximativă): pike push-up, piept-la-bară, pistol squat, L-sit.
- Progresie dublă: repetări crescătoare în interval, apoi treapta următoare după două sesiuni curate. Sesiuni A/B alternante, pauze între seturi, zile ușoare și de recuperare.
- Abilități avansate (muscle-up, front lever, handstand push-up, planche): se deblochează doar din recorduri validate prin cameră. Camera nu le poate valida; jurnalul lor nu dă XP.
- Alergare: GPS cu filtrare (precizie, salturi), distanță, timp, ritm mediu și curent, ritm pe km, calorii (MET după viteză, estimare), adăugare manuală pentru bandă.
- Avatar: forma de bază din înălțimea și greutatea ta, dezvoltarea musculară din progres (nu scade).

## Structură
`src/core` logică pură testată (repCounter, holdTracker, framing, program, progression, plan, run, body, storage) · `src/ai` cameră și pose · `src/screens`, `src/components` UI · `src/i18n` texte (RO complet, EN parțial).

## Praguri de calibrat pe oameni reali
`DEFAULT_TUNING` (repCounter.ts), tuning-urile pe pași (program.ts), verificările de menținere (holdTracker.ts). Sunt valori rezonabile, nevalidate pe un set de date real.
