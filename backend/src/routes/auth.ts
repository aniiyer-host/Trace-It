import { Router } from 'express';
import { signupSchema, verifyEmailSchema, loginSchema } from '../utils/validation.js';
import { signup, verifyEmail, login, refreshToken, logout, generateAccessToken } from '../services/authService.js';
import { authLimiter } from '../middleware/strictLimiter.js';
import { writeAuditLog } from '../services/auditLogService.js';
import { AuditActorType } from '../../generated/prisma/enums.js';
import { prisma } from '../db/prisma.js';

const router = Router();

// Apply strict rate limiting to all auth routes
router.use(authLimiter);

/**
 * @route POST /api/auth/signup
 * @desc Register a new user
 * @access Public
 */
router.post('/signup', async (req, res) => {
  try {
    // Validate input
    const { error, value } = signupSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, fullName, phone } = value;

    // Signup user
    const user = await signup(email, password, fullName, phone);

    res.status(201).json({
      message: 'User created successfully. Please check your email for OTP.',
      user,
    });
  } catch (err: any) {
    if (err.message === 'User already exists') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route POST /api/auth/register
 * @desc Alias for /signup — accepts { email, password, name } from the frontend
 *       and returns the unified { token, user } shape so both auth endpoints
 *       have a consistent response contract.
 * @access Public
 */
router.post('/register', async (req, res) => {
  try {
    // Remap 'name' → 'fullName' so the existing signupSchema passes
    const body = { ...req.body, fullName: req.body.fullName ?? req.body.name };
    const { error, value } = signupSchema.validate(body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password, fullName, phone } = value;

    const user = await signup(email, password, fullName, phone);

    // Generate an access token immediately so the frontend can start authenticated requests
    const accessToken = generateAccessToken(user.id);

    res.status(201).json({
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.fullName ?? undefined,
        role: user.role,
      },
    });
  } catch (err: any) {
    if (err.message === 'User already exists') {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @route POST /api/auth/verify-email
 * @desc Verify email with OTP
 * @access Public
 */
router.post('/verify-email', async (req, res) => {
  try {
    // Validate input
    const { error, value } = verifyEmailSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, otpCode } = value;

    // Verify email
    const result = await verifyEmail(email, otpCode);

    res.status(200).json({
      message: 'Email verified successfully',
      user: result,
    });
  } catch (err: any) {
    if (err.message === 'Invalid or expired OTP' || err.message === 'User not found') {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Login user and return tokens
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { email, password } = value;

    const tokens = await login(email, password);

    // Get user for audit log AND response payload (single query, no extra round-trip)
    const user = await prisma.profile.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true, role: true },
    });

    // Log successful login
    await writeAuditLog({
      actorType: AuditActorType.USER,
      actorId: user?.id ?? undefined,
      entityType: 'auth',
      entityId: undefined,
      action: 'LOGIN_SUCCESS',
      metadata: {
        email,
      },
      ipAddress: req.ip,
    });

    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Return shape expected by the frontend: { token, user: { id, email, name, role } }
    res.status(200).json({
      token: tokens.accessToken,
      user: {
        id: user!.id,
        email: user!.email,
        name: user!.fullName ?? undefined,
        role: user!.role,
      },
    });
  } catch (err: any) {
    if (err.message === 'Invalid credentials') {
      // Log failed login
      await writeAuditLog({
        actorType: AuditActorType.USER,
        actorId: undefined,
        entityType: 'auth',
        entityId: undefined,
        action: 'LOGIN_FAILED',
        metadata: {
          email: req.body.email, // Use the email from request body (might be invalid, but we log for audit)
          reason: 'Invalid credentials',
        },
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token using refresh token cookie
 * @access Public
 */
router.post('/refresh', async (req, res) => {
  try {
    const tokenCookie = req.cookies.refreshToken;
    if (!tokenCookie) {
      return res.status(401).json({ error: 'Refresh token not provided' });
    }

    const tokens = await refreshToken(tokenCookie);

    // Set new refresh token as HttpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      message: 'Token refreshed',
      accessToken: tokens.accessToken,
    });
  } catch (err: any) {
    if (err.message === 'Invalid refresh token') {
      return res.status(401).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user by clearing refresh token
 * @access Public
 */
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: 'No refresh token to logout' });
    }

    await logout(refreshToken);

    // Clear the refresh token cookie
    res.clearCookie('refreshToken');
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (err: any) {
    if (err.message === 'Invalid refresh token') {
      return res.status(401).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;