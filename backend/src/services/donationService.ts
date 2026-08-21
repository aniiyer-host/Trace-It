import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { requireEnvironmentVariable } from '../utils/envValidator';

/**
 * Create a Razorpay order for the given amount in INR.
 * @param amountInr - Amount in Indian Rupees (integer in paise? Actually Razorpay expects amount in paise, but we'll convert)
 * @returns Order object from Razorpay
 */
export const createRazorpayOrder = async (amountInr: number) => {
  // Razorpay expects amount in the smallest currency unit (paise for INR)
  const amountInPaise = amountInr * 100;

  const options = {
    amount: amountInPaise,
    currency: 'INR',
    receipt: `receipt_${crypto.randomBytes(10).toString('hex')}`,
    payment_capture: 1, // auto capture
  };

  // In a real implementation, we would make an HTTP request to Razorpay API
  // For now, we'll simulate the response
  // TODO: Replace with actual Razorpay SDK or HTTP call
  const mockOrder = {
    id: `order_${crypto.randomBytes(10).toString('hex')}`,
    entity: 'order',
    amount: amountInPaise,
    amount_paid: 0,
    amount_due: amountInPaise,
    currency: 'INR',
    receipt: options.receipt,
    offer_id: null,
    status: 'created',
    attempts: 0,
    notes: [],
    created_at: Math.floor(Date.now() / 1000),
  };

  return mockOrder;
};

/**
 * Verify Razorpay payment signature
 * @param orderId - Razorpay order ID
 * @param paymentId - Razorpay payment ID
 * @param signature - Razorpay signature
 * @returns True if signature is valid
 */
export const verifyRazorpaySignature = (orderId: string, paymentId: string, signature: string) => {
  const razorpayKeySecret = requireEnvironmentVariable('RAZORPAY_KEY_SECRET');
  const hmac = crypto.createHmac('sha256', razorpayKeySecret);
  hmac.update(`${orderId}|${paymentId}`);
  const generatedSignature = hmac.digest('hex');
  return generatedSignature === signature;
};
