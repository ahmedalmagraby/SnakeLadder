export interface SavedSession {
  roomCode: string;
  playerId: string;
  playerName: string;
  colorId: number;
  slotIndex: number;
  isHost: boolean;
  updatedAt: number;
}

const PLAYER_ID_KEY = 'snkladr_player_id';
const ACTIVE_SESSION_KEY = 'snkladr_active_session';
const LAN_IP_KEY = 'snkladr_lan_ip';
const DEFAULT_LAN_IP = '192.168.1.11';

/**
 * Get or create a persistent player ID across page reloads and restarts
 */
export function getOrCreatePlayerId(): string {
  if (typeof window === 'undefined') return 'guest_default';
  try {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return 'p_fallback_' + Math.random().toString(36).slice(2, 7);
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
 * Get saved active session if less than 60 minutes old
 */
export function getSavedSession(): SavedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const session: SavedSession = JSON.parse(raw);
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
 * Get current configured LAN IP address for local network invites
 */
export function getLanIp(): string {
  if (typeof window === 'undefined') return DEFAULT_LAN_IP;
  try {
    return localStorage.getItem(LAN_IP_KEY) || DEFAULT_LAN_IP;
  } catch {
    return DEFAULT_LAN_IP;
  }
}

/**
 * Set custom LAN IP address for local network invites
 */
export function setLanIp(ip: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAN_IP_KEY, ip.trim());
  } catch {
    // Ignore
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
 * If running on localhost, automatically resolves to the LAN IP address so phones can connect.
 */
export function getShareUrl(roomCode: string): string {
  if (typeof window === 'undefined') return '';
  const cleanCode = roomCode.trim().toUpperCase();

  if (isLocalhost()) {
    const lan = getLanIp();
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//${lan}${port}${window.location.pathname}#room=${cleanCode}`;
  }

  return `${window.location.origin}${window.location.pathname}#room=${cleanCode}`;
}
