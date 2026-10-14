import { delay } from '../lib/utils.js';

export * from './email/notificationService.js';
export * from './email/emailProvider.js';
export * from './email/resendEmailProvider.js';

// For now, we'll just log the OTP. In production, this would use Resend.
export const sendOTP = async (email: string, otp: string) => {
  console.log(`OTP for ${email}: ${otp}`);
  await delay(1000);
};

export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const notifyAdmin = async (subject: string, message: string) => {
  console.log(`[ADMIN NOTIFICATION] ${subject}: ${message}`);
  await delay(500);
};