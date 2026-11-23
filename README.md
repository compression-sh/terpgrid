# THC-Rechner – Edibles, Cannabutter & Wirkung

Responsive Web-App (Dark Mode) zur **Abschätzung** von THC-Mengen bei Edibles, Cannabutter und Joints – mit Unsicherheitsbereichen, Zeitachsen, Referenzbereichen und Quellen.
Alle Berechnungen laufen **ausschließlich lokal im Browser**. Es gibt keinen Server, kein Tracking und keine Cookies. Der Produktions-Build setzt eine CSP mit `connect-src 'none'`.

> Ein Informationswerkzeug zur Schadensminimierung, keine medizinische Beratung und keine Dosierungsempfehlung.

## Funktionen

| Bereich | Inhalt |
| --- | --- |
| **Edibles** | Cannabis-Menge, Gesamt-THC oder THC + THCA getrennt (Faktor 0,877), Butter/Öl, Abseihverlust, Decarboxylierungs- und Extraktionsausbeute, Rezept (pro Rezept oder pro Portion), Portionen. Ergebnisse: theoretisches THC, THC nach Decarb, THC im Fett, mg/g, Rezept, Portion – jeweils mit Bereich. Dazu Verlustdarstellung, Dosiskurve und Umkehrrechner |
| **Joint** | Theoretischer Gehalt, konsumierter Anteil, Teilen, grobe Spanne der systemischen Aufnahme je Profil (10–35 %, Extreme 2–56 %), Verluste, Wirkeintritt |
| **Dosierung** | Potenz-Einordnung, Edible-Referenzbereiche (2,5 / 5 / 10 mg …), Warnungen, Toleranz, Edible ≠ Joint, Überdosierung |
| **Zeitachse** | Interaktiver Wirkverlauf (Rauchen vs. Edibles) als Zeitbereiche nach Health Canada |
| **Werkzeuge** | g ↔ mg ↔ %, Konzentrationen mischen/verdünnen, Cannabis-zu-Butter-Verhältnis, Umkehrrechner mg pro Portion |
| **Vergleich** | Bis zu 6 hypothetische Rezepte mit Fehlerbalken |
| **Gespeichert** | Lokale Speicherung (localStorage), JSON-Sicherung und -Import |
| **Export** | CSV (Excel, `;`), JSON, Text, Drucken/PDF |
| **Quellen** | Formeln, Annahmen und Literatur |

## Rechenmodell (Kurzfassung)

```
THC_gesamt  = THC + 0,877 · THCA          (nur bei getrennter Angabe)
mg_decarb   = g · 1000 · (THC_frei + THC_aus_THCA · η_decarb) / 100
mg_Fett     = mg_decarb · η_extraktion
c [mg/g]    = mg_Fett / g_Fett            (Abseihverlust ändert c nicht → keine Doppelzählung)
mg_Portion  = c · g_Butter_im_Rezept / Portionen
```

Der Unsicherheitsbereich kombiniert die Etikett-Unsicherheit (± u relativ), η_decarb ± 10 Pp. und η_extraktion ± 15 Pp. als konservativen Worst/Best-Case.
Details stehen in `src/lib/sources.ts` und im Tab „Quellen“.

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests (Vitest)
npm run build      # Typecheck + Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

## Architektur

```
src/
  lib/calc/      reine, UI-unabhängige Berechnungslogik (getestet)
    constants.ts   Konstanten & dokumentierte Annahmen
    potency.ts     THC/THCA, %, mg, Potenzeinordnung
    edibles.ts     Cannabutter-Modell, Unsicherheit, Umkehrrechnung
    smoking.ts     Joint-Modell, Bioverfügbarkeit, Verluste
    dosage.ts      Edible-Referenzbereiche, Warnungen
    timeline.ts    Wirkphasen als Zeitbereiche
    conversions.ts Einheiten, Mischungen, Verhältnisse
    compare.ts     Rezeptvergleich
    validation.ts  Eingabevalidierung, Zahlen-Parsing (Dezimalkomma)
  lib/           storage, exporters, format, guards, sources
  lib/__tests__/ Unit-Tests
  components/ui/ wiederverwendbare UI-Bausteine
  features/      Ansichten der einzelnen Tabs
```

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, Recharts und Vitest. Die Schriften Inter und JetBrains Mono werden lokal über Fontsource eingebunden.
