# Trace It Security Documentation

This directory contains comprehensive security documentation for the Trace It platform, following an evidence-driven approach: Control → Implementation → Test → Result → Evidence → Compliance → Residual Risk.

## Documentation Files

- **[SECURITY.md](./SECURITY.md)** - Main security documentation covering 10 sections including compliance mapping, threat model, blockchain controls, authentication, data protection, secure development practices, dependency security, monitoring, testing evidence, and residual risks
- **[compliance.md](./compliance.md)** - Concise summary of regulatory mappings (IT Act 2000, DPDP Act 2023, PMLA/FATF, FCRA 2010, RBI/VDA, GDPR)
- **[threats.md](./threats.md)** - STRIDE threat model table mapping threats to specific mitigations
- **[remediations.md](./remediations.md)** - Identified gaps and recommended actions for improving security controls
- **[security_details.md](./security_details.md)** - Additional technical details about security implementations
- **[security_claude.md](./security_claude.md)** - Security-focused guidance for Claude Code assistants working with this repository

## ISO/IEC 27001:2022 Mapping

- **[ISO_IEC_27001_mapping/](../security_docs/ISO_IEC_27001_mapping/)** - Directory containing mapping of Trace It security controls to ISO/IEC 27001:2022 Annex A controls
  - **[README.md](./ISO_IEC_27001_mapping/README.md)** - Detailed evidence-driven mapping of ISO/IEC 27001:2022 controls to Trace It implementation status

## Documentation Structure

Each documentation file follows the evidence-driven structure where applicable:
1. **Control** - The security control being described
2. **Implementation** - Current implementation status in the platform
3. **Test** - How the control is or will be tested
4. **Result** - Outcomes of testing (when available)
5. **Evidence** - References to implementation evidence in the repository
6. **Compliance** - Mapping to relevant regulations or standards
7. **Residual Risk** - Remaining risk after implementing the control

## Status & Next Steps

The documentation reflects the current state of the Trace It platform, which uses mocked backend services for development purposes. Most security controls are documented as "Partially Implemented" or "Not Implemented" due to the mock nature of current implementations.

Next steps for improving the security posture include:
1. Implementing actual security controls per the documented designs
2. Establishing security testing pipelines (SecureCI or similar) to generate testing evidence
3. Performing regular security reviews and updates to this documentation