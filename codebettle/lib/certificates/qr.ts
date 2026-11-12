/**
 * Certificate QR code (Phase 2).
 *
 * The QR encodes ONLY the verify URL
 *   https://codebettle-web.vercel.app/verify/<verificationToken>
 * (the secret token, NOT the certificate number), at error-correction
 * level H (the highest — 30% of codewords recoverable).
 *
 * THE LOGO SITS BETWEEN THE DOTS, NOT ON TOP OF THEM. A naive
 * implementation pastes a logo over a finished QR and covers dots;
 * scanners then have to guess the missing modules. This module does it
 * properly:
 *  1. Build the QR module matrix with the `qrcode` package.
 *  2. CLEAR (switch off) every module under the centre logo area, so
 *     the logo sits in a genuinely blank space surrounded by dots.
 *  3. Composite the bee into that blank space when rasterising the PNG.
 * The logo is ~18% of the QR width; level-H correction absorbs the
 * cleared centre. The result is decode-checked (see the tests, which
 * decode the finished PNG with jsQR, and the manual pyzbar check).
 *
 * WHICH LOGO: the CodeBettle BEE mark, cropped from the left of the
 * full logo (the bee + laptop, roughly square). The full wordmark is
 * unreadable at ~18% of an 85px QR; the bee is the recognisable mark.
 * The bee PNG is stored in lib/certificates/assets/images.json.
 */
import QRCode from 'qrcode';
import { PNG } from 'pngjs';
import images from './assets/images.json';

/** Production verify base — the QR must always point at the live site. */
export const VERIFY_BASE_URL = 'https://codebettle-web.vercel.app';

export function verifyUrlForToken(verificationToken: string): string {
  return `${VERIFY_BASE_URL}/verify/${verificationToken}`;
}

/** Logo width as a fraction of the QR width (brief: ~15–20%). */
export const QR_LOGO_FRACTION = 0.18;
/** Quiet-zone width in modules (QR spec minimum is 4). */
const QUIET_ZONE_MODULES = 4;
/** Raster pixels per module in the generated PNG. */
const MODULE_PX = 10;

export interface QrMatrix {
  /** Modules per side. */
  size: number;
  /** Row-major module data (1 = dark, 0 = light), centre already cleared. */
  data: Uint8Array;
  /** Side of the cleared centre square, in modules. */
  clearedSide: number;
  /** Top-left offset of the cleared square, in modules. */
  clearedStart: number;
  /** Number of dark modules that were cleared under the logo. */
  clearedDarkModules: number;
}

/**
 * Build the QR module matrix for a URL, with the centre square cleared
 * for the logo. Pure function of the URL — unit-tested directly.
 */
export function buildQrMatrix(verifyUrl: string): QrMatrix {
  const qr = QRCode.create(verifyUrl, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const data = Uint8Array.from(qr.modules.data);
  // Centre square: ~18% of the width, odd side so it centres exactly.
  let clearedSide = Math.round(size * QR_LOGO_FRACTION);
  if (clearedSide % 2 === 0) clearedSide += 1;
  const clearedStart = Math.floor((size - clearedSide) / 2);
  let clearedDarkModules = 0;
  for (let y = clearedStart; y < clearedStart + clearedSide; y++) {
    for (let x = clearedStart; x < clearedStart + clearedSide; x++) {
      const i = y * size + x;
      if (data[i] === 1) clearedDarkModules += 1;
      data[i] = 0;
    }
  }
  return { size, data, clearedSide, clearedStart, clearedDarkModules };
}

export interface QrPngResult {
  /** PNG bytes (white quiet zone, black modules, bee in the centre). */
  png: Buffer;
  /** `data:image/png;base64,…` — goes straight into the {{QR_CODE}} placeholder. */
  dataUri: string;
  matrix: QrMatrix;
  /** PNG side length in pixels. */
  pngSize: number;
}

/** Decode the embedded bee PNG once (module-level cache). */
let cachedBee: PNG | null = null;
function getBeePng(): PNG {
  if (!cachedBee) cachedBee = PNG.sync.read(Buffer.from(images.bee, 'base64'));
  return cachedBee;
}

/** Downscale the bee to `side` px with a box average (smooth, no blockiness). */
function resampleBee(bee: PNG, side: number): { r: number; g: number; b: number; a: number }[][] {
  const out: { r: number; g: number; b: number; a: number }[][] = [];
  const sx = bee.width / side;
  const sy = bee.height / side;
  for (let y = 0; y < side; y++) {
    const row: { r: number; g: number; b: number; a: number }[] = [];
    for (let x = 0; x < side; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * bee.width + xx) * 4;
          r += bee.data[i];
          g += bee.data[i + 1];
          b += bee.data[i + 2];
          a += bee.data[i + 3];
          n += 1;
        }
      }
      row.push({ r: r / n, g: g / n, b: b / n, a: a / n });
    }
    out.push(row);
  }
  return out;
}

/**
 * Render the cleared-matrix QR + centred bee to a PNG.
 * White background (the template draws it on a white square), black
 * modules, the bee composited only where modules were cleared.
 */
export function buildVerifyQrPng(verifyUrl: string): QrPngResult {
  const matrix = buildQrMatrix(verifyUrl);
  const totalModules = matrix.size + QUIET_ZONE_MODULES * 2;
  const pngSize = totalModules * MODULE_PX;
  const png = new PNG({ width: pngSize, height: pngSize });
  // White background.
  png.data.fill(255);
  // Dark modules.
  for (let my = 0; my < matrix.size; my++) {
    for (let mx = 0; mx < matrix.size; mx++) {
      if (matrix.data[my * matrix.size + mx] !== 1) continue;
      const px0 = (mx + QUIET_ZONE_MODULES) * MODULE_PX;
      const py0 = (my + QUIET_ZONE_MODULES) * MODULE_PX;
      for (let y = py0; y < py0 + MODULE_PX; y++) {
        for (let x = px0; x < px0 + MODULE_PX; x++) {
          const i = (y * pngSize + x) * 4;
          png.data[i] = 0;
          png.data[i + 1] = 0;
          png.data[i + 2] = 0;
          png.data[i + 3] = 255;
        }
      }
    }
  }
  // Bee in the cleared centre (exactly the cleared square, no overlap
  // with any live module — the modules under it are all off).
  const logoPx = matrix.clearedSide * MODULE_PX;
  const logoX0 = (matrix.clearedStart + QUIET_ZONE_MODULES) * MODULE_PX;
  const logoY0 = (matrix.clearedStart + QUIET_ZONE_MODULES) * MODULE_PX;
  const bee = resampleBee(getBeePng(), logoPx);
  for (let y = 0; y < logoPx; y++) {
    for (let x = 0; x < logoPx; x++) {
      const px = bee[y][x];
      if (px.a < 8) continue;
      const i = ((logoY0 + y) * pngSize + (logoX0 + x)) * 4;
      // Alpha-composite over the white background.
      const alpha = px.a / 255;
      png.data[i] = Math.round(px.r * alpha + png.data[i] * (1 - alpha));
      png.data[i + 1] = Math.round(px.g * alpha + png.data[i + 1] * (1 - alpha));
      png.data[i + 2] = Math.round(px.b * alpha + png.data[i + 2] * (1 - alpha));
      png.data[i + 3] = 255;
    }
  }
  const buffer = Buffer.from(PNG.sync.write(png));
  return {
    png: buffer,
    dataUri: `data:image/png;base64,${buffer.toString('base64')}`,
    matrix,
    pngSize,
  };
}
