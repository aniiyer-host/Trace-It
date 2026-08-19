import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] ?? uuidv4();
  res.setHeader('x-request-id', requestId);
  // Attach requestId to request for logging purposes
  (req as any).requestId = requestId;
  next();
};