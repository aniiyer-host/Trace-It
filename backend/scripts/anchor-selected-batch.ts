import "dotenv/config";
import { createAnchorRuntimeFromEnvironment } from "../src/services/anchor/anchorWorkerBootstrap.js";
import { formatAnchorOperatorError } from "../src/services/anchor/anchorDiagnostics.js";

const [batchId, confirmation] = process.argv.slice(2);
const requiredProgramId = "3CLytt82BKNwqMQA7M9fqJrMAhgD5t9dpuDC4TwutVFa";

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId ?? "")) {
  throw new Error("Usage: tsx scripts/anchor-selected-batch.ts <batch-uuid> --submit-devnet");
}
if (confirmation !== "--submit-devnet") {
  throw new Error("Refusing to submit without the explicit --submit-devnet flag");
}
if (process.env.TRACEIT_ANCHOR_CLUSTER !== "devnet" ||
    process.env.TRACEIT_ANCHOR_PROGRAM_ID !== requiredProgramId) {
  throw new Error("Refusing to submit: configuration must target the existing Trace-It Devnet program");
}

const runtime = await createAnchorRuntimeFromEnvironment();
if (!runtime) throw new Error("Anchor runtime configuration or schema is unavailable");

try {
  const result = await runtime.processOneBatch(batchId);
  console.log(result === "IDLE"
    ? "Selected anchor batch was not eligible; no processing occurred."
    : result === "FAILED"
      ? "Selected anchor batch processing failed; inspect the sanitized diagnostic above."
      : "Selected anchor batch was handled. This does not confirm an on-chain anchor; verify persisted status, PDA, and signature.");
} catch (error) {
  console.error(formatAnchorOperatorError(error));
  process.exitCode = 1;
}
