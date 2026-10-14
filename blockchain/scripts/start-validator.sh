#!/usr/bin/env bash
# Start solana-test-validator with the traceit program pre-loaded
set -e

# Configuration
LEDGER=/tmp/traceit-test-ledger
PROGRAM_ID="5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3"
SO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/target/deploy/traceit.so"
ANCHOR_PROGRAM_ID="3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa"
ANCHOR_SO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/target/deploy/traceit_anchor.so"
WALLET_PATH="$HOME/.config/solana/traceit-v1-authority.json"
WALLET_PUBKEY=$(solana-keygen pubkey "$WALLET_PATH")
LOG=/tmp/traceit-validator.log
LOCK_DIR="/tmp/traceit-validator-lock"
LOCK_FILE="$LOCK_DIR/lock"

# Validate wallet exists and matches test workflow expectation
if [ ! -f "$WALLET_PATH" ]; then
  echo "Error: Wallet not found at $WALLET_PATH"
  echo "Please ensure the wallet exists and matches the test workflow configuration."
  exit 1
fi

# Create lock directory safely (atomic operation)
if mkdir "$LOCK_DIR" 2>/dev/null; then
  # Successfully acquired lock
  :
else
  # Check if another process holds the lock
  if [ -f "$LOCK_FILE" ]; then
    OTHER_PID=$(cat "$LOCK_FILE")
    # Verify if the process is actually running and is our validator
    if ps -p "$OTHER_PID" >/dev/null 2>&1; then
      # Check if it's actually our validator by examining command line
      if [ -n "$(ps -p "$OTHER_PID" -o command= 2>/dev/null)" ]; then
        CMDLINE=$(ps -p "$OTHER_PID" -o command= 2>/dev/null || true)
        if [[ "$CMDLINE" == *"solana-test-validator"* && "$CMDLINE" == *"--ledger $LEDGER"* ]]; then
          echo "Validator is already running (PID: $OTHER_PID)"
          exit 0
        fi
      fi
    fi
    # If we get here, the lock is stale - remove it and try to acquire
    rm -rf "$LOCK_DIR"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      # Lock acquired
      :
    else
      echo "Failed to acquire lock after cleaning stale lock"
      exit 1
    fi
  else
    # No PID file but directory exists - edge case
    rm -rf "$LOCK_DIR"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      # Lock acquired
      :
    else
      echo "Failed to acquire lock"
      exit 1
    fi
  fi
fi

# Remove an empty lock if startup exits before recording a PID.
cleanup_start_lock() {
  if [ ! -f "$LOCK_FILE" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}
trap cleanup_start_lock EXIT

# Ensure program binary is built (no fallback to host build)
if [ ! -f "$SO_PATH" ] || [ ! -f "$ANCHOR_SO_PATH" ]; then
  echo "Error: Program binary missing. Please run 'npm run build' to build the programs."
  echo "Expected files:"
  echo "  $SO_PATH"
  echo "  $ANCHOR_SO_PATH"
  exit 1
fi

# Kill any existing validator that matches our exact configuration
if [ -f "$LOCK_FILE" ]; then
  EXISTING_PID=$(cat "$LOCK_FILE")
  if ps -p "$EXISTING_PID" >/dev/null 2>&1; then
    if [ -n "$(ps -p "$EXISTING_PID" -o command= 2>/dev/null)" ]; then
      EXISTING_CMDLINE=$(ps -p "$EXISTING_PID" -o command= 2>/dev/null || true)
      if [[ "$EXISTING_CMDLINE" == *"solana-test-validator"* && "$EXISTING_CMDLINE" == *"--ledger $LEDGER"* ]]; then
        echo "Stopping existing validator (PID: $EXISTING_PID)"
        kill "$EXISTING_PID" 2>/dev/null || true
        # Wait for process to terminate
        for i in $(seq 1 10); do
          if ! ps -p "$EXISTING_PID" >/dev/null 2>&1; then
            break
          fi
          sleep 0.5
        done
        # Force kill if still running
        if ps -p "$EXISTING_PID" >/dev/null 2>&1; then
          kill -9 "$EXISTING_PID" 2>/dev/null || true
        fi
      fi
    fi
  fi
fi

# Clean up any old log
rm -f "$LOG"

# Start validator in background
echo "Starting Solana validator..."
solana-test-validator \
  --ledger "$LEDGER" \
  --mint "$WALLET_PUBKEY" \
  --bpf-program "$PROGRAM_ID" "$SO_PATH" \
  --bpf-program "$ANCHOR_PROGRAM_ID" "$ANCHOR_SO_PATH" \
  --reset \
  --quiet \
  >"$LOG" 2>&1 &

VALIDATOR_PID=$!
echo "$VALIDATOR_PID" > "$LOCK_FILE"
echo "Validator PID: $VALIDATOR_PID"

# Wait until RPC is healthy with exponential backoff
echo "Waiting for validator to start..."
for i in $(seq 1 30); do
  if curl -sf -X POST http://127.0.0.1:8899 \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q '"ok"'; then
    echo "Validator ready after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "Validator failed to start. Log:"
cat "$LOG"

# Stop only the process we launched, after verifying its command.
CMDLINE=$(ps -p "$VALIDATOR_PID" -o command= 2>/dev/null || true)
if [[ "$CMDLINE" == *"solana-test-validator"* && "$CMDLINE" == *"--ledger $LEDGER"* ]]; then
  kill "$VALIDATOR_PID" 2>/dev/null || true
fi
rm -rf "$LOCK_DIR"
exit 1
