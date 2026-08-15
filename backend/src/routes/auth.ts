import { Router } from 'express';
import { signupSchema, verifyEmailSchema } from '../utils/validation';
import { signup, verifyEmail, login, refreshToken, logout } from '../services/authService';
import { authLimiter } from '../middleware/strictLimiter';

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
    const { email, password } = req.body;

    // Simple validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const tokens = await login(email, password);

    // Set refresh token as HttpOnly cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(200).json({
      message: 'Login successful',
      accessToken: tokens.accessToken,
    });
  } catch (err: any) {
    if (err.message === 'Invalid credentials') {
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
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token not provided' });
    }

    const tokens = await refreshToken(refreshToken);

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