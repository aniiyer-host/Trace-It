#!/usr/bin/env bash
# Stop only the Trace-It local Solana validator.
set -e

LEDGER="/tmp/traceit-test-ledger"
LOCK_DIR="/tmp/traceit-validator-lock"
LOCK_FILE="$LOCK_DIR/lock"

if [ ! -f "$LOCK_FILE" ]; then
  echo "No validator PID lock found; nothing to stop."
  exit 0
fi

VALIDATOR_PID=$(cat "$LOCK_FILE")
if ! [[ "$VALIDATOR_PID" =~ ^[0-9]+$ ]]; then
  echo "Invalid PID in lock file; refusing to kill any process."
  exit 1
fi

CMDLINE=$(ps -p "$VALIDATOR_PID" -o command= 2>/dev/null || true)
if [ -z "$CMDLINE" ]; then
  echo "Validator process is not running; removing stale lock."
  rm -rf "$LOCK_DIR"
  exit 0
fi

if [[ "$CMDLINE" != *"solana-test-validator"* || "$CMDLINE" != *"--ledger $LEDGER"* ]]; then
  echo "PID $VALIDATOR_PID does not match the expected validator and ledger."
  echo "Refusing to stop it."
  exit 1
fi

echo "Stopping Trace-It validator (PID: $VALIDATOR_PID)..."
kill "$VALIDATOR_PID" 2>/dev/null || true

for _ in $(seq 1 20); do
  if ! ps -p "$VALIDATOR_PID" >/dev/null 2>&1; then
    rm -rf "$LOCK_DIR"
    echo "Validator stopped."
    exit 0
  fi
  sleep 0.5
done

CMDLINE=$(ps -p "$VALIDATOR_PID" -o command= 2>/dev/null || true)
if [[ "$CMDLINE" == *"solana-test-validator"* && "$CMDLINE" == *"--ledger $LEDGER"* ]]; then
  echo "Validator did not stop gracefully; forcing termination."
  kill -9 "$VALIDATOR_PID" 2>/dev/null || true
  for _ in $(seq 1 10); do
    if ! ps -p "$VALIDATOR_PID" >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
fi

CMDLINE=$(ps -p "$VALIDATOR_PID" -o command= 2>/dev/null || true)
if [[ "$CMDLINE" == *"solana-test-validator"* && "$CMDLINE" == *"--ledger $LEDGER"* ]]; then
  echo "Validator may still be running; preserving the PID lock."
  exit 1
fi

rm -rf "$LOCK_DIR"
echo "Validator cleanup finished."
