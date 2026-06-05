'use client';

/**
 * Global auth context.
 *
 * Lives in the root layout so it mounts once and survives every client-side
 * route transition.  Individual pages read `useAuth()` instead of touching
 * localStorage directly — this is the single source of truth for the current
 * user session.
 *
 * Responsibilities
 *   • Read + validate the JWT from localStorage on first client render
 *   • Expose `user`, `isLoading`, `logout`, and `updateToken`
 *   • On expiry detection: clear all auth keys immediately so no other page
 *     can falsely pass its own auth check on a stale token
 *
 * NOT responsible for
 *   • Redirecting (pages own their own redirect logic)
 *   • Token refresh (admin page does that; it calls `updateToken` afterward)
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

/* ── Shared constants ─────────────────────────────────────────────────────── */

export const AUTH_KEYS = [
  'levy_ai_token',
  'levy_ai_email',
  'levy_ai_first_name',
  'levy_ai_last_name',
  'levy_ai_institution',
  'levy_ai_primary_major',
  'levy_ai_degree_type',
  'levy_ai_country',
  'levy_ai_secondary_major',
  'levy_ai_gender',
] as const;

export type AuthKey = (typeof AUTH_KEYS)[number];

/* ── JWT helper (re-exported so pages can stop duplicating it) ─────────────── */

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

/* ── User shape ───────────────────────────────────────────────────────────── */

export interface AuthUser {
  token: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  gender: string;
  institution: string;
  primaryMajor: string;
  degreeType: string;
  country: string;
  secondaryMajor: string;
}

/* ── Context value ────────────────────────────────────────────────────────── */

interface AuthContextValue {
  /** Populated after the first client-side render; null when not logged in. */
  user: AuthUser | null;
  /** True for the brief window between mount and the first localStorage read. */
  isLoading: boolean;
  /**
   * Call this after a successful /api/refresh-token to keep the context in
   * sync with the new JWT written to localStorage.
   */
  updateToken: (token: string) => void;
  /** Full session wipe + hard redirect to /. */
  logout: () => void;
}

/* ── Internal helpers ─────────────────────────────────────────────────────── */

function clearAuthStorage() {
  AUTH_KEYS.forEach(k => localStorage.removeItem(k));
  document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
  document.cookie = 'levy_ai_token=; path=/; SameSite=Lax; max-age=0';
}

function readUserFromStorage(): AuthUser | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('levy_ai_token');
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) { clearAuthStorage(); return null; }

  if (payload.exp && (payload.exp as number) * 1000 < Date.now()) {
    clearAuthStorage();
    return null;
  }

  return {
    token,
    email:          localStorage.getItem('levy_ai_email')          ?? '',
    firstName:      localStorage.getItem('levy_ai_first_name')     ?? '',
    lastName:       localStorage.getItem('levy_ai_last_name')      ?? '',
    isAdmin:        payload.is_admin === true || payload.role === 'admin',
    gender:         localStorage.getItem('levy_ai_gender')         ?? '',
    institution:    localStorage.getItem('levy_ai_institution')    ?? '',
    primaryMajor:   localStorage.getItem('levy_ai_primary_major')  ?? '',
    degreeType:     localStorage.getItem('levy_ai_degree_type')    ?? '',
    country:        localStorage.getItem('levy_ai_country')        ?? '',
    secondaryMajor: localStorage.getItem('levy_ai_secondary_major') ?? '',
  };
}

/* ── Provider ─────────────────────────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Both start "empty" so server render and first client paint match — no
  // hydration mismatch.  The useEffect below fills them in after mount.
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUser(readUserFromStorage());
    setIsLoading(false);
  }, []);

  const updateToken = useCallback((token: string) => {
    localStorage.setItem('levy_ai_token', token);
    setUser(readUserFromStorage());
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    setUser(null);
    window.location.href = '/';
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, updateToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
