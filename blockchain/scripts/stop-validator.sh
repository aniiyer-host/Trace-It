#!/usr/bin/env bash
# Stop the solana-test-validator
set -e

# Configuration - must match start-validator.sh
LOCK_DIR="/tmp/traceit-validator-lock"
LOCK_FILE="$LOCK_DIR/lock"

# Validate lock directory exists
if [ ! -d "$LOCK_DIR" ]; then
  echo "No validator lock directory found. Validator may not be running."
  exit 0
fi

# Validate lock file exists
if [ ! -f "$LOCK_FILE" ]; then
  echo "Lock directory exists but no PID file found. Cleaning up lock directory."
  rm -rf "$LOCK_DIR"
  exit 0
fi

# Read PID from lock file
VALIDATOR_PID=$(cat "$LOCK_FILE")

# Validate PID is a number
if ! [[ "$VALIDATOR_PID" =~ ^[0-9]+$ ]]; then
  echo "Invalid PID in lock file: $VALIDATOR_PID"
  echo "Cleaning up lock directory."
  rm -rf "$LOCK_DIR"
  exit 0
fi

# Check if process is running
if ! ps -p "$VALIDATOR_PID" >/dev/null 2>&1; then
  echo "Validator process (PID: $VALIDATOR_PID) is not running."
  echo "Cleaning up lock directory."
  rm -rf "$LOCK_DIR"
  exit 0
fi

# Verify it's actually our validator by examining command line
if [ -r "/proc/$VALIDATOR_PID/cmdline" ]; then
  CMDLINE=$(tr '\0' ' ' < "/proc/$VALIDATOR_PID/cmdline")
  if [[ "$CMDLINE" == *"solana-test-validator"* ]]; then
    echo "Stopping validator (PID: $VALIDATOR_PID)..."
    kill "$VALIDATOR_PID" 2>/dev/null || true

    # Wait for process to terminate gracefully
    for i in $(seq 1 10); do
      if ! ps -p "$VALIDATOR_PID" >/dev/null 2>&1; then
        echo "Validator stopped successfully."
        rm -rf "$LOCK_DIR"
        exit 0
      fi
      sleep 0.5
    done

    # Force kill if still running
    if ps -p "$VALIDATOR_PID" >/dev/null 2>&1; then
      echo "Validator did not stop gracefully, forcing..."
      kill -9 "$VALIDATOR_PID" 2>/dev/null || true
    fi
  else
    echo "Process PID: $VALIDATOR_PID is not a solana-test-validator process."
    echo "Command line: $CMDLINE"
    echo "Not stopping it to avoid killing unrelated processes."
    exit 0
  fi
else
  # Cannot access /proc, fall back to basic check
  echo "Stopping process PID: $VALIDATOR_PID (cannot verify command line)..."
  kill "$VALIDATOR_PID" 2>/dev/null || true

  # Wait for process to terminate
  for i in $(seq 1 10); do
    if ! ps -p "$VALIDATOR_PID" >/dev/null 2>&1; then
      echo "Validator stopped."
      rm -rf "$LOCK_DIR"
      exit 0
    fi
    sleep 0.5
  done

  # Force kill if still running
  if ps -p "$VALIDATOR_PID" >/dev/null 2>&1; then
    echo "Validator did not stop gracefully, forcing..."
    kill -9 "$VALIDATOR_PID" 2>/dev/null || true
  fi
fi

# Clean up lock directory
rm -rf "$LOCK_DIR"
echo "Validator stopped and lock cleaned up."
