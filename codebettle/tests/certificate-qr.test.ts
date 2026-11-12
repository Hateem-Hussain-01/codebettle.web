import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import {
  buildQrMatrix,
  buildVerifyQrPng,
  verifyUrlForToken,
} from '../lib/certificates/qr';

/**
 * Phase 2 — certificate QR with the CodeBettle bee in the centre.
 * The logo must sit BETWEEN the dots: the matrix test proves the
 * centre modules are cleared (not covered), and the PNG test decodes
 * the finished QR (bee included) back to the exact verify URL.
 */

const TOKEN = 'a'.repeat(32);
const URL = verifyUrlForToken(TOKEN);

test('verifyUrlForToken encodes only the production verify URL', () => {
  assert.equal(URL, `https://codebettle-web.vercel.app/verify/${TOKEN}`);
  assert.equal(verifyUrlForToken(TOKEN).includes('CB-'), false);
});

test('buildQrMatrix clears the centre square (logo sits between the dots)', () => {
  const m = buildQrMatrix(URL);
  assert.ok(m.size >= 21, `QR should have at least 21 modules, got ${m.size}`);
  // Cleared side is ~18% of the QR width.
  const fraction = m.clearedSide / m.size;
  assert.ok(fraction >= 0.15 && fraction <= 0.22, `cleared fraction ${fraction} outside 15–22%`);
  assert.equal(m.clearedStart, Math.floor((m.size - m.clearedSide) / 2));
  // Every module under the logo area is off — none covered.
  for (let y = m.clearedStart; y < m.clearedStart + m.clearedSide; y++) {
    for (let x = m.clearedStart; x < m.clearedStart + m.clearedSide; x++) {
      assert.equal(m.data[y * m.size + x], 0, `module (${x},${y}) under the logo is still on`);
    }
  }
  // And something WAS cleared (the centre of a real QR is not blank).
  assert.ok(m.clearedDarkModules > 0, 'expected some dark modules under the logo area');
  // The rest of the matrix is untouched (finder patterns intact).
  assert.equal(m.data[0], 1, 'top-left finder pattern must survive');
});

test('buildVerifyQrPng renders a valid PNG that decodes to the exact URL', () => {
  const { png, dataUri, matrix, pngSize } = buildVerifyQrPng(URL);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(dataUri.startsWith('data:image/png;base64,'));
  assert.equal(pngSize, (matrix.size + 8) * 10, 'PNG is (modules + 2x4 quiet zone) x 10px');

  const decoded = PNG.sync.read(png);
  assert.equal(decoded.width, pngSize);
  assert.equal(decoded.height, pngSize);
  // Quiet zone is white (top-left corner pixel).
  assert.deepEqual([...decoded.data.subarray(0, 4)], [255, 255, 255, 255]);

  // The bee is actually in the centre: yellow-ish pixels where the
  // modules were cleared (the bee body is gold/yellow).
  const cx = Math.floor(pngSize / 2);
  let yellow = 0;
  for (let y = cx - 15; y < cx + 15; y++) {
    for (let x = cx - 15; x < cx + 15; x++) {
      const i = (y * pngSize + x) * 4;
      const r = decoded.data[i];
      const g = decoded.data[i + 1];
      const b = decoded.data[i + 2];
      if (r > 150 && g > 120 && b < 130) yellow += 1;
    }
  }
  assert.ok(yellow > 10, `expected the bee's yellow in the centre, found ${yellow} yellow-ish pixels`);

  // Decode check: the finished QR (logo included) must still scan.
  const code = jsQR(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height);
  assert.ok(code, 'jsQR could not decode the QR with the logo');
  assert.equal(code!.data, URL);
});
