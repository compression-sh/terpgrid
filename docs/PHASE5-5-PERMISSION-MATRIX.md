# Phase 5.5 – Rechtematrix gemeinsamer Bereiche

Stand: 5.5.0-rc.1 · Quelle der Wahrheit: `server/src/collab/permissions.ts` (`MATRIX`, `can()`). Die Tabelle unten wird aus dem Code erzeugt; der Test `server/test/permissions.test.ts` schlägt fehl, wenn Dokument und Code auseinanderlaufen.

## Rollen

| Rolle | Zweck |
| --- | --- |
| **Eigentümer** | Verwaltet Bereich, Mitglieder, Rollen, Einladungen, Zugriffsstufen; löscht den Bereich; überträgt das Eigentum (nur mit Annahme durch das Ziel). Genau ein Eigentümer je Bereich. |
| **Bearbeiten** | Legt Inhalte an, bearbeitet und löscht sie, lädt Fotos/Dokumente hoch, kommentiert, teilt eigene private Inhalte in den Bereich. Keine Mitglieder- oder Rechteverwaltung. |
| **Kommentieren** | Liest freigegebene Inhalte, kommentiert und antwortet, bearbeitet/löscht nur eigene Kommentare. Verändert keine Inhalte. |
| **Ansehen** | Liest freigegebene Inhalte. Keine Änderungen, keine Kommentare, keine Mitgliederverwaltung. |
| **Außenstehend** | Kein Mitglied: Der Bereich existiert für ihn nicht (HTTP 404 auf jede Route, keine Zeilen per RLS). |

## Zugriffsstufen je Ressource

Jede Wurzel-Ressource (z. B. Grow, Sorte, Journal-Eintrag) hat eine Zugriffsstufe; **Unterressourcen erben sie** (Pflanze → Grow, Aktivität → Pflanze/Grow, Foto → Grow/Pflanze/…). Der Elternbezug wird serverseitig aus dem Inhalt abgeleitet und geprüft – nie vom Client übernommen.

| Stufe | Wirkung |
| --- | --- |
| Alle Mitglieder | Standard: Lesen gemäß Rolle, Schreiben für Eigentümer/Bearbeiten |
| Nur Bearbeitende | Für Kommentieren/Ansehen unsichtbar – einschließlich aller Unterressourcen, Dateien, Kommentare und Verlaufseinträge. Wird eine bisher sichtbare Ressource eingeschränkt, erhalten diese Rollen eine inhaltslose Löschmarke, damit Clients sie entfernen. |
| Schreibgeschützt | Alle Rollen lesen; nur der Eigentümer ändert, löscht oder legt Unterressourcen an. |

Nur der Eigentümer ändert Zugriffsstufen; Bearbeitende dürfen eine Ressource auch nicht in einen Baum mit anderer Stufe umhängen (das würde sie offenlegen oder verbergen).

## Matrix

