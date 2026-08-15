// Mock wallet service – simulates Phantom wallet connect/disconnect
// TODO: Replace with @solana/wallet-adapter-react for real Phantom integration

import { delay } from '@/lib/utils'
import type { WalletState } from '@/types'

/** Deterministic fake public key shown in UI */
const MOCK_PUBKEY = 'Trc7xDm4QaR9fBsK3nYpLwV2eGhN6cJoUiA8tZm1Demo'

/** Simulated SOL balance for display */
const MOCK_BALANCE_SOL = 4.2069

/**
 * Simulate connecting a wallet.
 * TODO: Replace with window.solana.connect() + PublicKey from @solana/web3.js
 */
export async function connectWallet(): Promise<WalletState> {
    await delay(700)
    return {
        connected: true,
        publicKey: MOCK_PUBKEY,
        balance: MOCK_BALANCE_SOL,
    }
}

/**
 * Simulate disconnecting a wallet.
 * TODO: Replace with window.solana.disconnect()
 */
export async function disconnectWallet(): Promise<WalletState> {
    await delay(300)
    return {
        connected: false,
        publicKey: null,
        balance: 0,
    }
}

/**
 * Return the currently "connected" wallet state on page load.
 * TODO: Replace with useWallet() hook from @solana/wallet-adapter-react
 */
export async function getWalletState(): Promise<WalletState> {
    await delay(200)
    // Always starts disconnected in the demo
    return { connected: false, publicKey: null, balance: 0 }
}
