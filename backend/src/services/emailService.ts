import { delay } from '../lib/utils.js';

export * from './email/notificationService.js';
export * from './email/emailProvider.js';
export * from './email/resendEmailProvider.js';

// OTP delivery is not wired to a provider yet. Never write the credential or
// its recipient to logs while this stub remains in place.
export const sendOTP = async (_email: string, _otp: string) => {
  await delay(1000);
};

export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const notifyAdmin = async (subject: string, message: string) => {
  void subject;
  void message;
  await delay(500);
};
