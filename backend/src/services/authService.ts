import { prisma } from "../db/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { generateOTP, sendOTP } from "./emailService";

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Validate required environment variables
if (!JWT_ACCESS_SECRET) {
  throw new Error("JWT_ACCESS_SECRET environment variable is required");
}
if (!JWT_REFRESH_SECRET) {
  throw new Error("JWT_REFRESH_SECRET environment variable is required");
}
const JWT_ACCESS_EXPIRES_IN = "15m";
const JWT_REFRESH_EXPIRES_IN = "7d";

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (
  password: string,
  hashed: string,
): Promise<boolean> => {
  return bcrypt.compare(password, hashed);
};

export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_ACCESS_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  });
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
};

export const hashToken = async (token: string): Promise<string> => {
  return bcrypt.hash(token, 10);
};

export const signup = async (
  email: string,
  password: string,
  fullName?: string,
  phone?: string,
) => {
  // Check if user already exists
  const existingUser = await prisma.profile.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error("User already exists");
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
    throw new Error("User not found");
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
    throw new Error("Invalid or expired OTP");
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

export const login = async (email: string, password: string) => {
  // Find user by email
  const user = await prisma.profile.findUnique({ where: { email } });
  if (!user) {
    throw new Error("Invalid credentials");
  }

  // Check if password hash exists
  if (!user.passwordHash) {
    throw new Error("Invalid credentials");
  }

  // Check password
  const passwordValid = await comparePassword(password, user.passwordHash);
  if (!passwordValid) {
    throw new Error("Invalid credentials");
  }

  // Generate access token
  const accessToken = generateAccessToken(user.id);

  // Generate refresh token and hash it for storage
  const refreshToken = generateRefreshToken(user.id);
  const refreshTokenHash = await hashToken(refreshToken);

  // Update user with refresh token hash
  await prisma.profile.update({
    where: { id: user.id },
    data: { refreshTokenHash },
  });

  // Return tokens (in practice, send refresh token as HttpOnly cookie)
  return { accessToken, refreshToken };
};

export const refreshToken = async (oldRefreshToken: string) => {
  // Find users with a non-null refreshTokenHash
  const users = await prisma.profile.findMany({
    where: { refreshTokenHash: { not: null } },
    select: { id: true, refreshTokenHash: true },
  });

  for (const u of users) {
    // Since we know refreshTokenHash is not null due to the where clause, we can use non-null assertion
    const isValid = await bcrypt.compare(oldRefreshToken, u.refreshTokenHash!);
    if (isValid) {
      // Found the user
      // Generate new tokens
      const accessToken = generateAccessToken(u.id);
      const newRefreshToken = generateRefreshToken(u.id);
      const newRefreshTokenHash = await hashToken(newRefreshToken);

      // Update the refresh token hash
      await prisma.profile.update({
        where: { id: u.id },
        data: { refreshTokenHash: newRefreshTokenHash },
      });

      return { accessToken, refreshToken: newRefreshToken };
    }
  }

  throw new Error("Invalid refresh token");
};

export const logout = async (refreshToken: string) => {
  let userId: string;
  try {
    // Verify and decode the refresh token to get userId
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch (error) {
    throw new Error("Invalid refresh token");
  }

  // Find the specific user by ID
  const user = await prisma.profile.findUnique({
    where: { id: userId },
    select: { id: true, refreshTokenHash: true },
  });

  if (!user || !user.refreshTokenHash) {
    throw new Error("Invalid refresh token");
  }

  // Verify the token hash
  const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!isValid) {
    throw new Error("Invalid refresh token");
  }

  // Found the user
  await prisma.profile.update({
    where: { id: user.id },
    data: { refreshTokenHash: null },
  });

  return { success: true };
};
