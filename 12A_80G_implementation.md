# Trace-It --- NGO Registration Credential Validation

## Implementation Specification for Antigravity

### 1. Purpose

Implement a lightweight **NGO Registration Credential Validation**
module for Trace-It.

The feature is supplementary to the core donation workflow. Its purpose
is to detect malformed NGO registration credentials and inconsistencies
between the NGO's PAN and its submitted 12A/12AB and 80G registration
credentials.

**Important scope boundary:** this module performs only local structural
and internal consistency validation. It must **not** claim that an NGO
has been officially verified by the Government of India or the Income
Tax Department.

------------------------------------------------------------------------

## 2. Validation Scope

Validate the following NGO registration information:

1.  NGO PAN
2.  Section 12A / 12AB registration credential
3.  Section 80G registration credential
4.  DARPAN ID
5.  CSR Registration Number

Primary checks:

-   PAN format validation
-   12A/12AB credential format validation
-   80G credential format validation
-   PAN embedded in 12A/12AB must match NGO PAN
-   PAN embedded in 80G must match NGO PAN
-   DARPAN ID structural validation
-   CSR registration number structural validation
-   Missing-field handling
-   Clear validation result/status reporting

------------------------------------------------------------------------

## 3. Explicitly Out of Scope

Do **not** implement:

-   Live Income Tax Department API verification
-   Government database lookup
-   DigiLocker integration
-   OCR of certificates
-   Digital-signature verification of government certificates
-   Automated legal/tax determination of 80G eligibility
-   Automated determination of donor tax-deduction eligibility
-   Government-issued credential authenticity verification
-   Any claim that passing local validation means the NGO is
    government-verified

The implementation should be deterministic and locally testable.

------------------------------------------------------------------------

## 4. Input Data Model

Use a structure equivalent to:

``` ts
interface NGORegistrationCredentials {
  pan: string;
  section12Registration?: string;
  section80GRegistration?: string;
  darpanId?: string;
  csrRegistrationNo?: string;
}
```

Use the project's existing TypeScript conventions and
validation/error-handling patterns.

Do not introduce a new validation framework unless the project already
uses one.

------------------------------------------------------------------------

## 5. Normalization Rules

### PAN

-   Trim leading/trailing whitespace.
-   Convert to uppercase.
-   Do not silently remove internal characters.
-   Example: `aaatw4682j` becomes `AAATW4682J`.

### Registration Credentials

-   Trim leading/trailing whitespace.
-   Convert to uppercase where appropriate.
-   Do not remove internal characters.
-   Preserve the normalized value for validation.

### DARPAN / CSR

-   Trim leading/trailing whitespace.
-   Normalize case where appropriate.
-   Do not silently modify internal structure.

------------------------------------------------------------------------

## 6. PAN Validation

Required format:

``` regex
^[A-Z]{5}[0-9]{4}[A-Z]$
```

Examples:

``` text
AAATW4682J -> VALID
AAATA2239B -> VALID
AABTH2529Q -> VALID
```

Invalid examples:

``` text
AAATW4682  -> INVALID
AAATW4682JJ -> INVALID
1234567890 -> INVALID
AAAA12345@ -> INVALID
```

Implement something equivalent to:

``` ts
validatePAN(pan: string): ValidationResult
```

Possible valid result:

``` ts
{
  valid: true,
  status: "VALID",
  normalizedValue: "AAATW4682J"
}
```

------------------------------------------------------------------------

## 7. Section 12A / 12AB Registration Validation

### Observed credential structure

The supplied Section 12A/12AB examples use a 16-character structure:

``` text
AAATW4682JE20215
AABTH2529QE20213
AADCL3765HE20221
```

Use the observed structural pattern:

``` regex
^[A-Z]{5}[0-9]{4}[A-Z][A-Z][0-9]{5}$
```

Conceptually:

``` text
PAN (10 characters) + uppercase letter + 5 digits
```

**Do not assign undocumented semantic meanings to the final six
characters.**

For a valid credential:

``` ts
const embeddedPAN = registration.substring(0, 10);
```

Then compare:

``` ts
embeddedPAN === normalizedNGOPAN
```

Example:

