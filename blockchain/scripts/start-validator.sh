#!/usr/bin/env bash
# Start solana-test-validator with the traceit program pre-loaded
set -e

LEDGER=/tmp/traceit-test-ledger
PROGRAM_ID="5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3"
SO_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/target/deploy/traceit.so"
WALLET_PUBKEY=$(solana-keygen pubkey ~/.config/solana/devnet-traceit.json)
LOG=/tmp/traceit-validator.log

# Kill any existing validator
pkill -f solana-test-validator 2>/dev/null || true
sleep 1

# Start validator in background
solana-test-validator \
  --ledger "$LEDGER" \
  --mint "$WALLET_PUBKEY" \
  --bpf-program "$PROGRAM_ID" "$SO_PATH" \
  --reset \
  --quiet \
  >"$LOG" 2>&1 &

VALIDATOR_PID=$!
echo "Validator PID: $VALIDATOR_PID"

# Wait until RPC is healthy
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
exit 1
