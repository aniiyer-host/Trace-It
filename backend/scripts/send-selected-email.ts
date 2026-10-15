import "dotenv/config";
import { EmailOutboxProcessor } from "../src/services/email/emailOutboxProcessor.js";

const [jobId, confirmation] = process.argv.slice(2);

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId ?? "")) {
  throw new Error("Usage: tsx scripts/send-selected-email.ts <outbox-job-uuid> --send-this-email-now");
}
if (confirmation !== "--send-this-email-now") {
  throw new Error("Refusing to send without the explicit --send-this-email-now flag");
}
if (process.env.TRACEIT_EMAIL_WORKER_ENABLED === "true") {
  throw new Error("Refusing selected send while the general email worker is enabled");
}

const processed = await new EmailOutboxProcessor().processSelectedJob(jobId);
console.log(processed
  ? "Selected job was attempted; inspect its persisted status and inbox."
  : "Selected job is no longer due and pending; no email was sent.");