``` text
NGO PAN: AAATW4682J
12A:     AAATW4682JE20215

Format:       VALID
Embedded PAN: AAATW4682J
PAN Match:    YES
```

Function:

``` ts
validateSection12Registration(
  registration: string,
  ngoPAN: string
): ValidationResult
```

------------------------------------------------------------------------

## 8. Section 80G Registration Validation

Use the same observed structural format:

``` regex
^[A-Z]{5}[0-9]{4}[A-Z][A-Z][0-9]{5}$
```

Examples:

``` text
AAATW4682JF20213
AAATJ9297QE20206
AAATA2239BE20213
AANAS3730MF20221
```

Extract the first 10 characters:

``` ts
const embeddedPAN = registration.substring(0, 10);
```

Compare against the NGO PAN.

Example:

``` text
NGO PAN: AAATW4682J
80G:     AAATW4682JF20213

Format:       VALID
Embedded PAN: AAATW4682J
PAN Match:    YES
```

Function:

``` ts
validateSection80GRegistration(
  registration: string,
  ngoPAN: string
): ValidationResult
```

------------------------------------------------------------------------

## 9. DARPAN ID Validation

For this lightweight implementation, validate the observed DARPAN ID
structure:

``` regex
^[A-Z]{2}/[0-9]{4}/[0-9]{7}$
```

Example:

``` text
MH/2024/0470946 -> VALID
```

This is a **format check only**.

Do not claim that the DARPAN ID was verified against the NGO DARPAN
portal.

Keep the pattern configurable so it can be changed if an authoritative
specification is adopted later.

------------------------------------------------------------------------

## 10. CSR Registration Number Validation

For this lightweight implementation:

``` regex
^CSR[0-9]{8}$
```

Example:

``` text
CSR00071601 -> VALID
```

This is also a structural check only.

Do not claim that the CSR registration number was verified against a
government database.

------------------------------------------------------------------------

## 11. Combined Validation

Create a central validator:

``` ts
validateRegistrationCredentials({
  pan,
  section12Registration,
  section80GRegistration,
  darpanId,
  csrRegistrationNo
})
```

The central validator must:

1.  Normalize inputs.
2.  Validate PAN.
3.  Validate Section 12A/12AB if supplied.
4.  Validate Section 80G if supplied.
5.  Compare embedded PAN in 12A/12AB with NGO PAN.
6.  Compare embedded PAN in 80G with NGO PAN.
7.  Validate DARPAN ID if supplied.
8.  Validate CSR Registration Number if supplied.
9.  Produce individual validation results.
10. Produce an overall status.

------------------------------------------------------------------------

## 12. Overall Status Rules

Use:

``` text
PASS
PARTIAL
INVALID
INCONSISTENT
```

### PASS

Use when:

-   PAN is valid.
-   Supplied registration credentials are structurally valid.
-   Supplied 12A/12AB matches PAN.
-   Supplied 80G matches PAN.
-   Other supplied identifiers are structurally valid.

### PARTIAL

Use when some optional/supplementary information is missing but the
supplied information is valid.

Example:

``` text
PAN: VALID
12A: VALID + PAN MATCH
80G: MISSING
DARPAN: VALID
CSR: VALID

Overall: PARTIAL
```

If product rules require both 12A and 80G for a particular operation,
the backend may reject onboarding instead. Keep this requirement
configurable.

### INVALID

Use when one or more supplied credentials fail structural format
validation.

Example:

``` text
PAN: VALID
12A: INVALID_FORMAT
80G: VALID + PAN MATCH

Overall: INVALID
```

### INCONSISTENT

Use when a credential is structurally valid but its embedded PAN does
not match the NGO PAN.

Example:

``` text
PAN: AAATW4682J
12A: AAATW4682JE20215 -> PAN MATCH
80G: AAATA2239BE20213 -> PAN MISMATCH

Overall: INCONSISTENT
```

------------------------------------------------------------------------

## 13. Individual Validation Statuses

Use statuses such as:

``` text
VALID
MISSING
INVALID_FORMAT
PAN_MISMATCH
```

Example:

