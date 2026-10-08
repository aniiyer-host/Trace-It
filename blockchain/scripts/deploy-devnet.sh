#!/usr/bin/env bash
set -euo pipefail

CONSENT="I_ACKNOWLEDGE_DEVNET_FEES"
if [[ "${TRACEIT_ALLOW_DEVNET_TRANSACTIONS:-}" != "$CONSENT" ]]; then
  echo "Refusing to deploy: TRACEIT_ALLOW_DEVNET_TRANSACTIONS must equal $CONSENT" >&2
  exit 1
fi

: "${TRACEIT_DEPLOY_PROGRAM_KEYPAIR:?TRACEIT_DEPLOY_PROGRAM_KEYPAIR is required}"
: "${ANCHOR_WALLET:?ANCHOR_WALLET is required}"
: "${TRACEIT_ANCHOR_PROGRAM_ID:?TRACEIT_ANCHOR_PROGRAM_ID is required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DECLARED_ID="$(sed -n 's/.*declare_id!("\([1-9A-HJ-NP-Za-km-z]*\)").*/\1/p' "$ROOT/programs/traceit_anchor/src/lib.rs")"
DEPLOYMENT_ID="$(solana-keygen pubkey "$TRACEIT_DEPLOY_PROGRAM_KEYPAIR")"

if [[ "$DECLARED_ID" != "$TRACEIT_ANCHOR_PROGRAM_ID" || "$DEPLOYMENT_ID" != "$DECLARED_ID" ]]; then
  echo "Refusing to deploy: declared, configured, and deployment-keypair program IDs differ" >&2
  exit 1
fi

cd "$ROOT"
NO_DNA=1 anchor build
NO_DNA=1 solana program deploy \
  --url devnet \
  --keypair "$ANCHOR_WALLET" \
  --upgrade-authority "$ANCHOR_WALLET" \
  --program-id "$TRACEIT_DEPLOY_PROGRAM_KEYPAIR" \
  target/deploy/traceit_anchor.so
NO_DNA=1 solana program show "$TRACEIT_ANCHOR_PROGRAM_ID" --url devnet
