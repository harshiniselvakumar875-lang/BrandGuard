package com.brandguard.security;

import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DemoUserSeeder implements ApplicationRunner {
    private static final UUID BRAND_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final boolean enabled;
    private final String adminEmail;
    private final String adminPassword;
    private final String reviewerEmail;
    private final String reviewerPassword;
    private final String creatorEmail;
    private final String creatorPassword;

    public DemoUserSeeder(
            JdbcTemplate jdbc,
            PasswordEncoder passwordEncoder,
            @Value("${app.seed-users}") boolean enabled,
            @Value("${app.admin-email}") String adminEmail,
            @Value("${app.admin-password}") String adminPassword,
            @Value("${app.reviewer-email}") String reviewerEmail,
            @Value("${app.reviewer-password}") String reviewerPassword,
            @Value("${app.creator-email}") String creatorEmail,
            @Value("${app.creator-password}") String creatorPassword) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.enabled = enabled;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.reviewerEmail = reviewerEmail;
        this.reviewerPassword = reviewerPassword;
        this.creatorEmail = creatorEmail;
        this.creatorPassword = creatorPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) return;
        addUser(adminEmail, adminPassword, "BRAND_ADMIN");
        addUser(reviewerEmail, reviewerPassword, "REVIEWER");
        addUser(creatorEmail, creatorPassword, "CREATOR");
    }

    private void addUser(String email, String password, String role) {
        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            throw new IllegalStateException("Demo-user seeding requires an email and password for every seeded role.");
        }
        jdbc.update("""
                INSERT INTO app_user (id, email, password_hash, role, brand_id)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE email = email
                """, UUID.randomUUID().toString(), email.toLowerCase(), passwordEncoder.encode(password), role, BRAND_ID.toString());
    }
}
