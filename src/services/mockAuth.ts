import { delay } from '@/lib/utils'

export interface User {
    id: string
    email: string
}

/**
 * Simulate email/password login or signup.
 * For this MVP, any non-empty email/password will instantly succeed.
 */
export async function loginWithEmail(email: string, password: string): Promise<User> {
    await delay(800)
    if (!email.trim() || !password.trim()) throw new Error('Email and password are required')

    return {
        id: `usr-${Math.random().toString(36).slice(2, 9)}`,
        email
    }
}

export async function logoutUser(): Promise<void> {
    await delay(300)
}
