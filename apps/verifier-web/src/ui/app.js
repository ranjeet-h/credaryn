const form = document.querySelector("#verify-form");
const fileInput = document.querySelector("#file");
const paperText = document.querySelector("#paper-text");
const submit = document.querySelector("#submit");
const verdict = document.querySelector("#verdict");
const result = document.querySelector("#result");
const cryptographicValidity = document.querySelector("#cryptographic-validity");
const trustDecision = document.querySelector("#trust-decision");
const artifactIntegrity = document.querySelector("#artifact-integrity");
const signedClaims = document.querySelector("#signed-claims");
const lifecycleStatus = document.querySelector("#lifecycle-status");
const securityMode = document.querySelector("#security-mode");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submit.disabled = true;
  try {
    let body;
    let contentType;
    const file = fileInput.files[0];
    if (file !== undefined) {
      body = await file.arrayBuffer();
      contentType = file.type || (file.name.toLowerCase().endsWith(".png") ? "image/png" : "application/pdf");
    } else if (paperText.value.trim() !== "") {
      body = paperText.value.trim();
      contentType = "text/vnd.credaryn.crd1";
    } else {
      throw new Error("Choose a file or paste CRD1 text.");
    }
    const response = await fetch("/v1/verify", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "Verification failed");
    verdict.textContent = verdictLabel(payload);
    cryptographicValidity.textContent = payload.cryptographicValidity || "Not supplied";
    trustDecision.textContent = payload.trustDecision || "Not supplied";
    artifactIntegrity.textContent = payload.artifactIntegrity || "Not supplied";
    signedClaims.textContent = payload.signedClaims === undefined ? "Not supplied" : JSON.stringify(payload.signedClaims);
    lifecycleStatus.textContent = payload.lifecycleStatus || "Not supplied";
    securityMode.textContent = payload.securityMode || "Not supplied";
    result.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    verdict.textContent = "Unable to verify evidence";
    result.textContent = error instanceof Error ? error.message : "Verification failed";
  } finally {
    submit.disabled = false;
  }
});

function verdictLabel(payload) {
  if (payload.verdict === "VALID_TRUSTED") return "VALID — trusted issuer";
  if (payload.verdict === "VALID_UNTRUSTED") return "VALID CRYPTOGRAPHY — issuer not trusted";
  if (payload.verdict === "UNVERIFIABLE") return "UNVERIFIABLE — trust material unavailable";
  return "INVALID";
}
