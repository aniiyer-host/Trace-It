import { UserRole } from '../../generated/prisma/enums.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        fullName?: string | null;
        role: UserRole;
        isVerified: boolean;
        ngoStatus?: NgoStatus;
        kycStatus?: KycStatus;
      } | null;
    }
  }
}