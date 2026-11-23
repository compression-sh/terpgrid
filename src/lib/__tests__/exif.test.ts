import { describe, expect, it } from 'vitest';
import { readExif } from '../media/exif';
import { fitWithin, formatBytes } from '../media/images';

/** Baut ein minimales JPEG mit EXIF (Little Endian) inkl. DateTimeOriginal und GPS-Pointer. */
function jpegWithExif(date: string, withGps: boolean): ArrayBuffer {
  const tiff: number[] = [];
  const u16 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v: number) => tiff.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  // Header
  tiff.push(0x49, 0x49); u16(42); u32(8);
  // IFD0 bei 8
  const ifd0Entries = withGps ? 2 : 1;
  u16(ifd0Entries);
  const exifIfdOffset = 8 + 2 + ifd0Entries * 12 + 4;
  u16(0x8769); u16(4); u32(1); u32(exifIfdOffset);
  if (withGps) { u16(0x8825); u16(4); u32(1); u32(0); }
  u32(0);
  // Exif-IFD
  u16(1);
  const dateOffset = exifIfdOffset + 2 + 12 + 4;
  u16(0x9003); u16(2); u32(20); u32(dateOffset);
  u32(0);
  for (const ch of date) tiff.push(ch.charCodeAt(0));
  tiff.push(0);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...app1, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}

describe('EXIF', () => {
  it('liest DateTimeOriginal und erkennt GPS', () => {
    expect(readExif(jpegWithExif('2026:05:17 14:32:05', true))).toEqual({ dateTimeOriginal: '2026-05-17T14:32', hasGps: true });
    expect(readExif(jpegWithExif('2026:05:17 14:32:05', false)).hasGps).toBe(false);
  });
  it('ignoriert Nicht-JPEG und beschädigte Daten', () => {
    expect(readExif(new Uint8Array([1, 2, 3]).buffer)).toEqual({ hasGps: false });
    expect(readExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 4, 0x45]).buffer)).toEqual({ hasGps: false });
  });
});

describe('Bildgrößen', () => {
  it('skaliert proportional und nie hoch', () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1000, 4000, 480)).toEqual({ width: 120, height: 480 });
  });
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});
