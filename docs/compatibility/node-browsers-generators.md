# Runtime and generator compatibility

## Locked runtime

- Node.js 24 or newer, as declared by `package.json`.
- pnpm 12.3.3, as declared by `packageManager`.
- TypeScript strict mode and the checked-in lockfile.

Generate the machine-readable report with:

```bash
pnpm compatibility:report
```

## Document generators

| Generator | Boundary | Verification |
| --- | --- | --- |
| Puppeteer | server-side controlled PDF rendering | DSS PAdES + Paper Seal fixtures |
| PDFKit | Node byte renderer | DSS PAdES + shared pipeline tests |
| Playwright | server-side PDF rendering only | DSS PAdES + shared pipeline tests |

Playwright is not used as a UI test runner. Browser UI behavior is reviewed
manually in a real browser/device.

## Browser/device scope

There is no universal browser, printer, scanner, or camera compatibility claim.
Record the actual browser, operating system, printer, scanner, camera, paper
size, and capture conditions in the compatibility corpus before making a
release claim.
