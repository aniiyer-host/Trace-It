# Manual Test Plan for NGO Registration Credential Validation

## Test Cases:

### 1. Valid Sample NGO (should PASS)
- PAN: AAATW4682J
- 12A Registration: AAATW4682JE20215
- 80G Registration: AAATW4682JF20213
- DARPAN ID: MH/2024/0470946
- CSR Registration: CSR00071601
Expected: PASS (no validation errors)

### 2. Invalid PAN
- PAN: invalidpan123
Expected: PAN format error

### 3. Invalid 12A/12AB Format
- PAN: AAATW4682J (valid)
- 12A Registration: AAATW4682JE2021 (too short)
Expected: 12A/12AB format error

### 4. 12A/12AB PAN Mismatch
- PAN: AAATW4682J
- 12A Registration: AABTH2529QE20213 (different PAN)
Expected: 12A/12AB PAN mismatch error

### 5. Invalid 80G Format
- PAN: AAATW4682J (valid)
- 80G Registration: AAATW4682JF2021 (too short)
Expected: 80G format error

### 6. 80G PAN Mismatch
- PAN: AAATW4682J
- 80G Registration: AATA2239BE20213 (different PAN)
Expected: 80G PAN mismatch error

### 7. Invalid DARPAN ID
- DARPAN ID: invalid-format
Expected: DARPAN ID format error

### 8. Invalid CSR Registration
- CSR Registration: CSR12345 (too short)
Expected: CSR registration format error

### 9. Optional Fields Empty (should PASS if others valid)
- PAN: AAATW4682J
- 12A Registration: AAATW4682JE20215
- 80G Registration: (empty)
- DARPAN ID: (empty)
- CSR Registration: (empty)
Expected: PASS or PARTIAL status (no validation errors)

## Test Procedure:
1. Navigate to Profile page
2. Fill in Organisation Name and Registration Number (required fields)
3. Enter test credential values in the new fields
4. Click "Submit Application"
5. Observe validation errors (should appear next to relevant fields)
6. Verify no error toast appears for valid cases
7. Verify credential values are NOT sent to backend (check network tab)

## Verification Points:
- Validation errors appear inline next to fields
- No credential values in API request payload
- Form submission proceeds only when valid
- Optional fields can be left empty