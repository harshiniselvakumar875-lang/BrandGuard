package com.brandguard.service;

import com.brandguard.api.ApiModels.ApiError;
import com.brandguard.api.ApiModels.AuthResponse;
import com.brandguard.api.ApiModels.BrandView;
import com.brandguard.api.ApiModels.Caller;
import com.brandguard.api.ApiModels.DecisionView;
import com.brandguard.api.ApiModels.EvidenceView;
import com.brandguard.api.ApiModels.FindingView;
import com.brandguard.api.ApiModels.RegisterRequest;
import com.brandguard.api.ApiModels.Role;
import com.brandguard.api.ApiModels.RuleView;
import com.brandguard.api.ApiModels.RuleUpsertRequest;
import com.brandguard.api.ApiModels.SubmissionRequest;
import com.brandguard.api.ApiModels.SubmissionView;
import com.brandguard.api.ApiModels.UserView;
import com.brandguard.security.JwtService;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PlatformService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final OpenAiAnalysisService openAiAnalysisService;
    private final String analysisProvider;

    public PlatformService(
            JdbcTemplate jdbc,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            OpenAiAnalysisService openAiAnalysisService,
            @org.springframework.beans.factory.annotation.Value("${app.analysis.provider:rules}") String analysisProvider) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.openAiAnalysisService = openAiAnalysisService;
        this.analysisProvider = analysisProvider;
        if (!List.of("rules", "openai").contains(analysisProvider)) {
            throw new IllegalArgumentException("ANALYSIS_PROVIDER must be either 'rules' or 'openai'.");
        }
    }

    public AuthResponse login(String email, String password) {
        UserRow user;
        try {
            user = jdbc.queryForObject("SELECT id, email, password_hash, role, brand_id FROM app_user WHERE email = ?", USER_ROW, email.toLowerCase(Locale.ROOT));
        } catch (EmptyResultDataAccessException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        }
        if (user == null || !passwordEncoder.matches(password, user.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        }
        UserView view = toUserView(user);
        return new AuthResponse(jwtService.issue(view), view);
    }

    @Transactional
    public AuthResponse register(String email, String password) {
        String normalizedEmail = email.toLowerCase(Locale.ROOT);
        Integer count = jdbc.queryForObject("SELECT count(*) FROM app_user WHERE email = ?", Integer.class, normalizedEmail);
        if (count != null && count > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists.");
        UUID id = UUID.randomUUID();
        UUID brandId = UUID.fromString("10000000-0000-0000-0000-000000000001");
        jdbc.update("INSERT INTO app_user (id, email, password_hash, role, brand_id) VALUES (?, ?, ?, 'CREATOR', ?)",
                dbId(id), normalizedEmail, passwordEncoder.encode(password), dbId(brandId));
        writeAudit(id, "ACCOUNT_REGISTERED", id, "Creator account registered");
        return login(normalizedEmail, password);
    }

    public UserView profile(Caller caller) {
        return new UserView(caller.id(), caller.email(), caller.role(), caller.brandId());
    }

    public BrandView currentBrand(Caller caller) {
        return jdbc.queryForObject("SELECT id, name, guideline_version FROM brand WHERE id = ?",
                (rs, row) -> new BrandView(readId(rs, "id"), rs.getString("name"), rs.getString("guideline_version")), dbId(caller.brandId()));
    }

    public List<RuleView> currentRules(Caller caller) {
        return listRules(caller);
    }

    @Transactional
    public List<RuleView> createRule(Caller caller, RuleUpsertRequest request) {
        requireBrandAdmin(caller);
        jdbc.update("""
                INSERT INTO brand_rule (id, brand_id, source_id, kind, category, severity, match_text, explanation, suggestion, evidence_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID().toString(), dbId(caller.brandId()), request.sourceId(), request.kind(),
                request.category().trim(), request.severity(), request.matchText().trim(), request.explanation().trim(),
                request.suggestion().trim(), request.evidenceText().trim());
        incrementGuidelineVersion(caller.brandId());
        writeAudit(caller.id(), "BRAND_RULE_CREATED", caller.brandId(), "Created source " + request.sourceId());
        return listRules(caller);
    }

    @Transactional
    public List<RuleView> updateRule(Caller caller, String sourceId, RuleUpsertRequest request) {
        requireBrandAdmin(caller);
        if (!sourceId.equals(request.sourceId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Source ID cannot be changed when editing a rule.");
        }
        int updated = jdbc.update("""
                UPDATE brand_rule SET kind = ?, category = ?, severity = ?, match_text = ?, explanation = ?, suggestion = ?, evidence_text = ?
                WHERE brand_id = ? AND source_id = ? AND active = true
                """, request.kind(), request.category().trim(), request.severity(), request.matchText().trim(),
                request.explanation().trim(), request.suggestion().trim(), request.evidenceText().trim(),
                dbId(caller.brandId()), sourceId);
        if (updated == 0) notFound();
        incrementGuidelineVersion(caller.brandId());
        writeAudit(caller.id(), "BRAND_RULE_UPDATED", caller.brandId(), "Updated source " + sourceId);
        return listRules(caller);
    }

    @Transactional
    public List<RuleView> archiveRule(Caller caller, String sourceId) {
        requireBrandAdmin(caller);
        int updated = jdbc.update("""
                UPDATE brand_rule SET active = false WHERE brand_id = ? AND source_id = ? AND active = true
                """, dbId(caller.brandId()), sourceId);
        if (updated == 0) notFound();
        incrementGuidelineVersion(caller.brandId());
        writeAudit(caller.id(), "BRAND_RULE_ARCHIVED", caller.brandId(), "Archived source " + sourceId);
        return listRules(caller);
    }

    private List<RuleView> listRules(Caller caller) {
        return jdbc.query("""
                SELECT source_id, kind, category, severity, match_text, explanation, evidence_text, suggestion
                FROM brand_rule WHERE brand_id = ? AND active = true ORDER BY source_id
                """, (rs, row) -> new RuleView(rs.getString("source_id"), rs.getString("kind"),
                rs.getString("category"), rs.getString("severity"), rs.getString("match_text"),
                rs.getString("explanation"), rs.getString("evidence_text"), rs.getString("suggestion")), dbId(caller.brandId()));
    }

    private void incrementGuidelineVersion(UUID brandId) {
        String current = jdbc.queryForObject("SELECT guideline_version FROM brand WHERE id = ?", String.class, dbId(brandId));
        if (current == null || !current.matches("v[0-9]+")) {
            throw new IllegalStateException("Cannot increment an invalid brand guideline version.");
        }
        int next = Integer.parseInt(current.substring(1)) + 1;
        jdbc.update("UPDATE brand SET guideline_version = ? WHERE id = ?", "v" + next, dbId(brandId));
    }

    private static void requireBrandAdmin(Caller caller) {
        if (caller.role() != Role.BRAND_ADMIN) deny();
    }

    @Transactional
    public SubmissionView createSubmission(Caller caller, SubmissionRequest request) {
        if (caller.role() != Role.CREATOR && caller.role() != Role.BRAND_ADMIN) deny();
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO submission (id, brand_id, creator_id, title, content_text, status, version_no)
                VALUES (?, ?, ?, ?, ?, 'SUBMITTED', 1)
                """, dbId(id), dbId(caller.brandId()), dbId(caller.id()), request.title().trim(), request.content().trim());
        jdbc.update("INSERT INTO content_version (id, submission_id, version_no, content_text, changed_by) VALUES (?, ?, 1, ?, ?)",
                UUID.randomUUID().toString(), dbId(id), request.content().trim(), dbId(caller.id()));
        writeAudit(caller.id(), "CONTENT_SUBMITTED", id, "Version 1 submitted");
        return getSubmission(caller, id);
    }

    public List<SubmissionView> listSubmissions(Caller caller) {
        List<SubmissionRow> rows;
        if (caller.role() == Role.CREATOR) {
            rows = jdbc.query("""
                    SELECT id, title, content_text, status, version_no, guideline_version, created_at, creator_id
                    FROM submission WHERE brand_id = ? AND creator_id = ? ORDER BY created_at DESC
                    """, SUBMISSION_ROW, dbId(caller.brandId()), dbId(caller.id()));
        } else {
            rows = jdbc.query("""
                    SELECT id, title, content_text, status, version_no, guideline_version, created_at, creator_id
                    FROM submission WHERE brand_id = ? ORDER BY created_at DESC
                    """, SUBMISSION_ROW, dbId(caller.brandId()));
        }
        return rows.stream().map(row -> toView(row, caller)).toList();
    }

    public SubmissionView getSubmission(Caller caller, UUID id) {
        SubmissionRow row = loadSubmission(caller, id);
        return toView(row, caller);
    }

    @Transactional
    public SubmissionView analyze(Caller caller, UUID id) {
        SubmissionRow submission = loadSubmission(caller, id);
        if (caller.role() == Role.CREATOR && !submission.creatorId().equals(caller.id())) deny();
        if (submission.status().equals("APPROVED") || submission.status().equals("REJECTED")) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A completed submission cannot be re-analysed.");
        }
        jdbc.update("UPDATE submission SET status = 'ANALYSING', updated_at = now() WHERE id = ?", dbId(id));
        jdbc.update("DELETE FROM finding WHERE submission_id = ?", dbId(id));
        List<RuleRow> rules = jdbc.query("""
                SELECT id, source_id, kind, category, severity, match_text, explanation, suggestion, evidence_text
                FROM brand_rule WHERE brand_id = ? AND active = true ORDER BY source_id
                """, RULE_ROW, dbId(caller.brandId()));
        String lowerContent = submission.content().toLowerCase(Locale.ROOT);
        boolean blockingFinding = false;
        if (analysisProvider.equals("openai")) {
            List<RuleView> approvedRules = rules.stream().map(rule -> new RuleView(
                    rule.sourceId(), rule.kind(), rule.category(), rule.severity(), rule.matchText(),
                    rule.explanation(), rule.evidenceText(), rule.suggestion())).toList();
            List<OpenAiAnalysisService.AnalyzedFinding> matches = openAiAnalysisService.analyze(submission.content(), approvedRules);
            for (OpenAiAnalysisService.AnalyzedFinding match : matches) {
                RuleRow rule = rules.stream().filter(item -> item.sourceId().equals(match.sourceId())).findFirst()
                        .orElseThrow(() -> new AiAnalysisException("OpenAI returned an unknown approved source."));
                insertFinding(id, rule, match.excerpt());
                if (!rule.severity().equals("LOW")) blockingFinding = true;
            }
        } else {
            for (RuleRow rule : rules) {
                String lowerMatch = rule.matchText().toLowerCase(Locale.ROOT);
                int excerptStart = lowerContent.indexOf(lowerMatch);
                if (excerptStart < 0) continue;
                String excerpt = submission.content().substring(excerptStart, excerptStart + rule.matchText().length());
                insertFinding(id, rule, excerpt);
                if (!rule.severity().equals("LOW")) blockingFinding = true;
            }
        }
        String status = blockingFinding ? "NEEDS_CHANGES" : "IN_REVIEW";
        String guidelineVersion = currentBrand(caller).guidelineVersion();
        jdbc.update("UPDATE submission SET status = ?, guideline_version = ?, updated_at = now() WHERE id = ?", status, guidelineVersion, dbId(id));
        writeAudit(caller.id(), "ANALYSIS_COMPLETED", id, analysisProvider + " analysis used guideline " + guidelineVersion);
        return getSubmission(caller, id);
    }

    private void insertFinding(UUID submissionId, RuleRow rule, String excerpt) {
        String label = switch (rule.kind()) {
            case "FACT_CONFLICT" -> "CONFIRMED_CONFLICT";
            case "TERMINOLOGY" -> "TERMINOLOGY";
            case "RULE_VIOLATION" -> "RULE_VIOLATION";
            default -> "STYLE_SUGGESTION";
        };
        jdbc.update("""
                INSERT INTO finding (id, submission_id, rule_id, category, label, severity, excerpt, explanation, suggested_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID().toString(), dbId(submissionId), dbId(rule.id()), rule.category(),
                label, rule.severity(), excerpt, rule.explanation(), rule.suggestion());
    }

    @Transactional
    public SubmissionView revise(Caller caller, UUID id, String content) {
        SubmissionRow current = loadSubmission(caller, id);
        if (caller.role() != Role.CREATOR || !current.creatorId().equals(caller.id())) deny();
        if (!current.status().equals("NEEDS_CHANGES")) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only submissions needing changes can be revised.");
        }
        int nextVersion = current.versionNo() + 1;
        jdbc.update("UPDATE submission SET content_text = ?, status = 'SUBMITTED', version_no = ?, updated_at = now() WHERE id = ?",
                content.trim(), nextVersion, dbId(id));
        jdbc.update("DELETE FROM finding WHERE submission_id = ?", dbId(id));
        jdbc.update("INSERT INTO content_version (id, submission_id, version_no, content_text, changed_by) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID().toString(), dbId(id), nextVersion, content.trim(), dbId(caller.id()));
        writeAudit(caller.id(), "CONTENT_REVISED", id, "Version " + nextVersion + " saved");
        return getSubmission(caller, id);
    }

    @Transactional
    public SubmissionView decide(Caller caller, UUID id, String decision, String reason) {
        if (caller.role() != Role.REVIEWER && caller.role() != Role.BRAND_ADMIN) deny();
        SubmissionRow submission = loadSubmission(caller, id);
        if (!List.of("APPROVE", "REQUEST_CHANGES", "REJECT").contains(decision)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Decision must be APPROVE, REQUEST_CHANGES, or REJECT.");
        }
        if (!List.of("IN_REVIEW", "NEEDS_CHANGES").contains(submission.status())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This submission is not ready for a review decision.");
        }
        String nextStatus = switch (decision) {
            case "APPROVE" -> "APPROVED";
            case "REQUEST_CHANGES" -> "NEEDS_CHANGES";
            default -> "REJECTED";
        };
        jdbc.update("INSERT INTO review_decision (id, submission_id, reviewer_id, decision, reason) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID().toString(), dbId(id), dbId(caller.id()), decision, reason.trim());
        jdbc.update("UPDATE submission SET status = ?, updated_at = now() WHERE id = ?", nextStatus, dbId(id));
        writeAudit(caller.id(), "REVIEW_DECISION", id, decision + ": " + reason.trim());
        return getSubmission(caller, id);
    }

    @Transactional
    public SubmissionView updateFinding(Caller caller, UUID findingId, String state, String reason) {
        if (!List.of("ACCEPTED", "DISMISSED").contains(state)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Finding state must be ACCEPTED or DISMISSED.");
        }
        UUID submissionId;
        UUID creatorId;
        try {
            var row = jdbc.queryForMap("""
                    SELECT f.submission_id, s.creator_id, s.brand_id
                    FROM finding f JOIN submission s ON s.id = f.submission_id WHERE f.id = ?
                    """, dbId(findingId));
            submissionId = UUID.fromString((String) row.get("submission_id"));
            creatorId = UUID.fromString((String) row.get("creator_id"));
            if (!caller.brandId().equals(UUID.fromString((String) row.get("brand_id")))) notFound();
        } catch (EmptyResultDataAccessException exception) {
            notFound();
            return null;
        }
        if (caller.role() == Role.CREATOR && !creatorId.equals(caller.id())) deny();
        jdbc.update("UPDATE finding SET state = ? WHERE id = ?", state, dbId(findingId));
        writeAudit(caller.id(), "FINDING_" + state, findingId, reason == null ? "" : reason.trim());
        return getSubmission(caller, submissionId);
    }

    private SubmissionRow loadSubmission(Caller caller, UUID id) {
        SubmissionRow row;
        try {
            row = jdbc.queryForObject("""
                    SELECT id, title, content_text, status, version_no, guideline_version, created_at, creator_id
                    FROM submission WHERE id = ? AND brand_id = ?
                    """, SUBMISSION_ROW, dbId(id), dbId(caller.brandId()));
        } catch (EmptyResultDataAccessException exception) {
            notFound();
            return null;
        }
        if (caller.role() == Role.CREATOR && !row.creatorId().equals(caller.id())) notFound();
        return row;
    }

    private SubmissionView toView(SubmissionRow row, Caller caller) {
        List<FindingView> findings = jdbc.query("""
                SELECT f.id, f.category, f.label, f.severity, f.excerpt, f.explanation,
                       f.suggested_text, f.state, r.source_id, r.evidence_text
                FROM finding f LEFT JOIN brand_rule r ON r.id = f.rule_id
                WHERE f.submission_id = ? ORDER BY CASE f.severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, f.created_at
                """, (rs, index) -> new FindingView(
                readId(rs, "id"), rs.getString("category"), rs.getString("label"),
                rs.getString("severity"), rs.getString("excerpt"), rs.getString("explanation"),
                rs.getString("source_id") == null ? null : new EvidenceView(rs.getString("source_id"), rs.getString("evidence_text")),
                rs.getString("suggested_text"), rs.getString("state")), dbId(row.id()));
        List<DecisionView> decisions = jdbc.query("""
                SELECT d.decision, d.reason, u.email AS reviewer_email, d.created_at
                FROM review_decision d JOIN app_user u ON u.id = d.reviewer_id
                WHERE d.submission_id = ? ORDER BY d.created_at DESC
                """, (rs, index) -> new DecisionView(rs.getString("decision"), rs.getString("reason"),
                rs.getString("reviewer_email"), instant(rs.getTimestamp("created_at"))), dbId(row.id()));
        String creatorEmail = jdbc.queryForObject("SELECT email FROM app_user WHERE id = ?", String.class, dbId(row.creatorId()));
        return new SubmissionView(row.id(), row.title(), row.content(), row.status(), row.versionNo(),
                row.guidelineVersion(), creatorEmail, row.createdAt(), findings, decisions);
    }

    private void writeAudit(UUID actorId, String action, UUID targetId, String details) {
        jdbc.update("INSERT INTO audit_event (id, actor_id, action, target_id, details) VALUES (?, ?, ?, ?, ?)",
                UUID.randomUUID().toString(), dbId(actorId), action, dbId(targetId), details);
    }

    private static UserView toUserView(UserRow row) {
        return new UserView(row.id(), row.email(), Role.valueOf(row.role()), row.brandId());
    }

    private static void deny() {
        throw new org.springframework.security.access.AccessDeniedException("You do not have permission to perform this action.");
    }

    private static void notFound() {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "The requested resource was not found.");
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static String dbId(UUID value) {
        return value.toString();
    }

    private static UUID readId(ResultSet resultSet, String column) throws SQLException {
        String value = resultSet.getString(column);
        return value == null ? null : UUID.fromString(value);
    }

    private static final RowMapper<UserRow> USER_ROW = (rs, row) -> new UserRow(
            readId(rs, "id"), rs.getString("email"), rs.getString("password_hash"),
            rs.getString("role"), readId(rs, "brand_id"));

    private static final RowMapper<SubmissionRow> SUBMISSION_ROW = (rs, row) -> new SubmissionRow(
            readId(rs, "id"), rs.getString("title"), rs.getString("content_text"),
            rs.getString("status"), rs.getInt("version_no"), rs.getString("guideline_version"),
            instant(rs.getTimestamp("created_at")), readId(rs, "creator_id"));

    private static final RowMapper<RuleRow> RULE_ROW = (rs, row) -> new RuleRow(
            readId(rs, "id"), rs.getString("source_id"), rs.getString("kind"),
            rs.getString("category"), rs.getString("severity"), rs.getString("match_text"),
            rs.getString("explanation"), rs.getString("suggestion"), rs.getString("evidence_text"));

    private record UserRow(UUID id, String email, String passwordHash, String role, UUID brandId) {}
    private record SubmissionRow(UUID id, String title, String content, String status, int versionNo,
                                 String guidelineVersion, Instant createdAt, UUID creatorId) {}
    private record RuleRow(UUID id, String sourceId, String kind, String category, String severity,
                           String matchText, String explanation, String suggestion, String evidenceText) {}
}
