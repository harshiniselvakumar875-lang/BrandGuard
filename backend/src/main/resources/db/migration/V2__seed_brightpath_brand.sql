CREATE TABLE content_version (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    version_no INTEGER NOT NULL,
    content_text TEXT NOT NULL,
    changed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE (submission_id, version_no),
    CONSTRAINT fk_version_submission FOREIGN KEY (submission_id) REFERENCES submission(id) ON DELETE CASCADE,
    CONSTRAINT fk_version_user FOREIGN KEY (changed_by) REFERENCES app_user(id)
);

INSERT INTO brand (id, name, guideline_version)
VALUES ('10000000-0000-0000-0000-000000000001', 'BrightPath Institute', 'v3');

INSERT INTO brand_rule (id, brand_id, source_id, kind, category, severity, match_text, explanation, suggestion, evidence_text) VALUES
('20000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', 'fact-018', 'FACT_CONFLICT', 'Factual conflict', 'HIGH', 'guarantee 100% job placement', 'The approved fact explicitly says no placement guarantee is offered.', 'provides career guidance and placement assistance', 'BrightPath Institute provides career guidance and placement assistance. No placement guarantee is offered.'),
('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000001', 'fact-021', 'FACT_CONFLICT', 'Factual conflict', 'HIGH', '6-month course', 'The flagship programme duration is 12 months, not 6 months.', '12-month programme', 'The flagship programme runs for 12 months.'),
('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'term-004', 'TERMINOLOGY', 'Terminology', 'MEDIUM', 'BrightPath Academy', 'This is a deprecated brand name. Use the current approved name.', 'BrightPath Institute', 'Deprecated name “BrightPath Academy”. Use “BrightPath Institute”.'),
('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 'term-009', 'RULE_VIOLATION', 'Prohibited wording', 'MEDIUM', 'super cheap', '“Cheap” is on the prohibited wording list. The preferred term is “affordable”.', 'affordable', 'Prohibited wording: “cheap”. Prefer “affordable”.'),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'voice-002', 'STYLE', 'Tone of voice', 'LOW', '!!', 'The brand voice is professional and warm; repeated exclamation marks feel overemphatic.', '!', 'Voice: professional, warm, encouraging. No slang or excessive exclamation marks.');
