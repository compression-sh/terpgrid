/**
 * Minimaler, defensiver EXIF-Leser für JPEG-Dateien.
 * Liest nur das Aufnahmedatum und ob GPS-Daten vorhanden sind – die Bilddaten
 * selbst werden beim Import ohnehin neu kodiert (dabei gehen alle Metadaten verloren).
 */

export interface ExifInfo {
  /** "YYYY-MM-DDTHH:mm" */
  dateTimeOriginal?: string;
  hasGps: boolean;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;

function readAscii(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function exifDateToLocal(s: string): string | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(s.trim());
  if (!m || m[1] === '0000') return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}

export function readExif(buffer: ArrayBuffer): ExifInfo {
  const info: ExifInfo = { hasGps: false };
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return info;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00) break;
      const size = view.getUint16(offset + 2);
      if (marker === 0xffe1 && readAscii(view, offset + 4, 4) === 'Exif') {
        parseTiff(view, offset + 10, info);
        return info;
      }
      if (marker === 0xffda) break; // Start of Scan – keine Metadaten mehr
      offset += 2 + size;
    }
  } catch {
    /* beschädigte Metadaten ignorieren */
  }
  return info;
}

function parseTiff(view: DataView, tiff: number, info: ExifInfo) {
  const order = view.getUint16(tiff);
  const le = order === 0x4949;
  if (!le && order !== 0x4d4d) return;
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);
  const readIfd = (ifdOffset: number): Map<number, { type: number; count: number; valueOffset: number }> => {
    const map = new Map<number, { type: number; count: number; valueOffset: number }>();
    const start = tiff + ifdOffset;
    if (start + 2 > view.byteLength) return map;
    const n = u16(start);
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12;
      if (e + 12 > view.byteLength) break;
      map.set(u16(e), { type: u16(e + 2), count: u32(e + 4), valueOffset: e + 8 });
    }
    return map;
  };
  const ascii = (entry?: { type: number; count: number; valueOffset: number }) => {
    if (!entry || entry.type !== 2) return undefined;
    const off = entry.count > 4 ? tiff + u32(entry.valueOffset) : entry.valueOffset;
    return readAscii(view, off, entry.count);
  };
  const ifd0 = readIfd(u32(tiff + 4));
  info.hasGps = ifd0.has(TAG_GPS_IFD);
  let date: string | undefined;
  const exifPtr = ifd0.get(TAG_EXIF_IFD);
  if (exifPtr) {
    const exif = readIfd(u32(exifPtr.valueOffset));
    date = ascii(exif.get(TAG_DATETIME_ORIGINAL));
  }
  date ??= ascii(ifd0.get(TAG_DATETIME));
  if (date) info.dateTimeOriginal = exifDateToLocal(date);
}
