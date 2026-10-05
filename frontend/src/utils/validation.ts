// Validation constants and functions for NGO registration credential validation
// Based on implementation guide for 12A + 80G validation

// Regex patterns from the implementation guide
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const REGISTRATION_URN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z][A-Z][0-9]{5}$/;
export const DARPAN_ID_REGEX = /^[A-Z]{2}\/[0-9]{4}\/[0-9]{7}$/;
export const CSR_REGISTRATION_REGEX = /^CSR[0-9]{8}$/;

/**
 * Normalize input string: trim and convert to uppercase
 */
export function normalizeInput(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Validate PAN format
 */
export function validatePAN(pan: string): { valid: boolean; status: 'VALID' | 'MISSING' | 'INVALID_FORMAT'; normalizedValue?: string } {
  if (!pan) {
    return { valid: false, status: 'MISSING' };
  }

  const normalized = normalizeInput(pan);
  if (PAN_REGEX.test(normalized)) {
    return { valid: true, status: 'VALID', normalizedValue: normalized };
  }

  return { valid: false, status: 'INVALID_FORMAT', normalizedValue: normalized };
}

/**
 * Validate Section 12A/12AB registration
 */
export function validateSection12Registration(registration: string, ngoPAN: string): { valid: boolean; status: 'VALID' | 'MISSING' | 'INVALID_FORMAT' | 'PAN_MISMATCH'; normalizedValue?: string; embeddedPAN?: string; panMatch?: boolean } {
  if (!registration) {
    return { valid: false, status: 'MISSING' };
  }

  const normalized = normalizeInput(registration);
  if (!REGISTRATION_URN_REGEX.test(normalized)) {
    return { valid: false, status: 'INVALID_FORMAT', normalizedValue: normalized };
  }

  const embeddedPAN = normalized.substring(0, 10);
  const panMatch = embeddedPAN === ngoPAN;

  return {
    valid: panMatch,
    status: panMatch ? 'VALID' : 'PAN_MISMATCH',
    normalizedValue: normalized,
    embeddedPAN,
    panMatch
  };
}

/**
 * Validate Section 80G registration
 */
export function validateSection80GRegistration(registration: string, ngoPAN: string): { valid: boolean; status: 'VALID' | 'MISSING' | 'INVALID_FORMAT' | 'PAN_MISMATCH'; normalizedValue?: string; embeddedPAN?: string; panMatch?: boolean } {
  if (!registration) {
    return { valid: false, status: 'MISSING' };
  }

  const normalized = normalizeInput(registration);
  if (!REGISTRATION_URN_REGEX.test(normalized)) {
    return { valid: false, status: 'INVALID_FORMAT', normalizedValue: normalized };
  }

  const embeddedPAN = normalized.substring(0, 10);
  const panMatch = embeddedPAN === ngoPAN;

  return {
    valid: panMatch,
    status: panMatch ? 'VALID' : 'PAN_MISMATCH',
    normalizedValue: normalized,
    embeddedPAN,
    panMatch
  };
}

/**
 * Validate DARPAN ID
 */
export function validateDarpanId(darpanId: string): { valid: boolean; status: 'VALID' | 'MISSING' | 'INVALID_FORMAT'; normalizedValue?: string } {
  if (!darpanId) {
    return { valid: false, status: 'MISSING' };
  }

  const normalized = normalizeInput(darpanId);
  if (DARPAN_ID_REGEX.test(normalized)) {
    return { valid: true, status: 'VALID', normalizedValue: normalized };
  }

  return { valid: false, status: 'INVALID_FORMAT', normalizedValue: normalized };
}

/**
 * Validate CSR Registration Number
 */
export function validateCSRRegistration(csrRegistrationNo: string): { valid: boolean; status: 'VALID' | 'MISSING' | 'INVALID_FORMAT'; normalizedValue?: string } {
  if (!csrRegistrationNo) {
    return { valid: false, status: 'MISSING' };
  }

  const normalized = normalizeInput(csrRegistrationNo);
  if (CSR_REGISTRATION_REGEX.test(normalized)) {
    return { valid: true, status: 'VALID', normalizedValue: normalized };
  }

  return { valid: false, status: 'INVALID_FORMAT', normalizedValue: normalized };
}