import test from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config';
import { maxDuration } from '../app/api/certificates/[id]/download/route';
import {
  CERTIFICATE_PDF_ERROR_MESSAGE,
  CERTIFICATE_SERVICE_UNAVAILABLE_MESSAGE,
  CertificateRenderError,
  classifyRenderError,
  type CertificateRenderStage,
} from '../lib/certificates/render-pdf';

/**
 * Certificate PDF on Vercel (13 Nov 2026 fix).
 *
 * The download worked locally (real Chromium in this VM) but failed
 * on Vercel with "Could not generate the certificate PDF. Please try
 * again." Two runtime causes, both fixed here:
 * 1. TIMEOUT — a cold start extracts ~70 MB of Chromium archives,
 *    launches and renders, easily over Vercel's Hobby 10s default.
 *    The route sets maxDuration = 60 (the Hobby maximum).
 * 2. BUNDLING — Next's file tracer cannot see the Chromium .br
 *    archives (read off disk through a dynamically computed path),
 *    so the function deployed WITHOUT the binary and threw at launch.
 *    next.config.ts keeps @sparticuz/chromium external and names the
 *    bin/ archives in outputFileTracingIncludes for the download
 *    route. These tests guard both, plus the staged error reporting
 *    that makes the next failure diagnosable from the Vercel logs.
 */

test('download route: maxDuration is 60 (Vercel Hobby maximum)', () => {
  assert.equal(maxDuration, 60);
});

test('config: @sparticuz/chromium stays external (bundler must not relocate it)', () => {
  assert.ok(
    (nextConfig.serverExternalPackages ?? []).includes('@sparticuz/chromium'),
    'serverExternalPackages must list @sparticuz/chromium',
  );
});

test('config: the Chromium bin archives are traced into the download route', () => {
  const includes = nextConfig.outputFileTracingIncludes ?? {};
  // The key is the route path with the dynamic segment escaped —
  // picomatch would read a bare [id] as a character class.
  const key = '/api/certificates/\\[id\\]/download';
  assert.ok(
    key in includes,
    `outputFileTracingIncludes must have the download route key ${key}`,
  );
  assert.ok(
    (includes[key] ?? []).some((glob) => glob.includes('@sparticuz/chromium/bin')),
    'the download route must include the @sparticuz/chromium bin/ archives',
  );
});

test('CertificateRenderError carries its stage', () => {
  const error = new CertificateRenderError('binary', 'no binary');
  assert.equal(error.name, 'CertificateRenderError');
  assert.equal(error.stage, 'binary');
  assert.equal(error.message, 'no binary');
});

const STAGES: Exclude<CertificateRenderStage, 'unknown'>[] = ['binary', 'launch', 'content', 'pdf'];

for (const stage of STAGES) {
  test(`classifyRenderError: stage ${stage} keeps its stage`, () => {
    const { stage: got, userMessage } = classifyRenderError(
      new CertificateRenderError(stage, 'boom'),
    );
    assert.equal(got, stage);
    assert.equal(
      userMessage,
      stage === 'binary'
        ? CERTIFICATE_SERVICE_UNAVAILABLE_MESSAGE
        : CERTIFICATE_PDF_ERROR_MESSAGE,
    );
  });
}

test('classifyRenderError: the binary stage gets the distinct service-unavailable message', () => {
  const { userMessage } = classifyRenderError(
    new CertificateRenderError('binary', 'The input directory does not exist'),
  );
  assert.equal(userMessage, CERTIFICATE_SERVICE_UNAVAILABLE_MESSAGE);
  assert.notEqual(userMessage, CERTIFICATE_PDF_ERROR_MESSAGE);
});

test('classifyRenderError: a plain error is unknown with the generic message', () => {
  const { stage, userMessage } = classifyRenderError(new Error('boom'));
  assert.equal(stage, 'unknown');
  assert.equal(userMessage, CERTIFICATE_PDF_ERROR_MESSAGE);
});

test('classifyRenderError: a non-Error thrown value is unknown, never leaks the value', () => {
  const { stage, userMessage } = classifyRenderError('some-internal-detail');
  assert.equal(stage, 'unknown');
  assert.equal(userMessage, CERTIFICATE_PDF_ERROR_MESSAGE);
  assert.ok(!userMessage.includes('some-internal-detail'));
});
