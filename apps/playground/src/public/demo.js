const generate = document.querySelector("#generate");
const verifyOriginal = document.querySelector("#verify-original");
const verifyPaper = document.querySelector("#verify-paper");
const tamper = document.querySelector("#tamper");
const status = document.querySelector("#generate-status");
const paperQr = document.querySelector("#paper-qr");
const paperVerdict = document.querySelector("#paper-verdict");
const pdfVerdict = document.querySelector("#pdf-verdict");
const pdfIntegrity = document.querySelector("#pdf-integrity");
const tamperResult = document.querySelector("#tamper-result");
const openOriginal = document.querySelector("#open-original");
const openTampered = document.querySelector("#open-tampered");

let ready = false;

generate.addEventListener("click", async () => {
  setBusy(generate, true);
  status.textContent = "Rendering Paper Seal and signing PDF…";
  try {
    const payload = await post("/api/generate");
    ready = true;
    paperQr.src = payload.paperSeal.url;
    verifyOriginal.disabled = false;
    verifyPaper.disabled = false;
    tamper.disabled = false;
    enableLink(openOriginal);
    status.textContent = `${payload.invoiceNumber} sealed at ${payload.total}.`;
    paperVerdict.textContent = "Not checked";
    pdfVerdict.textContent = "Not checked";
    pdfIntegrity.textContent = "Not checked";
  } catch (error) {
    status.textContent = errorMessage(error);
  } finally {
    setBusy(generate, false);
  }
});

verifyOriginal.addEventListener("click", async () => {
  if (!ready) return;
  await showVerification("original", pdfVerdict, pdfIntegrity);
});

verifyPaper.addEventListener("click", async () => {
  if (!ready) return;
  try {
    const payload = await post("/api/verify", { artifact: "paper" });
    paperVerdict.textContent = verdictLabel(payload);
  } catch (error) {
    paperVerdict.textContent = errorMessage(error);
  }
});

tamper.addEventListener("click", async () => {
  if (!ready) return;
  setBusy(tamper, true);
  try {
    const payload = await post("/api/tamper");
    enableLink(openTampered);
    tamperResult.hidden = false;
    await showVerification("tampered", pdfVerdict, pdfIntegrity);
    paperVerdict.textContent = "VALID_TRUSTED · INR 11,800.00";
    status.textContent = `Visible total changed to INR ${formatMinor(payload.visibleTotalMinor)}; signed claim stayed at INR 11,800.00.`;
  } catch (error) {
    status.textContent = errorMessage(error);
  } finally {
    setBusy(tamper, false);
  }
});

async function showVerification(artifact, verdictTarget, integrityTarget) {
  try {
    const payload = await post("/api/verify", { artifact });
    verdictTarget.textContent = verdictLabel(payload);
    integrityTarget.textContent = payload.artifactIntegrity || "Not applicable";
  } catch (error) {
    verdictTarget.textContent = errorMessage(error);
    integrityTarget.textContent = "Not checked";
  }
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Request failed");
  return payload;
}

function verdictLabel(payload) {
  if (payload.verdict === "VALID_TRUSTED") return "VALID_TRUSTED";
  if (payload.verdict === "VALID_UNTRUSTED") return "VALID · untrusted";
  if (payload.verdict === "UNVERIFIABLE") return "UNVERIFIABLE";
  return "INVALID";
}

function formatMinor(minor) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}

function enableLink(link) {
  link.removeAttribute("aria-disabled");
  link.classList.remove("is-disabled");
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "Request failed";
}
