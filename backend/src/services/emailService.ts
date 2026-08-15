import { v4 as uuidv4 } from 'uuid';
import { delay } from '../lib/utils';

// For now, we'll just log the OTP. In production, this would use SendGrid.
export const sendOTP = async (email: string, otp: string) => {
  console.log(`OTP for ${email}: ${otp}`);
  // Simulate network delay
  await delay(1000);
};

// We'll also create a function to generate a 6-digit OTP
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Stub for notifying admins
export const notifyAdmin = async (subject: string, message: string) => {
  console.log(`[ADMIN NOTIFICATION] ${subject}: ${message}`);
  await delay(500);
};