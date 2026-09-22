#!/usr/bin/env bash
# Stop the solana-test-validator
pkill -f solana-test-validator 2>/dev/null || true
echo "Validator stopped."
