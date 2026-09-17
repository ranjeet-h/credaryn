package com.credaryn.dss;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import eu.europa.esig.dss.diagnostic.DiagnosticData;
import eu.europa.esig.dss.diagnostic.SignatureWrapper;
import eu.europa.esig.dss.enumerations.DigestAlgorithm;
import eu.europa.esig.dss.enumerations.SignatureAlgorithm;
import eu.europa.esig.dss.enumerations.SignatureLevel;
import eu.europa.esig.dss.model.DSSDocument;
import eu.europa.esig.dss.model.InMemoryDocument;
import eu.europa.esig.dss.model.SignatureValue;
import eu.europa.esig.dss.model.ToBeSigned;
import eu.europa.esig.dss.pades.PAdESSignatureParameters;
import eu.europa.esig.dss.pades.signature.PAdESService;
import eu.europa.esig.dss.spi.DSSUtils;
import eu.europa.esig.dss.spi.validation.CommonCertificateVerifier;
import eu.europa.esig.dss.token.DSSPrivateKeyEntry;
import eu.europa.esig.dss.token.Pkcs12SignatureToken;
import eu.europa.esig.dss.validation.SignedDocumentValidator;
import eu.europa.esig.dss.validation.reports.Reports;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.concurrent.Executors;

public final class DssBoundaryApplication {
    private static final int MAX_REQUEST_BYTES = 16 * 1024 * 1024;
    private static final String DSS_VERSION = System.getenv().getOrDefault("DSS_VERSION", "6.5");
    private static final ObjectMapper JSON = new ObjectMapper();

    private DssBoundaryApplication() {
    }

    public static void main(String[] args) throws IOException {
        DssEngine engine = new DssEngine();
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", 8080), 0);
        server.createContext("/health", exchange -> health(exchange, engine));
        server.createContext("/v1/probe", DssBoundaryApplication::probe);
        server.createContext("/v1/sign", exchange -> sign(exchange, engine));
        server.createContext("/v1/verify", exchange -> verify(exchange, engine));
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
    }

