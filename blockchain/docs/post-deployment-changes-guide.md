# What Changes After Devnet Deployment

> **Audience:** Blockchain, backend, frontend, QA, Product, and DevOps team members
>
> **Scope:** The new minimal `traceit_anchor` program on Solana devnet
>
> **Current status (2026-10-02):** Deployment has not happened yet. `5s9AEJfEKfUrcCszpfdkZmka1XcX2XA7mbyDTmKmQywW` is the approved candidate address, but repository IDs are not yet synchronized and no deployment/config/smoke transaction has been sent. Phase 6 legacy application writes now fail closed in code.

## 1. The Short Explanation

Deployment copies the compiled blockchain program from a developer's computer to the shared Solana devnet and gives it a stable callable address. It changes **availability and persistence**, not the program's business purpose.

After deployment, teammates and backend services can call the same program through devnet without running the developer's local validator. Successful records survive laptop shutdowns and local-validator resets. Deployment does **not** automatically connect the backend, create audit batches, run the worker, or write attestations.

## 2. Before and After

| Before deployment | After devnet deployment |
|---|---|
| The compiled `.so` exists locally. | The reviewed program bytecode is stored in an executable devnet account. |
| A local validator loads it for isolated tests. | Devnet validators execute it when a valid transaction calls it. |
| Local state is private to one test validator and commonly reset. | Devnet state is shared and persists independently of team machines. |
| Test SOL, accounts, and data are controlled locally. | Transactions consume devnet SOL and interact with shared mutable state. |
| Teammates reproduce the program locally. | Teammates can read/call the deployed program using its ID and a devnet RPC. |

Deployment is similar to publishing a backend service to a shared test environment. The major Solana difference is that the deployed program is passive: it runs only when a signed transaction invokes an instruction.

## 3. The Two Programs

Trace-It intentionally has two separate programs during migration:

1. **Legacy `traceit` — `5fj53usXqFvfah3x7rYo6BxQnrvBprBZsGU49XhQxzV3`**

   It contains individual donation, status, NGO, cohort, disbursement, and attestation instructions. It remains readable for historical compatibility. The migration must stop normal new business-event writes only after Phase 6 evidence is complete.

2. **New `traceit_anchor` — candidate `5s9AEJfEKfUrcCszpfdkZmka1XcX2XA7mbyDTmKmQywW`**

   It stores compact audit-batch proofs. It does not process payments or store complete donations/attestations. The current local development ID `4qLwni…GCHX` must be replaced consistently before deployment.

Deploying the new program does not alter, replace, or erase the legacy program. Both can exist simultaneously.

## 4. Addresses, Wallets, and Accounts

Solana addresses can represent different account types. Their visible form does not explain their role.

### Candidate program identity: `5s9A…QywW`

This public key comes from the program identity keypair. During deployment it becomes the stable address used to invoke `traceit_anchor`. Once deployed, the program account holds executable code; it is not the everyday transaction-signing wallet. Separate PDA accounts hold configuration and anchor records.

The 5 devnet SOL previously airdropped to this address does not deploy the code. It also does not automatically fund transactions signed and paid by another address. Re-run preflight to determine whether those lamports can be used by the deployment process or must be moved through an explicitly reviewed transaction.

### Operator identity: `Emi2…QSrG`

`Emi2GHuHM4UnY6TqcXio3Cbfe5H1E2uukL3QgBziQSrG` is currently intended to perform several devnet roles:

- **fee payer:** pays transaction fees and account rent;
- **bootstrap authority:** is allowed to initialize `AnchorConfig`;
- **runtime authority:** signs later `record_anchor`, pause, and rotation instructions;
- **upgrade authority:** may control program upgrades, if assigned during deployment.

One keypair may fill these roles on devnet, but they are logically separate. Production should use separate online runtime/fee-payer custody and offline or multisig upgrade custody.

### Program-derived addresses (PDAs)

A PDA is a deterministic address controlled by the program rather than by a private key:

