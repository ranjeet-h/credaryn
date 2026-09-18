import {
  cameraUnavailableMessage,
  captureVideoFrame,
  extractBarcodeValue,
  isSupportedImageType,
  normalizeImageToPng,
  pickCameraConstraints,
  supportsBarcodeDetector,
} from "./camera.js";

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
const cameraStart = document.querySelector("#camera-start");
const cameraCapture = document.querySelector("#camera-capture");
const cameraStop = document.querySelector("#camera-stop");
const cameraVideo = document.querySelector("#camera");
const cameraNote = document.querySelector("#camera-note");

let activeStream;
let scanTimer;

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runVerify();
});

cameraStart?.addEventListener("click", () => { void startCamera(); });
cameraCapture?.addEventListener("click", () => { void capturePhoto(); });
cameraStop?.addEventListener("click", stopCamera);

async function runVerify() {
  submit.disabled = true;
  try {
    const file = fileInput.files[0];
    if (file !== undefined) {
      const prepared = await prepareSelectedFile(file);
      await submitEvidence(prepared.body, prepared.contentType);
    } else if (paperText.value.trim() !== "") {
      await submitEvidence(paperText.value.trim(), "text/vnd.credaryn.crd1");
    } else {
      throw new Error("Choose a file or paste CRD1 text.");
    }
  } catch (error) {
    showError(error);
  } finally {
    submit.disabled = false;
  }
}

async function prepareSelectedFile(file) {
  const contentType = file.type || (file.name.toLowerCase().endsWith(".png") ? "image/png" : "application/pdf");
  if (isSupportedImageType(contentType) && contentType !== "image/png") {
    const png = await normalizeImageToPng(file);
    return { body: await png.arrayBuffer(), contentType: "image/png" };
  }
  return { body: await file.arrayBuffer(), contentType };
}

async function submitEvidence(body, contentType) {
  const response = await fetch("/v1/verify", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || "Verification failed");
  renderResult(payload);
}

function renderResult(payload) {
  verdict.textContent = verdictLabel(payload);
  cryptographicValidity.textContent = payload.cryptographicValidity || "Not supplied";
  trustDecision.textContent = payload.trustDecision || "Not supplied";
  artifactIntegrity.textContent = payload.artifactIntegrity || "Not supplied";
  signedClaims.textContent = payload.signedClaims === undefined ? "Not supplied" : JSON.stringify(payload.signedClaims);
  lifecycleStatus.textContent = payload.lifecycleStatus || "Not supplied";
  securityMode.textContent = payload.securityMode || "Not supplied";
  result.textContent = JSON.stringify(payload, null, 2);
}

function showError(error) {
  verdict.textContent = "Unable to verify evidence";
  result.textContent = error instanceof Error ? error.message : "Verification failed";
}

async function startCamera() {
  if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
    cameraNote.textContent = "Camera capture is unavailable in this browser. Upload a photo instead.";
    return;
  }
  try {
    activeStream = await navigator.mediaDevices.getUserMedia(pickCameraConstraints());
    cameraVideo.srcObject = activeStream;
    cameraVideo.hidden = false;
    cameraStart.disabled = true;
    cameraStop.disabled = false;
    cameraNote.textContent = supportsBarcodeDetector()
      ? "Point the camera at the paper seal QR."
      : "Camera ready. Capture a photo to verify the seal.";
    if (supportsBarcodeDetector()) startBarcodeScan();
  } catch (error) {
    cameraNote.textContent = cameraUnavailableMessage(error);
  }
}

function stopCamera() {
  if (scanTimer !== undefined) {
    clearInterval(scanTimer);
    scanTimer = undefined;
  }
  if (activeStream !== undefined) {
    for (const track of activeStream.getTracks()) track.stop();
    activeStream = undefined;
  }
  cameraVideo.srcObject = null;
  cameraVideo.hidden = true;
  cameraStart.disabled = false;
  cameraStop.disabled = true;
}

function startBarcodeScan() {
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  scanTimer = setInterval(async () => {
    if (cameraVideo.readyState < 2) return;
    try {
      const value = extractBarcodeValue(await detector.detect(cameraVideo));
      if (value !== undefined) {
        stopCamera();
        paperText.value = value;
        await submitEvidence(value, "text/vnd.credaryn.crd1");
      }
    } catch {
      // Ignore transient frame-decoding errors and keep scanning.
    }
  }, 300);
}

async function capturePhoto() {
  try {
    const { canvas } = captureVideoFrame(cameraVideo);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => { blob ? resolve(blob) : reject(new Error("Unable to capture a camera frame")); }, "image/png");
    });
    stopCamera();
    await submitEvidence(await png.arrayBuffer(), "image/png");
  } catch (error) {
    showError(error);
  }
}

function verdictLabel(payload) {
  if (payload.verdict === "VALID_TRUSTED") return "VALID — trusted issuer";
  if (payload.verdict === "VALID_UNTRUSTED") return "VALID CRYPTOGRAPHY — issuer not trusted";
  if (payload.verdict === "UNVERIFIABLE") return "UNVERIFIABLE — trust material unavailable";
  return "INVALID";
}
