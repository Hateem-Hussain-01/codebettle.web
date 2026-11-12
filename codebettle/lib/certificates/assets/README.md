# Certificate assets

Runtime assets for the certificate system (Phase 2). The design source
of truth is `../template.html` (the fixed, pixel-verified Python
design, 1,072,420 bytes, self-contained: fonts + images as data URIs).

## Files

- `default-template.json` — the default template HTML as importable
  JSON (`{ "html": "..." }`). The download route imports this instead
  of reading `template.html` from disk, because plain `fs` reads are
  not traced reliably into the Vercel serverless bundle. Generated
  from `../template.html` — regenerate after any design change:
  ```sh
  python3 -c "import json; json.dump({'html': open('lib/certificates/template.html').read()}, open('lib/certificates/assets/default-template.json', 'w'))"
  ```
  (run from the `codebettle/` directory).
- `images.json` — base64 PNGs the server needs at PDF time:
  - `pythonLogo` — the Python logo, used as `{{COURSE_ICON}}` for the
    Python course (extracted asset `img2.png`).
  - `bee` — the CodeBettle bee mark (160x160, cropped from the left
    of the full logo), composited into the centre of the QR code
    between the dots (see `../qr.ts`).
  The background + full logo are NOT duplicated here — they already
  live embedded in `template.html`.
- `fonts.json` — the template's fonts as base64 (Montserrat variable
  instantiated to static TTFs at 300/400/700/800 + italic 400,
  Photograph Signature OTF, Amsterdam Four TTF), extracted from
  `template.html`. DORMANT: kept as the extracted font source; the
  browser renderer uses the fonts embedded in the template HTML, so
  nothing imports this file at runtime. It exists so the fonts are
  not only recoverable from inside the 1 MB HTML file.
