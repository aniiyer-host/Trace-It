// Mock payment service – simulates Razorpay (UPI) payments
// TODO: Replace UPI block with real Razorpay checkout SDK

import { delay, mockTxHash } from '@/lib/utils'
import type { UpiPaymentResult } from '@/types'

/** Prefix for fake Razorpay order IDs */
const ORDER_PREFIX = 'order_TrIt'

/** Counter to keep IDs unique within a session */
let orderCounter = 1000

/**
 * Simulate a UPI payment via Razorpay.
 * @param amountINR – amount in INR
 * TODO: Replace with Razorpay.open({ key, amount, currency, order_id, handler })
 */
export async function initiateUpiPayment(
    amountINR: number,
): Promise<UpiPaymentResult> {
    await delay(900)

    // Simulate ~5 % failure rate for realism (commented out for demo reliability)
    // if (Math.random() < 0.05) throw new Error('Payment gateway timeout')

    const orderId = `${ORDER_PREFIX}${++orderCounter}`
    const razorpayPaymentId = `pay_${mockTxHash('upi' + orderCounter).slice(0, 16)}`

    console.debug('[mockPayments] UPI payment', { amountINR, orderId })

    return { orderId, razorpayPaymentId, status: 'success' }
}
