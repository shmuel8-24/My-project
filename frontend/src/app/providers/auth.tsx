'use client';

/**
 * Global auth context.
 *
 * The JWT lives exclusively in an HttpOnly cookie set by the Flask backend.
 * JavaScript never reads it. Session state is derived from lightweight profile
 * keys in localStorage (email, name, is_admin flag — not credentials).
 *
 * On logout the backend endpoint is called so Flask can clear the HttpOnly
 * cookie; localStorage profile keys are then wiped client-side.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API = 'http://localhost:5003';

/* ── Shared constants ─────────────────────────────────────────────────────── */

export const AUTH_KEYS = [
  'levy_ai_email',
  'levy_ai_first_name',
  'levy_ai_last_name',
  'levy_ai_institution',
  'levy_ai_primary_major',
  'levy_ai_degree_type',
  'levy_ai_country',
  'levy_ai_secondary_major',
  'levy_ai_gender',
  'levy_ai_is_admin',
] as const;

export type AuthKey = (typeof AUTH_KEYS)[number];

/* ── User shape ───────────────────────────────────────────────────────────── */

export interface AuthUser {
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
  user: AuthUser | null;
  isLoading: boolean;
  /**
   * Call after a successful /api/refresh-token (backend sets new HttpOnly
   * cookie) to re-sync the React context from localStorage profile keys.
   * The token parameter is accepted but ignored — it is never stored client-side.
   */
  updateToken: (token?: string) => void;
  logout: () => void;
}

/* ── Internal helpers ─────────────────────────────────────────────────────── */

function clearAuthStorage() {
  AUTH_KEYS.forEach(k => localStorage.removeItem(k));
  // Clear the presence + course cookies set from JS
  document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
  document.cookie = 'levy_ai_course_active=; path=/; SameSite=Lax; max-age=0';
  // NOTE: levy_ai_token is HttpOnly — only the server can clear it via /api/logout
}

function readUserFromStorage(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  // Presence is determined by levy_ai_email — only written after a successful auth handshake.
  const email = localStorage.getItem('levy_ai_email');
  if (!email) return null;

  return {
    email,
    firstName:      localStorage.getItem('levy_ai_first_name')      ?? '',
    lastName:       localStorage.getItem('levy_ai_last_name')       ?? '',
    isAdmin:        localStorage.getItem('levy_ai_is_admin')        === 'true',
    gender:         localStorage.getItem('levy_ai_gender')          ?? '',
    institution:    localStorage.getItem('levy_ai_institution')     ?? '',
    primaryMajor:   localStorage.getItem('levy_ai_primary_major')   ?? '',
    degreeType:     localStorage.getItem('levy_ai_degree_type')     ?? '',
    country:        localStorage.getItem('levy_ai_country')         ?? '',
    secondaryMajor: localStorage.getItem('levy_ai_secondary_major') ?? '',
  };
}

/* ── Provider ─────────────────────────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUser(readUserFromStorage());
    setIsLoading(false);
  }, []);

  // Re-sync context from localStorage (called after server sets a new cookie).
  const updateToken = useCallback((_token?: string) => {
    setUser(readUserFromStorage());
  }, []);

  const logout = useCallback(async () => {
    // Ask the server to clear the HttpOnly cookie first.
    try {
      await fetch(`${API}/api/logout`, { method: 'POST', credentials: 'include' });
    } catch { /* proceed with local cleanup even if the request fails */ }
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
