// Mock payment service – simulates Razorpay (UPI) and Phantom (SOL) payments
// TODO: Replace UPI block with real Razorpay checkout SDK
// TODO: Replace SOL block with @solana/web3.js Transaction + sendAndConfirmTransaction

import { delay, mockTxHash, explorerUrl } from '@/lib/utils'
import type { UpiPaymentResult, SolPaymentResult } from '@/types'

/** Prefix for fake Razorpay order IDs */
const ORDER_PREFIX = 'order_TrIt'

/** Counter to keep IDs unique within a session */
let orderCounter = 1000

/**
 * Simulate a UPI payment via Razorpay.
 * @param amountUSD – amount in USD (converted to INR internally in real impl)
 * TODO: Replace with Razorpay.open({ key, amount, currency, order_id, handler })
 */
export async function initiateUpiPayment(
    amountUSD: number,
): Promise<UpiPaymentResult> {
    await delay(900)

    // Simulate ~5 % failure rate for realism (commented out for demo reliability)
    // if (Math.random() < 0.05) throw new Error('Payment gateway timeout')

    const orderId = `${ORDER_PREFIX}${++orderCounter}`
    const razorpayPaymentId = `pay_${mockTxHash('upi' + orderCounter).slice(0, 16)}`

    console.debug('[mockPayments] UPI payment', { amountUSD, orderId })

    return { orderId, razorpayPaymentId, status: 'success' }
}

/**
 * Simulate sending SOL via Phantom.
 * @param amountUSD – converted to lamports in real impl
 * @param recipientAddress – NGO vault address (mock)
 * TODO: Replace with:
 *   const tx = new Transaction().add(SystemProgram.transfer({...}))
 *   const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
 */
export async function initiateSolPayment(
    amountUSD: number,
    recipientAddress = 'NGOVau1tXdEmoDev3mo9VBDkTraceItRealSoonPls',
): Promise<SolPaymentResult> {
    await delay(1000)

    const txHash = mockTxHash(`sol${amountUSD}${recipientAddress}`)
    const url = explorerUrl(txHash)

    console.debug('[mockPayments] SOL payment', { amountUSD, txHash })

    return { txHash, explorerUrl: url, status: 'success' }
}
