package com.brandguard.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ApiModels {
    private ApiModels() {}

    public enum Role { CREATOR, REVIEWER, BRAND_ADMIN, MANAGER }
    public enum Severity { HIGH, MEDIUM, LOW }

    public record Caller(UUID id, String email, Role role, UUID brandId) {}
    public record UserView(UUID id, String email, Role role, UUID brandId) {}
    public record AuthRequest(@Email @NotBlank String email, @NotBlank String password) {}
    public record RegisterRequest(@Email @NotBlank String email, @Size(min = 12, max = 100) String password) {}
    public record AuthResponse(String token, UserView user) {}
    public record BrandView(UUID id, String name, String guidelineVersion) {}
    public record RuleView(String sourceId, String kind, String category, String severity, String matchText, String explanation, String evidenceText, String suggestion) {}
    public record RuleUpsertRequest(
            @NotBlank @Pattern(regexp = "[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}") String sourceId,
            @NotBlank @Pattern(regexp = "FACT_CONFLICT|TERMINOLOGY|RULE_VIOLATION|STYLE") String kind,
            @NotBlank @Size(max = 80) String category,
            @NotBlank @Pattern(regexp = "HIGH|MEDIUM|LOW") String severity,
            @NotBlank @Size(max = 500) String matchText,
            @NotBlank @Size(max = 10000) String explanation,
            @NotBlank @Size(max = 500) String suggestion,
            @NotBlank @Size(max = 10000) String evidenceText) {}
    public record SubmissionRequest(@NotBlank @Size(max = 240) String title, @NotBlank @Size(max = 50000) String content) {}
    public record RevisionRequest(@NotBlank @Size(max = 50000) String content) {}
    public record DecisionRequest(@NotBlank String decision, @NotBlank @Size(max = 2000) String reason) {}
    public record FindingStateRequest(@NotBlank String state, @Size(max = 2000) String reason) {}
    public record EvidenceView(String sourceId, String evidenceText) {}
    public record FindingView(UUID id, String category, String label, String severity, String excerpt, String explanation, EvidenceView evidence, String suggestedText, String state) {}
    public record DecisionView(String decision, String reason, String reviewerEmail, Instant createdAt) {}
    public record SubmissionView(UUID id, String title, String content, String status, int versionNo, String guidelineVersion, String creatorEmail, Instant createdAt, List<FindingView> findings, List<DecisionView> decisions) {}
    public record ApiError(String code, String message) {}
}