``` json
{
  "overallStatus": "INCONSISTENT",
  "pan": {
    "status": "VALID"
  },
  "section12Registration": {
    "status": "VALID",
    "panMatch": true
  },
  "section80GRegistration": {
    "status": "PAN_MISMATCH",
    "panMatch": false
  },
  "darpanId": {
    "status": "VALID"
  },
  "csrRegistrationNo": {
    "status": "VALID"
  }
}
```

------------------------------------------------------------------------

## 14. Backend Authority

The backend must be the authoritative validator.

Frontend validation may provide immediate feedback, but it must never be
trusted as the final security/compliance decision.

The backend should independently revalidate credentials before accepting
or persisting the registration state.

Do not allow a client to bypass validation by directly sending a crafted
request.

------------------------------------------------------------------------

## 15. Suggested Code Organization

Prefer:

``` text
backend/
└── src/
    └── validators/
        ├── ngoRegistrationValidator.ts
        └── patterns.ts
```

### `patterns.ts`

``` ts
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const REGISTRATION_URN_REGEX =
  /^[A-Z]{5}[0-9]{4}[A-Z][A-Z][0-9]{5}$/;

export const DARPAN_ID_REGEX =
  /^[A-Z]{2}\/[0-9]{4}\/[0-9]{7}$/;

export const CSR_REGISTRATION_REGEX =
  /^CSR[0-9]{8}$/;
```

### `ngoRegistrationValidator.ts`

Implement:

``` ts
validatePAN()
validateSection12Registration()
validateSection80GRegistration()
validateDarpanId()
validateCSRRegistration()
validateRegistrationCredentials()
```

Reuse common normalization and PAN-matching logic.

------------------------------------------------------------------------

## 16. Sample NGO Regression Test

Use this exact sample:

``` text
DARPAN ID:
MH/2024/0470946

CSR Registration No.:
CSR00071601

PAN:
AAATW4682J

12A Registration:
AAATW4682JE20215

80G Registration:
AAATW4682JF20213
```

Expected:

``` text
PAN: VALID

12A:
  Format: VALID
  Embedded PAN: AAATW4682J
  PAN Match: YES

80G:
  Format: VALID
  Embedded PAN: AAATW4682J
  PAN Match: YES

DARPAN:
  Format: VALID

CSR:
  Format: VALID

Overall:
  PASS
```

------------------------------------------------------------------------

## 17. Required Unit Tests

### PAN

-   Valid PAN.
-   Lowercase PAN normalization.
-   Leading/trailing whitespace.
-   Incorrect length.
-   Invalid characters.
-   Missing PAN.
-   Internal whitespace.

### Section 12A/12AB

-   Valid sample.
-   Invalid length.
-   Invalid characters.
-   Valid structure + matching PAN.
-   Valid structure + mismatching PAN.
-   Missing credential.
-   Leading/trailing whitespace.

### Section 80G

-   Valid sample.
-   Invalid length.
-   Invalid characters.
-   Valid structure + matching PAN.
-   Valid structure + mismatching PAN.
-   Missing credential.
-   Leading/trailing whitespace.

### DARPAN

-   Valid sample.
-   Invalid structure.
-   Invalid year section.
-   Invalid prefix structure.
-   Missing value.

### CSR

-   Valid sample.
-   Invalid structure.
-   Wrong prefix.
-   Wrong digit count.
-   Missing value.

### Combined

At minimum:

1.  All credentials valid.
2.  Only 12A supplied.
3.  Only 80G supplied.
4.  Both registration credentials missing.
5.  12A PAN mismatch.
6.  80G PAN mismatch.
7.  Both PAN mismatches.
8.  Malformed 12A.
9.  Malformed 80G.
10. Malformed PAN.
11. Valid registrations with invalid DARPAN.
12. Valid registrations with invalid CSR.
13. Exact sample NGO regression test returns `PASS`.

------------------------------------------------------------------------

## 18. UI Behaviour

Provide clear human-readable feedback.

Example:

``` text
NGO PAN
[ AAATW4682J ]  ✓ Valid format

12A Registration
[ AAATW4682JE20215 ]  ✓ Valid
                         ✓ PAN matches

80G Registration
[ AAATW4682JF20213 ]  ✓ Valid
                         ✓ PAN matches

DARPAN ID
[ MH/2024/0470946 ]  ✓ Valid format

CSR Registration No.
[ CSR00071601 ]  ✓ Valid format
```

