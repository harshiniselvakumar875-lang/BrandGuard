package com.brandguard.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.brandguard.api.ApiModels.Role;
import com.brandguard.api.ApiModels.UserView;
import io.jsonwebtoken.security.SignatureException;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class JwtServiceTest {
    private final JwtService jwtService = new JwtService(
            Base64.getEncoder().encodeToString("a-long-test-secret-with-at-least-32-bytes".getBytes()), 60);

    @Test
    void issuedTokenContainsTheAuthenticatedUserAndRole() {
        UUID userId = UUID.randomUUID();
        UUID brandId = UUID.randomUUID();
        String token = jwtService.issue(new UserView(userId, "creator@example.com", Role.CREATOR, brandId));

        var claims = jwtService.parse(token);

        assertEquals("creator@example.com", claims.getSubject());
        assertEquals(userId.toString(), claims.get("userId", String.class));
        assertEquals(Role.CREATOR.name(), claims.get("role", String.class));
        assertEquals(brandId.toString(), claims.get("brandId", String.class));
    }

    @Test
    void rejectsTokensSignedByAnotherKey() {
        JwtService otherService = new JwtService(
                Base64.getEncoder().encodeToString("a-different-test-secret-with-32-bytes-minimum".getBytes()), 60);
        String token = jwtService.issue(new UserView(UUID.randomUUID(), "user@example.com", Role.REVIEWER, UUID.randomUUID()));

        assertThrows(SignatureException.class, () -> otherService.parse(token));
    }
}
