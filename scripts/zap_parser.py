#!/usr/bin/env python3
"""
Simple ZAP parser for evidence-only mode.
Preserves ZAP alerts in normalized format.
"""
import json
import sys
import os

def main():
    input_file = "zap-alerts.json"
    output_file = "normalized-dast-findings.json"

    # Ensure input file exists
    if not os.path.exists(input_file):
        # Create empty normalized findings if no ZAP alerts
        normalized = {
            "findings": [],
            "scanner": "zap",
            "timestamp": "",
            "stats": {
                "total_alerts": 0,
                "risk_counts": {
                    "High": 0,
                    "Medium": 0,
                    "Low": 0,
                    "Informational": 0
                }
            }
        }
    else:
        # Read ZAP alerts
        with open(input_file, 'r') as f:
            zap_data = json.load(f)

        # ZAP alerts format is usually a list under the "site" key or direct list
        # Handle both possible formats
        if isinstance(zap_data, dict) and "site" in zap_data:
            # Old ZAP format
            sites = zap_data.get("site", [])
            alerts = []
            for site in sites:
                alerts.extend(site.get("alerts", []))
        elif isinstance(zap_data, list):
            # Newer ZAP format - direct list of alerts
            alerts = zap_data
        else:
            # Fallback - try to find alerts in common locations
            alerts = zap_data.get("alerts", [])

        # Convert to normalized format
        normalized = {
            "findings": alerts,
            "scanner": "zap",
            "timestamp": "",
            "raw_report": zap_data
        }

        # Add basic stats
        risk_counts = {"High": 0, "Medium": 0, "Low": 0, "Informational": 0}
        for alert in alerts:
            # Map ZAP risk level
            risk = alert.get("riskcode", alert.get("risk", "0"))
            if risk == "3" or str(risk).lower() == "high":
                risk_counts["High"] += 1
            elif risk == "2" or str(risk).lower() == "medium":
                risk_counts["Medium"] += 1
            elif risk == "1" or str(risk).lower() == "low":
                risk_counts["Low"] += 1
            else:
                risk_counts["Informational"] += 1

        normalized["stats"] = {
            "total_alerts": len(alerts),
            "risk_counts": risk_counts
        }

    # Write normalized findings
    with open(output_file, 'w') as f:
        json.dump(normalized, f, indent=2)

    print(f"ZAP normalization complete. Found {normalized['stats']['total_alerts']} alerts.")

if __name__ == "__main__":
    main()