# Browser print security boundary

`@credaryn/web` prepares a paper-verifiable seal in the browser; it does not
sign the final bytes produced by the operating system's print pipeline.

## Security mode

Every successful response must explicitly report:

```text
PAPER_CLAIMS_ONLY
```

The browser package rejects `DIGITAL_ARTIFACT_SIGNED`, malformed responses,
oversized responses and failed issuance. `DIGITAL_ARTIFACT_SIGNED` is reserved
for the controlled server-side PDF flow, where the exact PDF bytes are passed
to the PAdES signing engine.

## Trust boundary

The browser sends a `DocumentDescriptor` to the integrating application's
trusted `POST /issue-seal` endpoint. The endpoint validates the descriptor,
uses the configured server-side signer and returns the `CRD1:` transport plus
human-readable text and a bounded `data:image/png;base64,...` QR image. Private
keys and raw signing operations never enter the browser bundle.

The package accepts only an explicit selector or element target. It does not
search the whole document or replace `window.print()`. `prepareAndPrint()`
finishes the request and DOM rendering before invoking the browser's native
print dialog; any issuance or response-validation failure aborts printing.

## Browser content policy

The rendering path uses DOM methods and a small local print stylesheet. It does
not use `eval`, `new Function`, third-party network calls or remote QR/image
resources. A production application should still serve its own page with a
restrictive CSP and protect its issuance endpoint with its normal application
authentication and CSRF controls.