- `AnchorConfig` PDA uses seed `"anchor_config"` and stores authority, pending authority, version, pause state, and bump.
- Each `AnchorRecord` PDA uses seeds `"anchor" + batchKey` and stores one immutable root, sequence range, event count, schema, authority, Solana timestamp, and bump.

Knowing the batch key is enough to derive where its record should be. This is what makes retries and verification deterministic.

## 5. What Actually Happens After Deployment

Deployment enables, but does not automate, this runtime flow:

```text
1. A donation/status/attestation action succeeds in PostgreSQL
2. The same database transaction creates a canonical audit entry
3. Backend/Data groups ordered entries into an immutable AnchorBatch
4. The anchor worker claims that batch from durable storage
5. The worker derives the expected AnchorRecord PDA
6. It simulates record_anchor against devnet
7. Emi2…QSrG (or a later runtime authority) signs and pays
8. Devnet executes traceit_anchor at 5s9A…QywW
9. The new AnchorRecord PDA stores the compact proof
10. The worker confirms/reconciles the result and updates batch state
11. Public verification compares a locally reconstructed root with the PDA
```

The program stores no donor name, beneficiary details, document, card/payment data, or full attestation. Only opaque IDs/hashes, sequence numbers, schema information, authority, and timestamps belong on-chain.

## 6. What “Attestation Is Recorded On-Chain” Means

Under the new design, an attestation is normally represented **indirectly**:

```text
attestation data in PostgreSQL
        -> canonical audit event
        -> hash-chain/root
        -> AnchorBatch root on Solana
```

Later, the system can demonstrate that the attestation's audit event contributes to the locally reconstructed root and that the same root was anchored on Solana. This gives tamper-evident timestamped proof without publishing sensitive attestation data.

The legacy program has direct attestation accounts, but those are not the target architecture. Its old `verifyAttestation()` behavior treated account existence as validity and did not provide complete cryptographic-signature verification. Direct attestation writes should be retained only after a written Product/Compliance decision and security redesign.

## 7. What Deployment Does Not Change

- PostgreSQL remains the source of truth for application state.
- Razorpay/payment processing remains off-chain.
- Backend authorization still decides who can perform business actions.
- A Solana outage must not make a donation, disbursement, or attestation request fail.
- Existing legacy records remain at the legacy program address.
- The frontend must not ask users for blockchain wallets for ordinary workflows.
- The new program does not wake itself up, poll the database, or calculate roots.
- Deployment does not complete the Backend/Data repository or public API integration.
- Devnet is a shared testing network, not production and not a store of valuable SOL.

## 8. Changes Required in Each Application Area

### Blockchain

- synchronize every program-ID reference before building;
- deploy and initialize the new config;
- preserve IDL/binary hashes and deployment evidence;
- smoke-test a public fixture and validate exact read-back;
- keep strict account-owner, discriminator, size, PDA, authority, and field validation;
- retain local-validator tests for deterministic regression testing.

### Backend/Data

- implement canonical audit serialization and ordered hash-chain/root generation;
- persist immutable `AnchorBatch` rows and the `AnchorBatchRepository` contract;
- securely inject RPC endpoints and the runtime signer into the worker process;
- start/stop the worker outside HTTP request handlers;
- combine local-chain verification with `AnchorVerificationService` in a read-only API;
- keep normal API startup and business success independent of blockchain configuration.

### Frontend

- consume the backend's verification result rather than read Solana directly for business truth;
- display `VERIFIED`, pending, not found, mismatch, invalid account, RPC unavailable, and unsupported schema distinctly;
- show explorer links only when transaction metadata has been verified;
- never describe `RPC_UNAVAILABLE` as tampering and never expose server key material.

### DevOps/Security

- provide secret-managed signer access and approved RPC configuration;
- separate production runtime and upgrade custody;
- run the worker as a durable process;
- monitor backlog age/count, confirmation latency, RPC failures, recovered claims, dead letters, integrity conflicts, and authority balance;
- retain reviewed rollback artifacts and incident contacts.

