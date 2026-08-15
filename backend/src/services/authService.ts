import { PrismaClient } from '../../generated/prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateOTP, sendOTP } from './emailService';

const prisma = new PrismaClient();

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const JWT_ACCESS_EXPIRES_IN = '15m';
const JWT_REFRESH_EXPIRES_IN = '7d';

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hashed: string): Promise<boolean> => {
  return bcrypt.compare(password, hashed);
};

export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
};

export const signup = async (email: string, password: string, fullName?: string, phone?: string) => {
  // Check if user already exists
  const existingUser = await prisma.profile.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error('User already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Generate OTP
  const otp = generateOTP();

  // Create user
  const user = await prisma.profile.create({
    data: {
      email,
      passwordHash,
      fullName,
      phone,
      isVerified: false, // will be set to true after OTP verification
    },
  });

  // Send OTP (in production, use SendGrid or similar)
  await sendOTP(email, otp);

  // Store OTP and expiry in email_verifications table
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  await prisma.emailVerification.create({
    data: {
      profileId: user.id,
      otpCode: otp,
      expiresAt,
    },
  });

  // Return user without password and OTP
  const { passwordHash: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

export const verifyEmail = async (email: string, otpCode: string) => {
  // Find user by email
  const user = await prisma.profile.findUnique({ where: { email } });
  if (!user) {
    throw new Error('User not found');
  }

  // Find valid OTP
  const verification = await prisma.emailVerification.findFirst({
    where: {
      profileId: user.id,
      otpCode,
      expiresAt: { gt: new Date() },
      consumedAt: null,
    },
  });

  if (!verification) {
    throw new Error('Invalid or expired OTP');
  }

  // Mark OTP as consumed
  await prisma.emailVerification.update({
    where: { id: verification.id },
    data: { consumedAt: new Date() },
  });

  // Mark user as verified
  await prisma.profile.update({
    where: { id: user.id },
    data: { isVerified: true },
  });

  return { id: user.id, email: user.email, isVerified: true };
};