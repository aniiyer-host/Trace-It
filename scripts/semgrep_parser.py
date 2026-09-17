#!/usr/bin/env python3
"""
Simple Semgrep parser for evidence-only mode.
Preserves Semgrep findings in normalized format.
"""
import json
import sys
import os

def main():
    input_file = "reports/semgrep-report.json"
    output_file = "normalized-sast-findings.json"

    # Ensure input file exists
    if not os.path.exists(input_file):
        # Create empty normalized findings if no Semgrep report
        normalized = {
            "findings": [],
            "scanner": "semgrep",
            "timestamp": "",
            "stats": {
                "total_findings": 0,
                "severity_counts": {
                    "ERROR": 0,
                    "WARNING": 0,
                    "INFO": 0
                }
            }
        }
    else:
        # Read Semgrep JSON report
        with open(input_file, 'r') as f:
            semgrep_data = json.load(f)

        # Convert to normalized format (simple pass-through for evidence)
        normalized = {
            "findings": semgrep_data.get("results", []),
            "scanner": "semgrep",
            "timestamp": "",
            "raw_report": semgrep_data
        }

        # Add basic stats
        findings = semgrep_data.get("results", [])
        severity_counts = {"ERROR": 0, "WARNING": 0, "INFO": 0}
        for finding in findings:
            # Map Semgrep severity to our format
            severity = finding.get("severity", "INFO").upper()
            if severity in severity_counts:
                severity_counts[severity] += 1
            else:
                severity_counts["INFO"] += 1

        normalized["stats"] = {
            "total_findings": len(findings),
            "severity_counts": severity_counts
        }

    # Write normalized findings
    with open(output_file, 'w') as f:
        json.dump(normalized, f, indent=2)

    print(f"Semgrep normalization complete. Found {normalized['stats']['total_findings']} findings.")

if __name__ == "__main__":
    main()