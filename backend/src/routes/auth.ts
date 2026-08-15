import { Router } from 'express';
import { signupSchema, verifyEmailSchema } from '../utils/validation';
import { signup, verifyEmail } from '../services/authService';

const router = Router();

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

export default router;