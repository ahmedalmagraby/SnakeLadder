import type { GameSpeed, WinRule } from '../constants';
import type { GameStateSnapshot, NetworkPlayer } from './types';
import {
  isSafeString,
  isValidRoomCode,
  isValidSlotIndex,
  isValidReconnectToken,
  isValidLanAddress,
} from './validation';

export type SavedGameState = GameStateSnapshot;

export interface SavedSession {
  roomCode: string;
  playerId: string;
  reconnectToken?: string;
  playerName: string;
  colorId: number;
  slotIndex: number;
  isHost: boolean;
  maxPlayers?: number;
  speed?: GameSpeed;
  winRule?: WinRule;
  players?: NetworkPlayer[];
  slotTokens?: [number, string][];
  gameState?: SavedGameState;
  turnId?: number;
  stateVersion?: number;
  updatedAt: number;
  isFinished?: boolean;
}

const PLAYER_ID_KEY = 'snkladr_player_id';
const ACTIVE_SESSION_KEY = 'snkladr_active_session';
const LAN_IP_KEY = 'snkladr_lan_ip';

/**
 * Validate raw stored session data against strict schema
 */
export function validateSavedSession(data: unknown): SavedSession | null {
  if (!data || typeof data !== 'object') return null;
  const s = data as Record<string, unknown>;

  if (!isValidRoomCode(s.roomCode)) return null;
  if (!isSafeString(s.playerId, 1, 64)) return null;
  if (!isSafeString(s.playerName, 1, 32)) return null;
  if (!isValidSlotIndex(s.slotIndex)) return null;
  if (typeof s.colorId !== 'number' || s.colorId < 0 || s.colorId > 3) return null;
  if (typeof s.isHost !== 'boolean') return null;
  if (typeof s.updatedAt !== 'number' || !Number.isFinite(s.updatedAt) || s.updatedAt <= 0) return null;

  if (s.reconnectToken !== undefined && !isValidReconnectToken(s.reconnectToken)) {
    return null;
  }

  if (s.maxPlayers !== undefined && (typeof s.maxPlayers !== 'number' || s.maxPlayers < 2 || s.maxPlayers > 4)) {
    return null;
  }

  return data as SavedSession;
}

/**
 * Get or create a persistent player ID across page reloads and restarts.
 * If preferredId is passed (e.g. from an existing session), adopts it.
 */
export function getOrCreatePlayerId(preferredId?: string): string {
  if (typeof window === 'undefined') return preferredId || 'guest_default';
  try {
    if (preferredId && isSafeString(preferredId, 1, 64)) {
      localStorage.setItem(PLAYER_ID_KEY, preferredId);
      return preferredId;
    }
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return preferredId || ('p_fallback_' + Math.random().toString(36).slice(2, 7));
  }
}

/**
 * Save active room session to localStorage for reload recovery
 */
export function saveSession(session: Omit<SavedSession, 'updatedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    const data: SavedSession = {
      ...session,
      updatedAt: Date.now(),
    };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(data));
  } catch {
    // LocalStorage quota or privacy mode error
  }
}

/**
 * Refresh session timestamp during active gameplay
 */
export function touchSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw);
    const valid = validateSavedSession(session);
    if (!valid) return;
    valid.updatedAt = Date.now();
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(valid));
  } catch {
    // Ignore
  }
}

/**
 * Mark the session as finished when match ends so resume is not offered
 */
export function markSessionFinished(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw);
    const valid = validateSavedSession(session);
    if (!valid) {
      clearSession();
      return;
    }
    valid.isFinished = true;
    valid.updatedAt = Date.now();
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(valid));
  } catch {
    // Ignore
  }
}

/**
 * Dismiss session without page reload
 */
export function dismissSession(): void {
  clearSession();
}

/**
 * Get saved active session if less than 60 minutes old, valid, and not finished
 */
export function getSavedSession(): SavedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      clearSession();
      return null;
    }

    const session = validateSavedSession(parsed);
    if (!session) {
      clearSession();
      return null;
    }

    if (session.isFinished) {
      clearSession();
      return null;
    }

    const ONE_HOUR = 60 * 60 * 1000;
    if (Date.now() - session.updatedAt > ONE_HOUR) {
      clearSession();
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Clear the saved session when leaving or match finishes
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Get current configured LAN IP address for local network invites (returns empty string if unset)
 */
export function getLanIp(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(LAN_IP_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Set custom LAN IP address for local network invites (validates before saving)
 */
export function setLanIp(ip: string): boolean {
  if (typeof window === 'undefined') return false;
  const trimmed = ip.trim();
  if (!trimmed) {
    try {
      localStorage.removeItem(LAN_IP_KEY);
      return true;
    } catch {
      return false;
    }
  }

  if (!isValidLanAddress(trimmed)) {
    return false;
  }

  try {
    localStorage.setItem(LAN_IP_KEY, trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if currently running on localhost / loopback
 */
export function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local');
}

/**
 * Generates an accessible share link for other devices (smartphones, tablets, PCs).
 * If running on localhost and a valid manual LAN IP is configured, uses that address.
 */
export function getShareUrl(roomCode: string): string {
  if (typeof window === 'undefined') return '';
  const cleanCode = roomCode.trim().toUpperCase();

  if (isLocalhost()) {
    const lan = getLanIp();
    if (lan) {
      // If port is already part of the entered lan address, do not duplicate port
      const hasPort = lan.includes(':') && !lan.includes('::');
      const port = (!hasPort && window.location.port) ? `:${window.location.port}` : '';
      return `${window.location.protocol}//${lan}${port}${window.location.pathname}#room=${cleanCode}`;
    }
  }

  return `${window.location.origin}${window.location.pathname}#room=${cleanCode}`;
}
