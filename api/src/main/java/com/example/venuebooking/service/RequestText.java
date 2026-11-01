package com.example.venuebooking.service;

final class RequestText {

    private RequestText() {
    }

    static boolean isBlank(String value) {
        return value == null || value.codePoints().allMatch(codePoint ->
                Character.isWhitespace(codePoint)
                        || Character.isSpaceChar(codePoint)
                        || Character.getType(codePoint) == Character.FORMAT);
    }

    static boolean containsNull(String value) {
        return value != null && value.indexOf('\0') >= 0;
    }
}
