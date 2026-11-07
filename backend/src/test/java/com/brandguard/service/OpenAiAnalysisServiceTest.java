package com.brandguard.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.brandguard.api.ApiModels.RuleView;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class OpenAiAnalysisServiceTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicReference<String> responseContent = new AtomicReference<>();
    private final AtomicReference<JsonNode> lastRequest = new AtomicReference<>();
    private final AtomicReference<String> lastAuthorization = new AtomicReference<>();
    private HttpServer server;
    private OpenAiAnalysisService service;

    @BeforeEach
    void startStubProvider() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat/completions", exchange -> {
            lastRequest.set(objectMapper.readTree(exchange.getRequestBody()));
            lastAuthorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] body = objectMapper.writeValueAsBytes(Map.of(
                    "choices", List.of(Map.of("message", Map.of("content", responseContent.get())))));
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        service = new OpenAiAnalysisService(objectMapper, "test-secret", "test-model",
                "http://127.0.0.1:" + server.getAddress().getPort() + "/v1");
    }

    @AfterEach
    void stopStubProvider() {
        server.stop(0);
    }

    @Test
    void returnsOnlyFindingsWithKnownSourcesAndVerbatimDraftExcerpts() throws Exception {
        responseContent.set(objectMapper.writeValueAsString(Map.of("findings", List.of(
                Map.of("sourceId", "fact-018", "excerpt", "guarantees job placement")))));
        String draft = "Our school guarantees job placement for every graduate.";

        var findings = service.analyze(draft, approvedRules());

        assertEquals(List.of(new OpenAiAnalysisService.AnalyzedFinding("fact-018", "guarantees job placement")), findings);
        assertEquals("Bearer test-secret", lastAuthorization.get());
        assertEquals("test-model", lastRequest.get().path("model").asText());
        assertEquals(draft, lastRequest.get().path("messages").path(1).path("content").asText());
        assertEquals("json_schema", lastRequest.get().path("response_format").path("type").asText());
    }

    @Test
    void rejectsUnknownSourcesAndExcerptsNotPresentInTheDraft() throws Exception {
        responseContent.set(objectMapper.writeValueAsString(Map.of("findings", List.of(
                Map.of("sourceId", "unapproved-source", "excerpt", "invented claim")))));

        assertThrows(AiAnalysisException.class,
                () -> service.analyze("A harmless draft.", approvedRules()));
    }

    @Test
    void refusesToCallProviderWithoutAnApiKey() throws Exception {
        OpenAiAnalysisService unconfigured = new OpenAiAnalysisService(objectMapper, "", "test-model",
                "http://127.0.0.1:" + server.getAddress().getPort() + "/v1");

        assertThrows(AiAnalysisException.class,
                () -> unconfigured.analyze("A draft.", approvedRules()));
    }

    private static List<RuleView> approvedRules() {
        return List.of(new RuleView("fact-018", "FACT_CONFLICT", "Factual conflict", "HIGH",
                "guarantee 100% job placement", "The claim conflicts with the approved fact.",
                "No placement guarantee is offered.", "provides career guidance"));
    }
}
