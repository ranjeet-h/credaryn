package com.credaryn.dss;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

public final class DssBoundaryApplication {
    private static final int MAX_REQUEST_BYTES = 2 * 1024 * 1024;
    private static final String DSS_VERSION = System.getenv().getOrDefault("DSS_VERSION", "6.5");

    private DssBoundaryApplication() {
    }

    public static void main(String[] args) throws IOException {
        boolean dssLoaded = isDssLoaded();
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", 8080), 0);
        server.createContext("/health", exchange -> health(exchange, dssLoaded));
        server.createContext("/v1/probe", DssBoundaryApplication::probe);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
    }

    private static boolean isDssLoaded() {
        try {
            Class.forName("eu.europa.esig.dss.pades.signature.PAdESService");
            return true;
        } catch (ClassNotFoundException exception) {
            return false;
        }
    }

    private static void health(HttpExchange exchange, boolean dssLoaded) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, "{\"error\":\"method_not_allowed\"}");
            return;
        }
        int status = dssLoaded ? 200 : 503;
        String body = String.format(
                "{\"status\":\"%s\",\"engine\":\"DSS\",\"version\":\"%s\",\"padesClassLoaded\":%s}",
                dssLoaded ? "ready" : "unavailable", DSS_VERSION, dssLoaded);
        respond(exchange, status, body);
    }

    private static void probe(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, "{\"error\":\"method_not_allowed\"}");
            return;
        }
        byte[] request = readBounded(exchange.getRequestBody());
        String body = new String(request, StandardCharsets.UTF_8);
        if (!body.contains("\"operation\"") || !body.contains("\"pdfBase64\"") || !body.contains("\"signatureRequest\"")) {
            respond(exchange, 400, "{\"error\":\"normalized_probe_request_required\"}");
            return;
        }
        respond(exchange, 200, String.format(
                "{\"status\":\"accepted\",\"engine\":\"DSS\",\"version\":\"%s\",\"inputBytes\":%d}",
                DSS_VERSION, request.length));
    }

    private static byte[] readBounded(InputStream input) throws IOException {
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        try (input) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_REQUEST_BYTES) {
                    throw new IOException("request too large");
                }
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (var output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
}
