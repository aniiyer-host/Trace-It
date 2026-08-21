import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import "dotenv/config";

import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import publicRoutes from "./routes/public";
import donorRoutes from "./routes/donor";
import charityRoutes from "./routes/charity";
import adminRoutes from "./routes/admin";
import webhookRoutes from "./routes/webhooks/razorpay";

import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import BlockchainRetryProcessor from "./services/blockchainRetryProcessor";
import { validateEnvironment } from "./utils/envValidator";

validateEnvironment();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(cookieParser());
app.use(express.json({ verify: (req, res, buf) => { (req as any).rawBody = buf; } }));
// Removed mongoSanitize as Prisma parameterizes queries, and express-mongo-sanitize crashes Express 5
// Request ID middleware
import { requestIdMiddleware } from "./middleware/requestIdMiddleware";
app.use(requestIdMiddleware);
// Request logging middleware
import { requestLogger } from "./middleware/requestLogger";
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Routes
app.get("/", (req, res) => {
  res.json({ message: "TraceIt API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/donor", donorRoutes);
app.use("/api/charity", charityRoutes);
app.use("/api/admin", adminRoutes);
//RazorPay
//app.use("/api/webhooks", webhookRoutes);
app.use("/api/webhooks/razorpay", webhookRoutes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// Start blockchain retry processor (only in non-test environments)
if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
  const retryProcessor = new BlockchainRetryProcessor();
  retryProcessor.start().catch(console.error);

  // Graceful shutdown handling
  process.on("SIGINT", () => {
    retryProcessor.stop();
    // ... existing shutdown code ...
  });

  process.on("SIGTERM", () => {
    retryProcessor.stop();
    // ... existing shutdown code ...
  });
}

// Health check endpoint (placed before 404 handler for orchestrator compatibility)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Start blockchain retry processor (only in non-test environments)
if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
  const retryProcessor = new BlockchainRetryProcessor();
  retryProcessor.start().catch(console.error);

  // Graceful shutdown handling
  process.on("SIGINT", () => {
    retryProcessor.stop();
    // ... existing shutdown code ...
  });

  process.on("SIGTERM", () => {
    retryProcessor.stop();
    // ... existing shutdown code ...
  });
}

export default app;
