import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startHrTime = process.hrtime();

  // We'll log after the response is finished
  const logRequest = () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6; // milliseconds

    const logEntry = {
      requestId: (req as any).requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(elapsedMs),
      userId: (req.user as any)?.id ?? null,
      ip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || '',
    };

    logger.info('API Request', logEntry);
  };

  // Listen for the finish event (response sent)
  res.on('finish', logRequest);
  // Listen for the close event (if the request is aborted)
  res.on('close', logRequest);

  next();
};