| Aktion | Eigentümer | Bearbeiten | Kommentieren | Ansehen |
| --- | :---: | :---: | :---: | :---: |
| Bereich öffnen (`space.read`) | ✅ | ✅ | ✅ | ✅ |
| Name, Beschreibung, Optionen ändern (`space.update`) | ✅ | — | — | — |
| Bereich löschen (`space.delete`) | ✅ | — | — | — |
| Eigentum übertragen (`space.transfer`) | ✅ | — | — | — |
| Bereichsschlüssel erneuern (`space.rotateKey`) | ✅ | — | — | — |
| Bereich exportieren (`space.export`) | ✅ | ✅ | — | — |
| Mitglieder sehen (`members.read`) | ✅ | ✅ | ✅ | ✅ |
| Freunde einladen (`members.invite`) | ✅ | — | — | — |
| Rollen ändern (`members.changeRole`) | ✅ | — | — | — |
| Mitglieder entfernen (`members.remove`) | ✅ | — | — | — |
| Bereich verlassen (`members.leave`) | — | ✅ | ✅ | ✅ |
| Einladungen widerrufen (`invites.revoke`) | ✅ | — | — | — |
| Inhalte lesen (`resource.read`) | ✅ | ✅ | ✅ | ✅ |
| Inhalte anlegen (`resource.create`) | ✅ | ✅ | — | — |
| Inhalte bearbeiten (`resource.update`) | ✅ | ✅ | — | — |
| Inhalte löschen (`resource.delete`) | ✅ | ✅ | — | — |
| Zugriffsstufe festlegen (`resource.setAccess`) | ✅ | — | — | — |
| Private Inhalte teilen (Kopie/Verschieben) (`resource.shareInto`) | ✅ | ✅ | — | — |
| Fotos/Dokumente ansehen (`file.read`) | ✅ | ✅ | ✅ | ✅ |
| Fotos/Dokumente hochladen (`file.write`) | ✅ | ✅ | — | — |
| Kommentare lesen (`comment.read`) | ✅ | ✅ | ✅ | ✅ |
| Kommentieren und antworten (`comment.create`) | ✅ | ✅ | ✅ | — |
| Eigene Kommentare bearbeiten (`comment.editOwn`) | ✅ | ✅ | ✅ | — |
| Eigene Kommentare löschen (`comment.deleteOwn`) | ✅ | ✅ | ✅ | — |
| Fremde Kommentare entfernen (`comment.moderate`) | ✅ | — | — | — |
| Aktivitätsverlauf sehen (`activity.read`) | ✅ | ✅ | ✅ | ✅ |
| Export bei „Export erlauben“ | ✅ | ✅ | ✅ | ✅ |
| Lesen „Nur Bearbeitende“ | ✅ | ✅ | — | — |
| Bearbeiten „Schreibgeschützt“ | ✅ | — | — | — |

## Durchsetzung (mehrschichtig)

1. **API:** Jede Route ruft `requireSpace()` (Mitgliedschaft wird bei jeder Anfrage neu geladen – kein zwischengespeichertes Recht) und `can()`/`assertCan()` mit der Zugriffsstufe der betroffenen Ressource auf.
2. **Datenbank (RLS, Migration 008):** Policies spiegeln die Matrix: `tg_can_read`/`tg_can_write` je Zugriffsstufe, Dateien/Kommentare/Verlauf nur bei lesbarer Ressource, Mitgliedschaften nur durch Eigentümer oder Annahme einer passenden Einladung, Benachrichtigungen nur über `tg_notify()`.
3. **Schutz-Trigger:** Unveränderliche Felder (Rolle einer Einladung, Ziel/Autor eines Kommentars, Herkunft eines Eintrags) und erlaubte Statuswechsel werden in der Datenbank erzwungen; Zugriffsstufen ändert nur der Eigentümer.
4. **Oberfläche:** Zeigt nur erlaubte Aktionen (`permissions` aus `GET /api/spaces/:id`) – rein zur Bedienbarkeit; der Server prüft jede Aktion erneut.

## Eskalationspfade (geprüft in `server/test/collab.test.ts`)

* Verschachtelte Ressourcen: Kind eines eingeschränkten Grows ist weder als Datensatz, Datei, Kommentar noch im Verlauf erreichbar; Umhängen in einen öffentlichen Baum wird abgelehnt.
* API-Manipulation: fremde Bereichs-IDs → 404; manipulierte Felder (`role`, `userId`) wirkungslos; Rolle `owner` nicht vergebbar.
* Exporte: nur lesbare Ressourcen; Kommentieren/Ansehen nur bei „Export erlauben“.
* Medien-URLs: jede Datei wird über die zugehörige Ressource autorisiert; `Cache-Control: no-store`, `Content-Disposition: attachment`.
* Manipulierter Client-Zustand: Rechte im Client sind nur Anzeige; Rollenwechsel und Entzug wirken beim nächsten Request sofort (auch für Offline-Änderungen).