## 9. What Teammates Need on Their Machines

To **use the shared devnet deployment**, a teammate needs the deployed program ID, devnet RPC URL, compatible IDL/client version, and—only for authorized writes—access to an approved funded signer through the team's custody process. They must not copy a private key through chat or commit one to Git.

Read-only verification needs no wallet. Authorized smoke or anchor writes need a signer and devnet SOL. Teammates do not redeploy the program just to use it.

To **develop and run the full automated suite**, teammates should still use the local validator. It is faster, free, isolated, resettable, deterministic, and unaffected by devnet rate limits or shared state. Devnet should host controlled smoke/integration tests, not replace every local test.

Typical environment values after deployment are:

```env
SOLANA_CLUSTER=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=5s9AEJfEKfUrcCszpfdkZmka1XcX2XA7mbyDTmKmQywW
SOLANA_WALLET_KEYPAIR_PATH=<server-only-secret-managed-path>
```

Actual variable names and signer injection must follow the deployed backend bootstrap. Never put the keypair path/content in frontend configuration.

## 10. Operational Behavior and Failure Cases

- **RPC unavailable before sending:** mark retryable and back off; normal APIs remain unaffected.
- **Timeout after sending:** retain the signature and enter reconciliation; check the deterministic PDA before any retry.
- **Matching PDA already exists:** treat as idempotent success only after every immutable field matches.
- **Mismatching PDA exists:** stop as an integrity conflict; never overwrite it.
- **Worker crashes:** lease expiry makes the row recoverable; recovered submitting work reconciles first.
- **Retry limit reached:** place the batch in dead-letter/manual review.
- **Runtime key suspected:** pause anchoring, stop the worker, inspect records, and rotate through the two-step authority process.
- **Bad release:** pause new anchors and redeploy the preserved reviewed artifact through the normal approval flow; historical state must remain readable.

Read RPCs may fail over after transport errors. A definitive “not found,” invalid account, or mismatch is an authoritative result and must not be hidden by querying providers until one gives a preferred answer. Writes remain on the primary RPC because switching after an ambiguous send risks duplicates.

## 11. First Actions Immediately After Deployment

1. Record the program ID, ProgramData address, deployment slot, upgrade authority, fee payer, artifact hashes, and deployment signature.
2. Initialize `AnchorConfig` with the approved runtime authority.
3. Simulate and submit only the public `multiple_events` smoke fixture.
4. Read the config and record back; validate owner, discriminator, PDA/bump, authority, schema, range, count, and exact root.
5. Record initialization and anchor signatures, config/record PDAs, and explorer evidence in `blockchain/deployments/devnet-anchor.json`.
6. Rerun preflight in “expect deployed” mode.
7. Enable monitoring and alert routing before starting a continuous worker.
8. Integrate the durable repository and public verification route in a controlled environment.
9. Observe successful anchoring and outage recovery before deploying the already-implemented Phase 6 legacy-write cutover.

Every write must be simulated and then explicitly approved with the cluster, instruction, accounts, fee payer, and expected cost shown. Mainnet requires a separate security/release plan and separate approval.

## 12. How to Tell Whether the System Is Fully Working

The system is not complete merely because `solana program show` finds the executable. A complete devnet path requires all of the following:

- the program is deployed under the intended address and authority;
- `AnchorConfig` is initialized and not unexpectedly paused;
- Backend/Data creates a valid immutable batch from a locally verified audit chain;
- the durable worker submits and confirms it;
- the expected PDA contains an exact immutable match;
- the repository records confirmed state and survives restarts;
- the public API returns the correct verification state;
- ordinary business workflows still succeed when Solana is unavailable;
- monitoring detects backlog, RPC, balance, dead-letter, and integrity problems.

Deployment supplies the shared execution layer. The integrations around it turn that layer into a working Trace-It audit system.
