# TERPGRID – Design-System

Stand: 6.0.1.
- Ein System, kein zweites: Tokens in `src/index.css` (`@theme`, `@utility`), Bausteine in `src/components/ui/`.
- Neue Oberflächen nutzen diese Bausteine, keine eigenen Varianten.

## Haltung

- **Ruhig, technisch, erwachsen.** Fast-Schwarz mit Smaragd als **sparsamer** Akzent für Aktionen, aktive Zustände und Erfolg, nicht als Dekoration.
- **Hierarchie über Abstand und Typografie**, nicht über Rahmen, Schatten, Verläufe oder Leuchteffekte.
- **Karten nur, wo sie gruppieren.** Listen sind Zeilen mit Trennlinie (`list-rows`), keine Karte je Eintrag; keine Karten in Karten.
- **Wichtiges bleibt sichtbar:** Warnungen, Datenschutzhinweise, Evidenz- und Unsicherheitskennzeichen werden nie hinter Aufklappelementen versteckt.

## Farben (Tokens)

| Token | Wert | Verwendung |
| --- | --- | --- |
| `ink-950` | `#060807` | Seitenhintergrund, Seitenleiste |
| `ink-900` | `#0a0d0c` | Flächen (`card`, 70 % Deckkraft) |
| `ink-850` / `ink-800` | `#0e1211` / `#121816` | Eingaben, Menüs, Hover |
| `ink-50 … ink-500` | Textstufen | ≥ 4,5:1 auf `ink-900` bis einschließlich `ink-500` (4,7:1) |
| `leaf-400/500` | `#5fe39a` / `#34c77b` | Primäraktion, aktiver Navigationspunkt (Symbol), Fokusring |
| `amber-300` | | überfällig, Warnung |
| `rose-*` | | Fehler, destruktive Aktionen |
| `white/[0.05–0.08]` | | Linien und Rahmen; `0.14+` nur bei Hover |

**6.0.1:**
- Der Seitenhintergrund hat nur noch **einen** sehr schwachen Verlauf (5 % statt 9 % + 5 %).
- Karten haben keinen Weichzeichner (`backdrop-blur`) und keinen großen Schlagschatten mehr, nur eine 1-px-Lichtkante.

## Typografie

| Stufe | Klasse | Größe | Verwendung |
| --- | --- | --- | --- |
| Seitentitel | `page-title` | 22 px / 26 px ab `sm` | genau ein `h1` je Seite (alle Seiten) |
| Abschnittstitel | `Card title` | 14 px, semibold | |
| Fließtext | `text-sm` / `text-[13px]` | 13–14 px | |
| Nebeninfo | `hint`, `text-[11–12px] text-ink-400/500` | 11–12 px | |
| Gruppenüberschrift | `section-label` | 11 px, `ink-500`, normale Schreibung | Navigation, Gruppen |
| Zahlen | `font-mono tabular` | | Messwerte, Kennzahlen |

**6.0.1:**
- Vorher hatten Seitentitel 24–44 px in 15 Varianten, oft mit Slogan („Aromen verstehen.“) und einer zusätzlichen Großbuchstaben-Zeile über dem Titel, die den Reiter wiederholte.
- Jetzt gibt es einen klaren Namen je Seite („Terpen-Atlas“, „Cannabis 101“, „Breeder-Verzeichnis“) in einer Größe.

## Abstände und Formen

| Element | Wert |
| --- | --- |
| Seitenrand | 16 px mobil (mit Safe Area), 24 px `sm`, 40 px `lg` |
| Abstand zwischen Abschnitten | 16–20 px (`gap-4`, `space-y-5`) |
| Karteninnenabstand | 20 px; Kopf 16 px oben, Inhalt 12 px darunter |
| Radius | `card` 12 px (`rounded-xl`), Eingaben/Knöpfe 8 px, Navigation 6 px |
| Symbole | 16 px (`size-4`) in Listen, Knöpfen, Navigation; 20 px in der unteren Navigation |
| Touch-Ziele | ≥ 44 px auf Mobilgeräten (untere Navigation 56 px, „Mehr“-Einträge 44 px) |

## Bausteine

| Baustein | Datei | Regeln |
| --- | --- | --- |
| `Card` | `ui/Card.tsx` | Titel optional, Symbol **gedämpft vor dem Titel** (keine farbige Kachel mehr), keine Trennlinie unter dem Kopf; eigene Abstände über `bodyClassName="p-…"` ersetzen die Standardabstände vollständig |
| `PageHeader` | `ui/PageHeader.tsx` | Titel, optional Kurzbeschreibung, Aktionen rechts; Brotkrumen nur bei tiefen Seiten |
| `EmptyState` | `ui/EmptyState.tsx` | sagt, was fehlt, plus **eine** nächste Aktion; `compact` in Karten |
| `Modal` / `BottomSheet` | `ui/Modal.tsx`, `ui/BottomSheet.tsx` | Fokus bleibt im Dialog, Escape schließt, Name über Titel |
| `Segmented`, `Toggle`, `NumberField`, `Fields` | `ui/`, `forms/` | Beschriftung oben, Hinweis darunter |
| `Chip`, `PhaseChip` | `ui/Chip.tsx` | Zustand oder Kategorie, keine Dekoration |
| Knöpfe | `btn-primary`, `btn-ghost` | **eine** Primäraktion je Bereich; destruktiv mit Bestätigung (`Confirm`) |
| Listen | `list-rows` | Zeilen mit Trennlinie statt Einzelkarten |
| Einklappen | „Alle n anzeigen“ (Text-Knopf mit `aria-expanded`) | für lange Listen (Sitzungen ab 5, Sortenlisten ab 8) |

## Bewegung

- `animate-fade-up` (0,45 s) nur beim Erscheinen von Abschnitten.
- Keine Endlosanimationen außer Ladeanzeigen.
- `prefers-reduced-motion` und die App-Einstellung „Bewegung reduzieren“ schalten alle Animationen und Übergänge ab.
- Keine Animationsbibliothek.

## Navigation

- **Desktop:**
  - Seitenleiste 240 px;
  - oben „Neu“ (Schnellerfassung), Suche (`Strg K`) und Glocke in einer Zeile;
  - darunter Produktbereiche mit kleinen Gruppenüberschriften;
  - unten Einstellungen, Konto & Datenschutz, Daten & Backup und Konto mit Sync-Status.
- **Aktiver Zustand:** leicht aufgehellte Fläche und grünes Symbol, kein farbiger Balken.
- **Mobil:**
  - Kopfzeile mit Logo, Suche, Glocke und Sync;
  - untere Navigation mit fünf Zielen, Erfassen in der Mitte;
  - „Mehr“ als Bottom Sheet nach Gruppen.

Details: `INFORMATION-ARCHITECTURE.md`.

## Nicht verwenden

Diese Muster werden in neuen Oberflächen nicht eingesetzt:
- farbige Symbolkacheln in Kartenköpfen;
- Großbuchstaben-Überzeilen, die den Titel wiederholen;
- Slogans als Seitentitel;
- Weichzeichner auf Inhaltsflächen;
- Leuchtschatten;
- mehrere Verläufe;
- dekorative Badges;
- Karten je Listeneintrag;
- englische Bezeichnungen in der Oberfläche.
