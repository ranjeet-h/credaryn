import { X509Certificate } from "node:crypto";
import { CliInputError } from "./context.js";
import { positionalArguments, readBoundedFile } from "./io.js";

const MAX_CERTIFICATE_BYTES = 1 * 1024 * 1024;

export async function runKeyInspect(args: readonly string[]): Promise<unknown> {
  const positionals = positionalArguments(args, []);
  if (positionals.length !== 1) throw new CliInputError("ARGUMENT_ERROR", "Usage: credaryn key inspect cert.pem");
  const input = await readBoundedFile(positionals[0]!, MAX_CERTIFICATE_BYTES, "Certificate");
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(input);
  } catch {
    throw new CliInputError("INPUT_ERROR", "Certificate input is not a valid X.509 certificate");
  }
  return {
    subject: certificate.subject,
    issuer: certificate.issuer,
    validFrom: certificate.validFrom,
    validTo: certificate.validTo,
    fingerprint256: certificate.fingerprint256,
  };
}
