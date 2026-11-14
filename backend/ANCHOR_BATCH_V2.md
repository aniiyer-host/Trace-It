# Anchor batch v2 rollout

New batches use schema version 2. Each receives 32 bytes from Node's
`crypto.randomBytes`, stored as 64 lowercase hexadecimal characters. The nonce
is retained with the batch for retries and reconciliation, included in the
domain-separated batch-key derivation, passed to `record_anchor_v2`, and checked
against the on-chain v2 record. Existing schema version 1 batches remain
nonce-free and use the historical derivation and account decoder.

Apply Prisma migrations before enabling the anchor worker. Build and deploy the
updated `traceit_anchor` program before enabling creation of v2 batches; old
program deployments do not recognize `record_anchor_v2`. Keep the program ID
and trusted authority configuration consistent with the deployment. Existing
PDA addresses and account bytes for v1 batches are unchanged.

`TRACEIT_ANCHOR_BATCH_SIZE` controls the maximum event count per batch and
defaults to 20. `TRACEIT_ANCHOR_BATCH_MAX_WAIT_MS` controls scheduler polling
and therefore the maximum normal formation wait for a partial eligible batch;
it defaults to 1000 ms. Lower values reduce PostgreSQL-to-batch delay while
creating more, smaller Solana transactions. Higher values improve transaction
amortization and throughput at the cost of longer wait. Neither setting changes
worker lease, confirmation, retry, or reconciliation behavior.

Integrity alerts are created only when an on-demand verification observes a
failure. They are deduplicated while the same donation/event/batch/failure
combination persists and are visible to the owning NGO and administrators.
This release does not run continuous background integrity monitoring.
