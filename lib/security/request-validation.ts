const SAFE_IDENTIFIER_PATTERN =
  /^[a-zA-Z0-9_-]{1,100}$/;

/**
 * Restricts identifiers before they become checkpoint keys or log fields.
 * Format validation is not authorization; callers must still verify that the
 * authenticated actor owns the referenced thread or action.
 */
export function parseSafeIdentifier(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  if (!SAFE_IDENTIFIER_PATTERN.test(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}
