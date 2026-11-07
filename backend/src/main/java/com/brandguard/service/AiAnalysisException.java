package com.brandguard.service;

public class AiAnalysisException extends RuntimeException {
    public AiAnalysisException(String message) {
        super(message);
    }

    public AiAnalysisException(String message, Throwable cause) {
        super(message, cause);
    }
}
