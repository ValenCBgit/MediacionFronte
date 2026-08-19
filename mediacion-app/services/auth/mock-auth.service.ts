import type { Session } from '@supabase/supabase-js';

import { delay } from '../mock-utils';
import type { AuthService, SignInInput, SignUpInput } from './auth.service';

/**
 * Offline/demo implementation of `AuthService`, used when no backend is
 * configured (same role the mocks in `services/*.service.ts` play for every
 * other module). Any email + password signs in, so the demo shows the real
 * login/signup screens — TyC checkboxes, LegalFooter and botón de
 * arrepentimiento included — instead of skipping straight to the tabs.
 *
 * The session lives in `sessionStorage` on web (per-tab, gone when the tab
 * closes) and in memory elsewhere, so a page reload inside the demo does not
 * bounce the visitor back to the login screen.
 */
const STORAGE_KEY = 'mediacion.mockSession';

function storage(): Storage | null {
  // `sessionStorage` only exists in browsers — not in Node during the static
  // export, not on native. Everywhere else the in-memory copy is enough.
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  return sessionStorage;
}

function createMockSession(email: string): Session {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: nowSeconds + 60 * 60 * 24,
    user: {
      id: 'mock-user-id',
      aud: 'authenticated',
      email,
      app_metadata: { provider: 'mock' },
      user_metadata: {},
      created_at: new Date(nowSeconds * 1000).toISOString(),
    },
  } as Session;
}

function readStoredSession(): Session | null {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function createMockAuthService(): AuthService {
  let session: Session | null = readStoredSession();
  const listeners = new Set<(session: Session | null) => void>();

  function setSession(next: Session | null): void {
    session = next;
    try {
      if (next === null) {
        storage()?.removeItem(STORAGE_KEY);
      } else {
        storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // Storage being unavailable only costs reload persistence.
    }
    for (const listener of listeners) {
      listener(next);
    }
  }

  return {
    async getSession(): Promise<Session | null> {
      return delay(session, 150);
    },

    async getAccessToken(): Promise<string | null> {
      return session?.access_token ?? null;
    },

    async signIn({ email }: SignInInput): Promise<Session> {
      const next = await delay(createMockSession(email), 400);
      setSession(next);
      return next;
    },

    async signUp({ email }: SignUpInput): Promise<Session | null> {
      // The mock signup always yields a session (no email confirmation to
      // wait for), so the demo goes straight into the app like a confirmed
      // account would.
      const next = await delay(createMockSession(email), 400);
      setSession(next);
      return next;
    },

    async signOut(): Promise<void> {
      await delay(undefined, 150);
      setSession(null);
    },

    onSessionChange(listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const mockAuthService: AuthService = createMockAuthService();
