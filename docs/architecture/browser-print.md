# Browser print architecture

```text
DocumentDescriptor
      │ POST /issue-seal
      ▼
integrating server ── @credaryn/node + configured signer
      │ CRD1 transport + QR data URL + verification text
      ▼
@credaryn/web ── explicit target ── print CSS ── native window.print()
```

The browser package is intentionally a narrow delivery surface. It prepares
the signed claims for the page and exposes `securityMode:
"PAPER_CLAIMS_ONLY"`; it never receives a private key and never claims that
the unknown final print bytes are a digitally signed PDF.

## API

```ts
const prepared = await preparePrint({
  descriptor,
  issueSealUrl: "/issue-seal",
  target: "#paper-seal-target",
});

console.log(prepared.securityMode); // PAPER_CLAIMS_ONLY
prepared.print();
```

`prepareAndPrint()` is the convenience form that calls `print()` only after
successful issuance, bounded response parsing and seal injection. Selectors
that do not resolve and elements that do not support explicit DOM insertion are
rejected.

## Example

Run the real-browser example locally:

```bash
pnpm --filter @credaryn/example-browser-print dev
```

Open the URL printed by the server. **Prepare print** renders the QR and
verification text into the marked target without opening a dialog. **Prepare
and print** performs the same preparation before opening native print preview.
Stop the server and repeat the second action to confirm the page reports the
issuance failure without opening print preview.
