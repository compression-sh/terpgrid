#!/usr/bin/env node
/**
 * Gleicht die chemischen Angaben des Terpen-Atlas (src/lib/catalog/terpene-chem.json) erneut mit PubChem ab.
 * Nur lesend; ändert keine Dateien. Abweichungen werden gemeldet (Exit-Code 1).
 *
 *   node scripts/verify-terpenes.mjs
 *
 * PubChem PUG REST erlaubt höchstens 5 Anfragen/Sekunde – das Skript stellt eine einzige Sammelanfrage.
 * Hinter einem Proxy: NODE_USE_ENV_PROXY=1 setzen.
 */
import { readFileSync } from 'node:fs';

const file = new URL('../src/lib/catalog/terpene-chem.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const entries = Object.entries(data.compounds);
const cids = entries.map(([, c]) => c.cid).join(',');
const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cids}/property/MolecularFormula,MolecularWeight,IUPACName,InChIKey/JSON`;

const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'terpgrid-atlas-check' } });
if (!res.ok) {
  console.error(`PubChem antwortet mit HTTP ${res.status}`);
  process.exit(2);
}
const props = new Map((await res.json()).PropertyTable.Properties.map((p) => [p.CID, p]));
let diffs = 0;
for (const [id, c] of entries) {
  const p = props.get(c.cid);
  if (!p) {
    console.log(`✗ ${id}: CID ${c.cid} nicht gefunden`);
    diffs++;
    continue;
  }
  const checks = [
    ['Formel', c.formula, p.MolecularFormula],
    ['Masse', c.mw, Number(p.MolecularWeight)],
    ['IUPAC', c.iupac, p.IUPACName],
    ['InChIKey', c.inchikey, p.InChIKey],
  ];
  const bad = checks.filter(([, a, b]) => a !== b);
  if (bad.length) diffs++;
  console.log(`${bad.length ? '✗' : '✓'} ${id} (CID ${c.cid})${bad.map(([k, a, b]) => `\n    ${k}: gespeichert ${a} · PubChem ${b}`).join('')}`);
}
console.log(`\n${entries.length} Verbindungen geprüft, ${diffs} mit Abweichungen. Stand der Datei: ${data.retrieved}`);
process.exit(diffs ? 1 : 0);
