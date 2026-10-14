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
: "${TRACEIT_FEE_PAYER_PUBKEY:?TRACEIT_FEE_PAYER_PUBKEY is required}"
: "${TRACEIT_UPGRADE_AUTHORITY_PUBKEY:?TRACEIT_UPGRADE_AUTHORITY_PUBKEY is required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
DECLARED_ID="$(sed -n 's/.*declare_id!("\([1-9A-HJ-NP-Za-km-z]*\)").*/\1/p' "$ROOT/programs/traceit_anchor/src/lib.rs")"
DEPLOYMENT_ID="$(solana-keygen pubkey "$TRACEIT_DEPLOY_PROGRAM_KEYPAIR")"
REVIEWED_PROGRAM_ID="$(node -p "require('./deployments/devnet-anchor.json').program.candidateDeploymentKeypairId")"

if [[ "$DECLARED_ID" != "$TRACEIT_ANCHOR_PROGRAM_ID" || \
      "$DEPLOYMENT_ID" != "$DECLARED_ID" || \
      "$DECLARED_ID" != "$REVIEWED_PROGRAM_ID" ]]; then
  echo "Refusing to deploy: declared, configured, keypair, and reviewed program IDs differ" >&2
  exit 1
fi

NO_DNA=1 anchor build
ARTIFACT_HASH="$(sha256sum target/deploy/traceit_anchor.so | awk '{print $1}')"
REVIEWED_HASH="$(node -p "require('./deployments/devnet-anchor.json').program.binarySha256")"
if [[ "$ARTIFACT_HASH" != "$REVIEWED_HASH" ]]; then
  echo "Refusing to deploy: built binary hash differs from the reviewed deployment record" >&2
  exit 1
fi
REVIEWED_IDL_HASH="$(node -p "require('./deployments/devnet-anchor.json').program.idlSha256")"
COMMITTED_IDL_HASH="$(sha256sum idl/traceit_anchor.json | awk '{print $1}')"
BUILT_IDL_HASH="$(sha256sum target/idl/traceit_anchor.json | awk '{print $1}')"
if [[ "$COMMITTED_IDL_HASH" != "$REVIEWED_IDL_HASH" || \
      "$BUILT_IDL_HASH" != "$REVIEWED_IDL_HASH" ]]; then
  echo "Refusing to deploy: committed or generated IDL differs from the reviewed deployment record" >&2
  exit 1
fi

REVIEWED_FEE_PAYER="$(node -p "require('./deployments/devnet-anchor.json').authorities.feePayer")"
REVIEWED_UPGRADE_AUTHORITY="$(node -p "require('./deployments/devnet-anchor.json').authorities.upgrade")"
FEE_PAYER_ID="$(solana-keygen pubkey "$ANCHOR_WALLET")"
if [[ "$FEE_PAYER_ID" != "$TRACEIT_FEE_PAYER_PUBKEY" || \
      "$TRACEIT_FEE_PAYER_PUBKEY" != "$REVIEWED_FEE_PAYER" || \
      "$TRACEIT_UPGRADE_AUTHORITY_PUBKEY" != "$REVIEWED_UPGRADE_AUTHORITY" || \
      "$TRACEIT_FEE_PAYER_PUBKEY" != "$TRACEIT_UPGRADE_AUTHORITY_PUBKEY" ]]; then
  echo "Refusing to deploy: wallet identity does not match the reviewed fee-payer/upgrade-authority policy" >&2
  exit 1
fi

# Refresh cluster, identity, balance, rent, and existing-account checks against
# Devnet after building the exact artifact that will be submitted.
PREFLIGHT_OUTPUT="$(TRACEIT_DEPLOYMENT_PROGRAM_ID="$TRACEIT_ANCHOR_PROGRAM_ID" \
  TRACEIT_FEE_PAYER_PUBKEY="$TRACEIT_FEE_PAYER_PUBKEY" \
  TRACEIT_UPGRADE_AUTHORITY_PUBKEY="$TRACEIT_UPGRADE_AUTHORITY_PUBKEY" \
  npx ts-node scripts/devnet-preflight.ts)"
printf '%s\n' "$PREFLIGHT_OUTPUT"
node -e 'const result = JSON.parse(process.argv[1]); if (!result.ready || result.deployment.exists) process.exit(1)' "$PREFLIGHT_OUTPUT" || {
  echo "Refusing to deploy: fresh preflight is not ready or the program account already exists" >&2
  exit 1
}

NO_DNA=1 solana program deploy \
  --url devnet \
  --keypair "$ANCHOR_WALLET" \
  --upgrade-authority "$ANCHOR_WALLET" \
  --program-id "$TRACEIT_DEPLOY_PROGRAM_KEYPAIR" \
  target/deploy/traceit_anchor.so
NO_DNA=1 solana program show "$TRACEIT_ANCHOR_PROGRAM_ID" --url devnet