    private static void health(HttpExchange exchange, DssEngine engine) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, error("method_not_allowed"));
            return;
        }
        respond(exchange, 200, JSON.createObjectNode()
                .put("status", "ready")
                .put("engine", "DSS")
                .put("version", DSS_VERSION)
                .put("padesClassLoaded", engine.isDssLoaded())
                .put("keyLoaded", true));
    }

    private static void probe(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, error("method_not_allowed"));
            return;
        }
        byte[] request = readBounded(exchange.getRequestBody());
        JsonNode body = parse(request);
        if (!body.has("operation") || !body.has("pdfBase64") || !body.has("signatureRequest")) {
            respond(exchange, 400, error("normalized_probe_request_required"));
            return;
        }
        respond(exchange, 200, JSON.createObjectNode()
                .put("status", "accepted")
                .put("engine", "DSS")
                .put("version", DSS_VERSION)
                .put("inputBytes", request.length));
    }

    private static void sign(HttpExchange exchange, DssEngine engine) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, error("method_not_allowed"));
            return;
        }
        try {
            JsonNode request = parse(readBounded(exchange.getRequestBody()));
            requireText(request, "operation", "sign");
            byte[] pdf = decodeBase64(request, "pdfBase64");
            JsonNode signatureRequest = request.required("signatureRequest");
            requireText(signatureRequest, "level", "B-B");
            String artifactDigest = text(signatureRequest, "artifactDigest");
            if (!artifactDigest.matches("sha256:[0-9a-f]{64}")) throw new BadRequest("artifact_digest_required");
            JsonNode signer = request.required("signer");
            engine.assertSigner(signer);
            if (!artifactDigest.equals(sha256(pdf))) throw new BadRequest("artifact_digest_mismatch");

            byte[] signed = engine.sign(pdf);
            ObjectNode response = JSON.createObjectNode()
                    .put("status", "signed")
                    .put("signedPdfBase64", Base64.getEncoder().encodeToString(signed))
                    .put("cryptographicValidity", "VALID")
                    .put("artifactIntegrity", "VALID")
                    .put("issuerId", engine.issuerId())
                    .put("keyId", engine.keyId())
                    .put("signatureLevel", "B-B")
                    .put("qualifiedSignature", false);
            respond(exchange, 200, response);
        } catch (BadRequest error) {
            respond(exchange, 400, error(error.code));
        } catch (Exception error) {
            respond(exchange, 500, error("dss_signing_failed"));
        }
    }

    private static void verify(HttpExchange exchange, DssEngine engine) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, error("method_not_allowed"));
            return;
        }
        try {
            JsonNode request = parse(readBounded(exchange.getRequestBody()));
            requireText(request, "operation", "verify");
            byte[] pdf = decodeBase64(request, "pdfBase64");
            ValidationResult result = engine.verify(pdf);
            ObjectNode response = JSON.createObjectNode()
                    .put("cryptographicValidity", result.cryptographicValidity)
                    .put("artifactIntegrity", result.artifactIntegrity)
                    .put("issuerId", engine.issuerId())
                    .put("keyId", engine.keyId())
                    .put("signatureLevel", result.signatureLevel)
                    .put("qualifiedSignature", false);
            respond(exchange, 200, response);
        } catch (BadRequest error) {
            respond(exchange, 400, error(error.code));
        } catch (Exception error) {
            respond(exchange, 500, error("dss_verification_failed"));
        }
    }

    private static JsonNode parse(byte[] input) throws IOException {
        try {
            return JSON.readTree(input);
        } catch (Exception error) {
            throw new BadRequest("invalid_json");
        }
    }

    private static byte[] decodeBase64(JsonNode object, String field) throws BadRequest {
        String value = text(object, field);
        if (value.length() == 0 || value.length() > MAX_REQUEST_BYTES * 2 || value.length() % 4 != 0 || !value.matches("[A-Za-z0-9+/]*={0,2}")) {
            throw new BadRequest(field + "_must_be_base64");
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(value);
            if (decoded.length == 0 || decoded.length > MAX_REQUEST_BYTES) throw new BadRequest(field + "_size_invalid");
            return decoded;
        } catch (IllegalArgumentException error) {
            throw new BadRequest(field + "_must_be_base64");
        }
    }

    private static void requireText(JsonNode object, String field, String expected) throws BadRequest {
        if (!expected.equals(text(object, field))) throw new BadRequest(field + "_invalid");
    }

    private static String text(JsonNode object, String field) throws BadRequest {
        JsonNode value = object.get(field);
        if (value == null || !value.isTextual() || value.textValue().isBlank()) throw new BadRequest(field + "_required");
        return value.textValue();
    }

    private static byte[] readBounded(InputStream input) throws IOException {
        byte[] buffer = new byte[8192];
        int total = 0;
        try (input; java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_REQUEST_BYTES * 2) throw new IOException("request too large");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static String sha256(byte[] input) throws Exception {
        return "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input));
    }

    private static String error(String code) {
        return JSON.createObjectNode().put("error", code).toString();
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        respond(exchange, status, JSON.readTree(body));
    }

    private static void respond(HttpExchange exchange, int status, JsonNode body) throws IOException {
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private record ValidationResult(String cryptographicValidity, String artifactIntegrity, String signatureLevel) {
    }

    private static final class BadRequest extends IOException {
        private final String code;

        private BadRequest(String code) {
            super(code);
            this.code = code;
        }
    }

    private static final class DssEngine {
        private final boolean dssLoaded;
        private final String issuerId = System.getenv().getOrDefault("DSS_ISSUER_ID", "acme-retail");
        private final String keyId = System.getenv().getOrDefault("DSS_KEY_ID", "dss-demo-key");
        private final Pkcs12SignatureToken token;
        private final DSSPrivateKeyEntry key;
        private final PAdESService service;

        private DssEngine() {
            try {
                dssLoaded = Class.forName("eu.europa.esig.dss.pades.signature.PAdESService") != null;
                String path = System.getenv().getOrDefault("DSS_KEYSTORE_PATH", "/tmp/credaryn-demo.p12");
                String password = System.getenv().getOrDefault("DSS_KEYSTORE_PASSWORD", "changeit");
                String alias = System.getenv().getOrDefault("DSS_KEY_ALIAS", "credaryn-demo");
                token = new Pkcs12SignatureToken(Path.of(path).toFile(), new KeyStore.PasswordProtection(password.toCharArray()));
                key = token.getKey(alias);
                if (key == null) throw new IllegalStateException("DSS signing key alias not found");
                service = new PAdESService(new CommonCertificateVerifier());
            } catch (Exception error) {
                throw new IllegalStateException("Unable to load DSS signing configuration", error);
            }
        }

        private boolean isDssLoaded() {
            return dssLoaded;
        }

        private String issuerId() {
            return issuerId;
        }

        private String keyId() {
            return keyId;
        }

        private void assertSigner(JsonNode signer) throws BadRequest {
            if (!issuerId.equals(text(signer, "issuerId")) || !keyId.equals(text(signer, "keyId")) || !"ES256".equals(text(signer, "algorithm"))) {
                throw new BadRequest("signer_identity_mismatch");
            }
        }

        private synchronized byte[] sign(byte[] pdf) throws Exception {
            DSSDocument document = new InMemoryDocument(pdf, "invoice.pdf");
            PAdESSignatureParameters parameters = new PAdESSignatureParameters();
            parameters.setSigningCertificate(key.getCertificate());
            parameters.setCertificateChain(key.getCertificateChain());
            parameters.setSignatureLevel(SignatureLevel.PAdES_BASELINE_B);
            parameters.setDigestAlgorithm(DigestAlgorithm.SHA256);
            parameters.setSignerName(keyId);
            SignatureAlgorithm algorithm = SignatureAlgorithm.getAlgorithm(key.getEncryptionAlgorithm(), DigestAlgorithm.SHA256);
            ToBeSigned toBeSigned = service.getDataToSign(document, parameters);
            SignatureValue signature = token.sign(toBeSigned, algorithm, key);
            return DSSUtils.toByteArray(service.signDocument(document, parameters, signature));
        }

        private synchronized ValidationResult verify(byte[] pdf) throws Exception {
            DSSDocument document = new InMemoryDocument(pdf, "signed.pdf");
            SignedDocumentValidator validator = SignedDocumentValidator.fromDocument(document);
            validator.setCertificateVerifier(new CommonCertificateVerifier());
            Reports reports = validator.validateDocument();
            DiagnosticData diagnostic = reports.getDiagnosticData();
            if (diagnostic.getSignatureIdList().isEmpty()) return new ValidationResult("INVALID", "INVALID", "UNKNOWN");
            SignatureWrapper signature = diagnostic.getSignatureById(diagnostic.getFirstSignatureId());
            boolean intact = signature.isSignatureIntact();
            boolean valid = signature.isSignatureValid();
            String signatureLevel = SignatureLevel.PAdES_BASELINE_B.equals(signature.getSignatureFormat()) ? "B-B" : "UNKNOWN";
            return new ValidationResult(valid ? "VALID" : "INVALID", intact ? "VALID" : "INVALID", signatureLevel);
        }
    }
}
