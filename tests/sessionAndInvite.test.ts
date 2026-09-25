import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveSession,
  getSavedSession,
  dismissSession,
  validateSavedSession,
  getOrCreatePlayerId,
  getShareUrl,
  setLanIp,
  type SavedSession,
} from '../src/game/network/sessionStorage';
import {
  isValidIpv4,
  isValidIpv6,
  isValidHostname,
  isValidPort,
  isValidLanAddress,
  isValidUrl,
  validatePacket,
} from '../src/game/network/validation';

// Mock in-memory storage for sessionStorage and localStorage
class MemoryStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

describe('Session Persistence & Invite URL', () => {
  let memStorage: MemoryStorage;

  beforeEach(() => {
    memStorage = new MemoryStorage();
    (globalThis as any).sessionStorage = memStorage;
    (globalThis as any).localStorage = memStorage;
    (globalThis as any).window = {
      location: {
        origin: 'http://localhost:5173',
        pathname: '/app/',
        hostname: 'localhost',
        port: '5173',
        protocol: 'http:',
      },
    };
  });

  const createValidSession = (): SavedSession => ({
    roomCode: 'ABC123',
    playerId: 'test-player-uuid',
    playerName: 'Player 1',
    colorId: 0,
    isHost: true,
    slotIndex: 0,
    speed: 'fast',
    winRule: 'exact',
    maxPlayers: 4,
    roster: [
      { id: 'p0', slotIndex: 0, name: 'Player 1', colorId: 0, isCpu: false, isHost: true },
    ],
    updatedAt: Date.now(),
  });

  it('validates a correct saved session', () => {
    const session = createValidSession();
    const result = validateSavedSession(session);
    expect(result).not.toBeNull();
    expect(result?.roomCode).toBe('ABC123');
  });

  it('rejects invalid or corrupted sessions', () => {
    expect(validateSavedSession(null)).toBeNull();
    expect(validateSavedSession({})).toBeNull();

    // Invalid roomCode
    const invalidRoom = { ...createValidSession(), roomCode: 'abc-invalid' };
    expect(validateSavedSession(invalidRoom)).toBeNull();

    // Negative slot index
    const invalidSlot = { ...createValidSession(), slotIndex: -1 };
    expect(validateSavedSession(invalidSlot)).toBeNull();

    // Invalid colorId
    const invalidColor = { ...createValidSession(), colorId: 99 };
    expect(validateSavedSession(invalidColor)).toBeNull();

    // Non-numeric or zero updatedAt
    const invalidTime = { ...createValidSession(), updatedAt: 0 };
    expect(validateSavedSession(invalidTime)).toBeNull();
  });

  it('saves and loads active session correctly with getSavedSession', () => {
    const session = createValidSession();
    saveSession(session);

    const loaded = getSavedSession();
    expect(loaded).not.toBeNull();
    expect(loaded?.roomCode).toBe('ABC123');
    expect(loaded?.playerName).toBe('Player 1');
  });

  it('non-destructively dismisses active session without reload', () => {
    const session = createValidSession();
    saveSession(session);

    // Calling dismiss marks/clears session so getSavedSession returns null
    dismissSession();
    expect(getSavedSession()).toBeNull();
  });

  it('preserves preferred player ID with getOrCreatePlayerId', () => {
    const customId = 'my-existing-id-123';
    const id1 = getOrCreatePlayerId(customId);
    expect(id1).toBe(customId);

    // Successive calls reuse the stored ID
    const id2 = getOrCreatePlayerId();
    expect(id2).toBe(customId);
  });

  it('generates share URL with room hash', () => {
    const url = getShareUrl('XYZ999');
    expect(url).toContain('#room=XYZ999');
    expect(url).toContain('http://localhost:5173/app/');
  });

  it('replaces localhost in share URL when manual LAN IP is set', () => {
    setLanIp('192.168.1.55');
    const url = getShareUrl('XYZ999');
    expect(url).toContain('http://192.168.1.55:5173/app/#room=XYZ999');
  });
});

describe('Network & Address Validation', () => {
  it('validates IPv4 addresses', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('10.0.0.254')).toBe(true);
    expect(isValidIpv4('127.0.0.1')).toBe(true);
    expect(isValidIpv4('256.0.0.1')).toBe(false);
    expect(isValidIpv4('192.168.1')).toBe(false);
    expect(isValidIpv4('not-an-ip')).toBe(false);
  });

  it('validates IPv6 addresses', () => {
    expect(isValidIpv6('::1')).toBe(true);
    expect(isValidIpv6('2001:db8::1')).toBe(true);
    expect(isValidIpv6('127.0.0.1')).toBe(false);
    expect(isValidIpv6('invalid::ipv6:::bad')).toBe(false);
  });

  it('validates hostnames', () => {
    expect(isValidHostname('localhost')).toBe(true);
    expect(isValidHostname('my-pc.local')).toBe(true);
    expect(isValidHostname('game.tournament.lan')).toBe(true);
    expect(isValidHostname('-bad-hostname')).toBe(false);
    expect(isValidHostname('bad..hostname')).toBe(false);
  });

  it('validates ports', () => {
    expect(isValidPort(80)).toBe(true);
    expect(isValidPort(5173)).toBe(true);
    expect(isValidPort(65535)).toBe(true);
    expect(isValidPort(0)).toBe(false);
    expect(isValidPort(70000)).toBe(false);
    expect(isValidPort(-1)).toBe(false);
  });

  it('validates LAN addresses and URLs', () => {
    expect(isValidLanAddress('192.168.1.100')).toBe(true);
    expect(isValidLanAddress('my-laptop.local')).toBe(true);
    expect(isValidLanAddress('bad$name')).toBe(false);

    expect(isValidUrl('http://192.168.1.100:5173')).toBe(true);
    expect(isValidUrl('https://example.com/play')).toBe(true);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('validates packet structures with validatePacket', () => {
    expect(
      validatePacket({
        type: 'JOIN_REQUEST',
        requestId: 'req-123',
        roomCode: 'ABC123',
        name: 'Player 1',
        colorId: 0,
      }).valid
    ).toBe(true);

    expect(
      validatePacket({
        type: 'ROLL_REQUEST',
        requestId: 'req-456',
        turnId: 1,
        slotIndex: 1,
      }).valid
    ).toBe(true);

    expect(
      validatePacket({
        type: 'ROLL_REQUEST',
        requestId: 'req-456',
        turnId: 1,
        slotIndex: 'bad',
      }).valid
    ).toBe(false);

    expect(validatePacket(null).valid).toBe(false);
    expect(validatePacket('not-json').valid).toBe(false);
  });
});
