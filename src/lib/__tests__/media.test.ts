import { describe, expect, it } from 'vitest';
import { ORIGINAL_MAX_PIXELS, fitPixels, fitWithin, formatSupportNote } from '../media/images';

describe('Foto-Studio: Bildgrößen und Formate', () => {
  it('„Optimiert“ begrenzt die Kantenlänge', () => {
    expect(fitWithin(4032, 3024, 2048)).toEqual({ width: 2048, height: 1536 });
  });
  it('„Originalauflösung“ lässt Bilder unter der Pixelgrenze unverändert', () => {
    expect(fitPixels(4032, 3024, ORIGINAL_MAX_PIXELS)).toEqual({ width: 4032, height: 3024 });
  });
  it('„Originalauflösung“ verkleinert nur über der Canvas-Grenze und behält das Seitenverhältnis', () => {
    const r = fitPixels(8064, 6048, ORIGINAL_MAX_PIXELS);
    expect(r.width * r.height).toBeLessThanOrEqual(ORIGINAL_MAX_PIXELS);
    expect(r.width / r.height).toBeCloseTo(8064 / 6048, 2);
  });
  it('gibt klare Hinweise zu HEIC und nicht unterstützten Formaten', () => {
    expect(formatSupportNote({ name: 'IMG_1.HEIC', type: '' })).toMatch(/Safari/);
    expect(formatSupportNote({ name: 'a.jpg', type: 'image/heif' })).toMatch(/HEIC/);
    expect(formatSupportNote({ name: 'scan.tif', type: 'image/tiff' })).toMatch(/nicht unterstützt/);
    expect(formatSupportNote({ name: 'a.jpg', type: 'image/jpeg' })).toBeNull();
  });
});
