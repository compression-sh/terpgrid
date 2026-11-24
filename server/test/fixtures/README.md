# Test-Fixtures

`cisp-sample.csv` ist ein unveränderter Auszug (Zeilen samt Kodierungsfehlern) aus `raw-data.csv` von

    Cannabis Intelligence Database by Shannon Goddard
    https://github.com/Shannon-Goddard/ci-strains-pro (Commit 80fbe5d40fac8dda5120f50b946f069c4961f253)
    Licensed under CC BY 4.0 – https://creativecommons.org/licenses/by/4.0/

Auswahl für Tests: gleichnamige Sorten verschiedener Breeder, Mojibake, unplausible Werte
(THC 8211 %, 0,03 %), Fließtext als Abstammung, abweichende Breeder-Schreibweisen.

`strainapi-barf-breath.json` und `findmyseeds-gelato.json` sind gekürzte, unveränderte API-Antworten
(StrainAPI bzw. Find My Seeds, abgerufen am 24.11.2026) – nur für Tests des Abgleichs und der Normalisierung.