For mismatch:

``` text
80G Registration
[ AAATA2239BE20213 ]

✗ PAN mismatch
The registration credential does not correspond to the submitted NGO PAN.
```

Avoid wording such as:

``` text
Government Verified
Officially Verified
Income Tax Department Verified
80G Tax Eligible
```

unless an actual authoritative verification mechanism is later
implemented.

------------------------------------------------------------------------

## 19. SIEM Integration

Emit security/audit events through the project's existing SIEM/logging
mechanism.

Suggested event types:

``` text
NGO_REGISTRATION_VALIDATION_PASSED
NGO_REGISTRATION_VALIDATION_FAILED
NGO_REGISTRATION_PAN_MISMATCH
NGO_REGISTRATION_MISSING
```

Example:

``` json
{
  "eventType": "NGO_REGISTRATION_PAN_MISMATCH",
  "ngoId": "NGO-00142",
  "credentialType": "80G",
  "timestamp": "2026-09-22T00:00:00.000Z",
  "result": "REJECTED",
  "reason": "URN_PAN_MISMATCH"
}
```

Do not unnecessarily log complete sensitive credential values.

Prefer:

-   NGO internal ID
-   credential type
-   validation result
-   reason
-   timestamp
-   request/correlation ID where available

Reuse the existing audit-event schema if one already exists.

------------------------------------------------------------------------

## 20. Security Requirements

The implementation must:

-   Validate on the backend.
-   Normalize before validation.
-   Never trust frontend validation.
-   Avoid logging full PAN/registration values unnecessarily.
-   Return useful validation errors without exposing internal
    implementation details.
-   Avoid treating format validation as authenticity verification.
-   Avoid silently changing malformed credentials into valid-looking
    values.
-   Keep regex/pattern definitions centralized.
-   Add regression tests for all validation rules.

------------------------------------------------------------------------

## 21. API/Service Integration

Integrate at the NGO onboarding/registration boundary.

Expected flow:

``` text
NGO submits registration
        |
        v
Normalize input
        |
        v
Validate PAN
        |
        v
Validate 12A/12AB
        |
        v
Validate 80G
        |
        v
Check PAN consistency
        |
        v
Validate DARPAN / CSR
        |
        v
Determine overall status
        |
        +---- INVALID / INCONSISTENT ---> Reject or manual review
        |
        +---- PASS / PARTIAL -----------> Continue according to business rules
        |
        v
Persist validation result / audit event
```

Follow the existing Trace-It backend architecture. Do not restructure
unrelated application code.

------------------------------------------------------------------------

## 22. Acceptance Criteria

The implementation is complete when:

-   [ ] PAN format validation works.
-   [ ] PAN normalization works.
-   [ ] 12A/12AB structural validation works.
-   [ ] 80G structural validation works.
-   [ ] DARPAN ID structural validation works.
-   [ ] CSR registration structural validation works.
-   [ ] Embedded PAN is extracted from 12A/12AB.
-   [ ] Embedded PAN is extracted from 80G.
-   [ ] 12A/12AB PAN mismatch is detected.
-   [ ] 80G PAN mismatch is detected.
-   [ ] Missing values are handled explicitly.
-   [ ] Overall status is generated.
-   [ ] Backend is authoritative.
-   [ ] Frontend provides understandable validation feedback.
-   [ ] SIEM/audit events use the existing logging mechanism.
-   [ ] Full credential values are not unnecessarily logged.
-   [ ] Unit tests cover valid and invalid cases.
-   [ ] The supplied sample NGO passes all checks.
-   [ ] No claim of government/Income Tax Department verification is
    made.

------------------------------------------------------------------------

## 23. Important Implementation Principle

This feature is intentionally **small and deterministic**.

The goal is to add a meaningful integrity check to NGO onboarding
without expanding Trace-It into a government-verification platform.

Prioritize:

``` text
Correctness
+
Clear validation states
+
PAN consistency
+
Backend enforcement
+
Testability
+
SIEM visibility
```

over external APIs, complex document processing, or additional
infrastructure.
