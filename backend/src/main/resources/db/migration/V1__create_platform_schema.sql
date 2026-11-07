CREATE TABLE brand (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    guideline_version VARCHAR(40) NOT NULL DEFAULT 'v1',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE app_user (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('CREATOR', 'REVIEWER', 'BRAND_ADMIN', 'MANAGER')),
    brand_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_user_brand FOREIGN KEY (brand_id) REFERENCES brand(id)
);

CREATE TABLE brand_rule (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    brand_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    source_id VARCHAR(60) NOT NULL UNIQUE,
    kind VARCHAR(30) NOT NULL,
    category VARCHAR(80) NOT NULL,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
    match_text VARCHAR(500) NOT NULL,
    explanation TEXT NOT NULL,
    suggestion VARCHAR(500) NOT NULL,
    evidence_text TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_rule_brand FOREIGN KEY (brand_id) REFERENCES brand(id)
);

CREATE TABLE submission (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    brand_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creator_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(240) NOT NULL,
    content_text TEXT NOT NULL,
    status VARCHAR(30) NOT NULL CHECK (status IN ('SUBMITTED', 'ANALYSING', 'NEEDS_CHANGES', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'FAILED')),
    version_no INTEGER NOT NULL DEFAULT 1,
    guideline_version VARCHAR(40),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_submission_brand FOREIGN KEY (brand_id) REFERENCES brand(id),
    CONSTRAINT fk_submission_creator FOREIGN KEY (creator_id) REFERENCES app_user(id)
);

CREATE TABLE finding (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    rule_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
    category VARCHAR(80) NOT NULL,
    label VARCHAR(40) NOT NULL,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
    excerpt VARCHAR(1000) NOT NULL,
    explanation TEXT NOT NULL,
    suggested_text VARCHAR(1000) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'ACCEPTED', 'DISMISSED')),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_finding_submission FOREIGN KEY (submission_id) REFERENCES submission(id) ON DELETE CASCADE,
    CONSTRAINT fk_finding_rule FOREIGN KEY (rule_id) REFERENCES brand_rule(id)
);

CREATE TABLE review_decision (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reviewer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    decision VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_decision_submission FOREIGN KEY (submission_id) REFERENCES submission(id),
    CONSTRAINT fk_decision_reviewer FOREIGN KEY (reviewer_id) REFERENCES app_user(id)
);

CREATE TABLE audit_event (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
    action VARCHAR(80) NOT NULL,
    target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
    details TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES app_user(id)
);

CREATE INDEX idx_user_brand ON app_user(brand_id);
CREATE INDEX idx_rule_brand_active ON brand_rule(brand_id, active);
CREATE INDEX idx_submission_brand_status ON submission(brand_id, status, created_at DESC);
CREATE INDEX idx_finding_submission ON finding(submission_id, state);
CREATE INDEX idx_audit_target ON audit_event(target_id, created_at DESC);
