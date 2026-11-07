package com.brandguard.api;

import com.brandguard.api.ApiModels.AuthRequest;
import com.brandguard.api.ApiModels.AuthResponse;
import com.brandguard.api.ApiModels.BrandView;
import com.brandguard.api.ApiModels.Caller;
import com.brandguard.api.ApiModels.DecisionRequest;
import com.brandguard.api.ApiModels.FindingStateRequest;
import com.brandguard.api.ApiModels.RegisterRequest;
import com.brandguard.api.ApiModels.RuleView;
import com.brandguard.api.ApiModels.RuleUpsertRequest;
import com.brandguard.api.ApiModels.SubmissionRequest;
import com.brandguard.api.ApiModels.RevisionRequest;
import com.brandguard.api.ApiModels.SubmissionView;
import com.brandguard.api.ApiModels.UserView;
import com.brandguard.service.PlatformService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PlatformController {
    private final PlatformService platform;

    public PlatformController(PlatformService platform) {
        this.platform = platform;
    }

    @GetMapping("/health")
    public HealthResponse health() {
        return new HealthResponse("UP");
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@Valid @RequestBody AuthRequest request) {
        return platform.login(request.email(), request.password());
    }

    @PostMapping("/auth/register")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return platform.register(request.email(), request.password());
    }

    @GetMapping("/auth/me")
    public UserView me(@AuthenticationPrincipal Caller caller) {
        return platform.profile(caller);
    }

    @GetMapping("/brands/current")
    public BrandView currentBrand(@AuthenticationPrincipal Caller caller) {
        return platform.currentBrand(caller);
    }

    @GetMapping("/brands/current/rules")
    public List<RuleView> currentRules(@AuthenticationPrincipal Caller caller) {
        return platform.currentRules(caller);
    }

    @PostMapping("/brands/current/rules")
    public List<RuleView> createRule(@AuthenticationPrincipal Caller caller, @Valid @RequestBody RuleUpsertRequest request) {
        return platform.createRule(caller, request);
    }

    @PutMapping("/brands/current/rules/{sourceId}")
    public List<RuleView> updateRule(@AuthenticationPrincipal Caller caller, @PathVariable String sourceId, @Valid @RequestBody RuleUpsertRequest request) {
        return platform.updateRule(caller, sourceId, request);
    }

    @DeleteMapping("/brands/current/rules/{sourceId}")
    public List<RuleView> archiveRule(@AuthenticationPrincipal Caller caller, @PathVariable String sourceId) {
        return platform.archiveRule(caller, sourceId);
    }

    @PostMapping("/submissions")
    public SubmissionView createSubmission(@AuthenticationPrincipal Caller caller, @Valid @RequestBody SubmissionRequest request) {
        return platform.createSubmission(caller, request);
    }

    @GetMapping("/submissions")
    public List<SubmissionView> listSubmissions(@AuthenticationPrincipal Caller caller) {
        return platform.listSubmissions(caller);
    }

    @GetMapping("/submissions/{id}")
    public SubmissionView getSubmission(@AuthenticationPrincipal Caller caller, @PathVariable UUID id) {
        return platform.getSubmission(caller, id);
    }

    @PostMapping("/submissions/{id}/analyze")
    public SubmissionView analyze(@AuthenticationPrincipal Caller caller, @PathVariable UUID id) {
        return platform.analyze(caller, id);
    }

    @PutMapping("/submissions/{id}/revision")
    public SubmissionView revise(@AuthenticationPrincipal Caller caller, @PathVariable UUID id, @Valid @RequestBody RevisionRequest request) {
        return platform.revise(caller, id, request.content());
    }

    @PostMapping("/submissions/{id}/decisions")
    public SubmissionView decide(@AuthenticationPrincipal Caller caller, @PathVariable UUID id, @Valid @RequestBody DecisionRequest request) {
        return platform.decide(caller, id, request.decision(), request.reason());
    }

    @PatchMapping("/findings/{id}")
    public SubmissionView updateFinding(@AuthenticationPrincipal Caller caller, @PathVariable UUID id, @Valid @RequestBody FindingStateRequest request) {
        return platform.updateFinding(caller, id, request.state(), request.reason());
    }

    public record HealthResponse(String status) {}
}
