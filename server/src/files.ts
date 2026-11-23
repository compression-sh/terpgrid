/**
 * Private Dateiablage: Inhalte AES-256-GCM-verschlüsselt (DEK des Benutzers,
 * AAD bindet Benutzer/Art/ID/Variante), zufällige Dateinamen außerhalb jedes
 * Web-Roots, Typprüfung über Magic Bytes, Größen- und Quota-Limits.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const FILE_KINDS = { photo: ['full', 'thumb'], labdoc: ['doc'] } as const;
export type FileKind = keyof typeof FILE_KINDS;
export const KIND_MIMES: Record<FileKind, string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  labdoc: ['application/pdf', 'image/jpeg', 'image/png'],
};

/** Ermittelt den MIME-Typ ausschließlich aus der Dateisignatur. */
export function sniffMime(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

export const newStorageName = () => randomBytes(24).toString('hex');

/** Pfad nur aus geprüftem Hex-Namen – keine Benutzereingabe im Pfad. */
export function storagePath(dir: string, name: string): string {
  if (!/^[a-f0-9]{48}$/.test(name)) throw new Error('Ungültiger Speichername');
  return join(dir, name.slice(0, 2), name);
}

export async function writeBlob(dir: string, name: string, data: Buffer): Promise<void> {
  const p = storagePath(dir, name);
  await mkdir(join(dir, name.slice(0, 2)), { recursive: true, mode: 0o700 });
  const tmp = `${p}.tmp-${randomBytes(4).toString('hex')}`;
  await writeFile(tmp, data, { mode: 0o600, flag: 'wx' });
  await rename(tmp, p);
}

export const readBlob = (dir: string, name: string) => readFile(storagePath(dir, name));
export const removeBlob = (dir: string, name: string) => rm(storagePath(dir, name), { force: true });
