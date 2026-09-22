import { delay } from '@/lib/utils'
import type { User } from '@/types'

// TODO: In production, replace with actual API calls
// For now, we'll use enhanced mocks that align with backend API structure

export interface SignupData {
  email: string
  password: string
  fullName?: string
  phone?: string
}

export interface LoginData {
  email: string
  password: string
}

export interface VerificationData {
  email: string
  otpCode: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken?: string
  user: User
}

export async function signupWithEmail(data: SignupData): Promise<User> {
  await delay(1000)

  if (!data.email.trim() || !data.password.trim()) {
    throw new Error('Email and password are required')
  }

  if (!data.fullName?.trim()) {
    throw new Error('Full name is required')
  }

  // Simulate backend API call
  // In real app: await fetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) })

  return {
    id: `usr-${Math.random().toString(36).slice(2, 9)}`,
    email: data.email,
    name: data.fullName
  }
}

export async function loginWithEmail(data: LoginData): Promise<AuthResponse> {
  await delay(800)

  if (!data.email.trim() || !data.password.trim()) {
    throw new Error('Email and password are required')
  }

  // Simulate backend API call
  // In real app: await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify(data) })

  const user = {
    id: `usr-${Math.random().toString(36).slice(2, 9)}`,
    email: data.email,
    name: data.email.split('@')[0] // Use part of email as name for demo
  }

  return {
    accessToken: `access token ${Math.random().toString(36).slice(2)}`,
    refreshToken: `refresh token ${Math.random().toString(36).slice(2)}`,
    user
  }
}

export async function verifyEmail(data: VerificationData): Promise<User> {
  await delay(600)

  if (!data.email.trim() || !data.otpCode.trim()) {
    throw new Error('Email and OTP code are required')
  }

  // Simulate backend API call
  // In real app: await fetch('/api/auth/verify-email', { method: 'POST', body: JSON.stringify(data) })

  return {
    id: `usr-${Math.random().toString(36).slice(2, 9)}`,
    email: data.email,
    name: data.email.split('@')[0]
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
  await delay(500)

  if (!refreshToken.trim()) {
    throw new Error('Refresh token is required')
  }

  // Simulate backend API call
  // In real app: await fetch('/api/auth/refresh', { method: 'POST', headers: { Authorization: `Bearer ${refreshToken}` } })

  return {
    accessToken: `new access token ${Math.random().toString(36).slice(2)}`
  }
}

export async function logoutUser(): Promise<void> {
  await delay(300)

  // Simulate backend API call
  // In real app: await fetch('/api/auth/logout', { method: 'POST' })
}