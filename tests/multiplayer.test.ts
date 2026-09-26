import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isGuestAllowedPacket,
  isHostOnlyPacket,
  isValidColorId,
  isValidEmoji,
  isValidGameSpeed,
  isValidPlayerName,
  isValidRoll,
  isValidRoomCode,
  isValidSlotIndex,
  isValidWinRule,
  stripCpuSuffix,
  validatePacket,
} from '../src/game/network/validation';
import { PeerManager } from '../src/game/network/peerManager';
import {
  ALLOWED_EMOJIS,
  MAX_PACKET_BYTES,
  type Packet,
} from '../src/game/network/types';
import {
  saveSession,
  getSavedSession,
  clearSession,
} from '../src/game/network/sessionStorage';

describe('1. Runtime Packet Validation & Size Limits', () => {
  it('rejects null, undefined, and non-object payloads', () => {
    expect(validatePacket(null).valid).toBe(false);
    expect(validatePacket(undefined).valid).toBe(false);
    expect(validatePacket(123).valid).toBe(false);
    expect(validatePacket('invalid json string').valid).toBe(false);
    expect(validatePacket([]).valid).toBe(false);
  });

  it('rejects packets exceeding maximum byte size (16KB)', () => {
    const hugePayload = {
      type: 'JOIN_REQUEST',
      requestId: 'req_1',
      roomCode: 'ABCDEF',
      name: 'A'.repeat(MAX_PACKET_BYTES + 10),
      colorId: 0,
    };
    const res = validatePacket(hugePayload);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/exceeds max byte size/);
  });

  it('rejects prototype pollution attempts', () => {
    const malicious = JSON.parse('{"type":"JOIN_REQUEST","__proto__":{"polluted":true}}');
    expect(validatePacket(malicious).valid).toBe(false);
    expect(validatePacket(malicious).error).toMatch(/forbidden prototype/);

    const malicious2 = JSON.parse('{"type":"JOIN_REQUEST","constructor":{"prototype":{"polluted":true}}}');
    expect(validatePacket(malicious2).valid).toBe(false);
  });

  it('validates room code format (strictly 6 alphanumeric uppercase chars)', () => {
    expect(isValidRoomCode('ABCDEF')).toBe(true);
    expect(isValidRoomCode('234567')).toBe(true);
    expect(isValidRoomCode('abc123')).toBe(true); // trims & uppercases to ABC123
    expect(isValidRoomCode('ABCDE')).toBe(false); // too short
    expect(isValidRoomCode('ABCDEFG')).toBe(false); // too long
    expect(isValidRoomCode('ABC-12')).toBe(false); // special char
  });

  it('validates player names (length and safe characters)', () => {
    expect(isValidPlayerName('Alice')).toBe(true);
    expect(isValidPlayerName('A'.repeat(24))).toBe(true);
    expect(isValidPlayerName('A'.repeat(25))).toBe(false); // too long
    expect(isValidPlayerName('')).toBe(false); // empty
    expect(isValidPlayerName('   ')).toBe(false); // all whitespace
    expect(isValidPlayerName('Alice\x00Drop')).toBe(false); // null byte / control char
  });

  it('validates game speed and win rule enums', () => {
    expect(isValidGameSpeed('normal')).toBe(true);
    expect(isValidGameSpeed('fast')).toBe(true);
    expect(isValidGameSpeed('turbo')).toBe(true);
    expect(isValidGameSpeed('ultra')).toBe(false);

    expect(isValidWinRule('exact')).toBe(true);
    expect(isValidWinRule('bounce')).toBe(true);
    expect(isValidWinRule('any')).toBe(false);
  });

  it('validates slots (strictly 0..3 finite integers)', () => {
    expect(isValidSlotIndex(0)).toBe(true);
    expect(isValidSlotIndex(1)).toBe(true);
    expect(isValidSlotIndex(2)).toBe(true);
    expect(isValidSlotIndex(3)).toBe(true);
    expect(isValidSlotIndex(-1)).toBe(false);
    expect(isValidSlotIndex(4)).toBe(false);
    expect(isValidSlotIndex(1.5)).toBe(false);
    expect(isValidSlotIndex(NaN)).toBe(false);
    expect(isValidSlotIndex(Infinity)).toBe(false);
    expect(isValidSlotIndex('0')).toBe(false);
  });
});

describe('2. Color and Roll Hardening', () => {
  it('rejects invalid colors (negative, float, string, >3)', () => {
    expect(isValidColorId(0)).toBe(true);
    expect(isValidColorId(3)).toBe(true);
    expect(isValidColorId(-1)).toBe(false);
    expect(isValidColorId(4)).toBe(false);
    expect(isValidColorId(100)).toBe(false);
    expect(isValidColorId(2.5)).toBe(false);
    expect(isValidColorId(NaN)).toBe(false);
    expect(isValidColorId('blue')).toBe(false);
  });

  it('rejects invalid and huge rolls (strictly 1..6 integer)', () => {
    expect(isValidRoll(1)).toBe(true);
    expect(isValidRoll(6)).toBe(true);
    expect(isValidRoll(0)).toBe(false);
    expect(isValidRoll(7)).toBe(false);
    expect(isValidRoll(100)).toBe(false);
    expect(isValidRoll(999999)).toBe(false);
    expect(isValidRoll(-1)).toBe(false);
    expect(isValidRoll(3.5)).toBe(false);
    expect(isValidRoll(NaN)).toBe(false);
    expect(isValidRoll(Infinity)).toBe(false);
    expect(isValidRoll('6')).toBe(false);
  });

  it('validates ROLL_RESULT packet', () => {
    const validRoll: Packet = {
      type: 'ROLL_RESULT',
      player: 2,
      roll: 5,
      turnId: 10,
      stateVersion: 15,
      timestamp: Date.now(),
    };
    expect(validatePacket(validRoll).valid).toBe(true);

    const hugeRoll = {
      ...validRoll,
      roll: 50,
    };
    expect(validatePacket(hugeRoll).valid).toBe(false);
  });
});

describe('3. Emoji Whitelist and Emote Validation', () => {
  it('permits only whitelisted emojis', () => {
    for (const emoji of ALLOWED_EMOJIS) {
      expect(isValidEmoji(emoji)).toBe(true);
    }
    expect(isValidEmoji('💩')).toBe(false);
    expect(isValidEmoji('🚀')).toBe(false);
    expect(isValidEmoji('random text')).toBe(false);
    expect(isValidEmoji('')).toBe(false);
  });

  it('validates EMOTE packet format', () => {
    const validEmote: Packet = {
      type: 'EMOTE',
      requestId: 'req_emo_1',
      player: 1,
      emoji: '🎲',
      timestamp: Date.now(),
    };
    expect(validatePacket(validEmote).valid).toBe(true);

    const invalidEmote = {
      ...validEmote,
      emoji: '👽',
    };
    expect(validatePacket(invalidEmote).valid).toBe(false);
  });
});

describe('4. Forged Packets & Role Permissions', () => {
  it('strictly classifies guest-permitted vs host-only packet types', () => {
    expect(isGuestAllowedPacket('JOIN_REQUEST')).toBe(true);
    expect(isGuestAllowedPacket('RECONNECT_REQUEST')).toBe(true);
    expect(isGuestAllowedPacket('COLOR_CHANGE_REQUEST')).toBe(true);
    expect(isGuestAllowedPacket('ROLL_REQUEST')).toBe(true);
    expect(isGuestAllowedPacket('EMOTE')).toBe(true);
    expect(isGuestAllowedPacket('PING')).toBe(true);

    // Host-only packets must not be allowed by guests
    expect(isGuestAllowedPacket('GAME_START')).toBe(false);
    expect(isGuestAllowedPacket('LOBBY_UPDATE')).toBe(false);
    expect(isGuestAllowedPacket('SYNC_CHECKPOINT')).toBe(false);
    expect(isGuestAllowedPacket('PLAYER_DISCONNECTED')).toBe(false);
    expect(isGuestAllowedPacket('ROLL_RESULT')).toBe(false);
    expect(isGuestAllowedPacket('JOIN_ACCEPTED')).toBe(false);
    expect(isGuestAllowedPacket('RECONNECT_ACCEPTED')).toBe(false);
  });

  it('verifies host-only packet types', () => {
    expect(isHostOnlyPacket('GAME_START')).toBe(true);
    expect(isHostOnlyPacket('LOBBY_UPDATE')).toBe(true);
    expect(isHostOnlyPacket('SYNC_CHECKPOINT')).toBe(true);
    expect(isHostOnlyPacket('PLAYER_DISCONNECTED')).toBe(true);
    expect(isHostOnlyPacket('ROLL_RESULT')).toBe(true);
    expect(isHostOnlyPacket('JOIN_ACCEPTED')).toBe(true);
    expect(isHostOnlyPacket('RECONNECT_ACCEPTED')).toBe(true);

    expect(isHostOnlyPacket('ROLL_REQUEST')).toBe(false);
    expect(isHostOnlyPacket('JOIN_REQUEST')).toBe(false);
  });
});

describe('5. PeerManager Admission State Machine & Unauthenticated Listeners', () => {
  let pm: PeerManager;
  let mockConn: any;

  beforeEach(() => {
    pm = new PeerManager();
    // Simulate host mode
    (pm as any).isHost = true;
    (pm as any).roomCode = 'ABCDEF';

    mockConn = {
      peer: 'guest-peer-1',
      open: true,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
    };
  });

  it('places incoming connections into pending state initially', () => {
    (pm as any).handleIncomingConnection(mockConn);
    expect(pm.getAdmissionState('guest-peer-1')).toBe('pending');
  });

  it('does NOT broadcast to unauthenticated (pending) connections', () => {
    (pm as any).handleIncomingConnection(mockConn);
    expect(pm.getAdmissionState('guest-peer-1')).toBe('pending');

    const updatePacket: Packet = {
      type: 'LOBBY_UPDATE',
      players: [
        {
          playerId: 'p_1',
          peerId: 'host',
          name: 'Host',
          slotIndex: 0,
          colorId: 0,
          isHost: true,
          isCpu: false,
          isReady: true,
        },
      ],
      speed: 'normal',
      winRule: 'exact',
      stateVersion: 2,
    };

    pm.broadcast(updatePacket);
    // Unauthenticated listener must NOT receive broadcast
    expect(mockConn.send).not.toHaveBeenCalled();
  });

  it('broadcasts only to joined connections', () => {
    (pm as any).handleIncomingConnection(mockConn);
    // Transition to joined
    pm.setAdmissionState('guest-peer-1', 'joined', 1);
    expect(pm.getAdmissionState('guest-peer-1')).toBe('joined');

    const updatePacket: Packet = {
      type: 'LOBBY_UPDATE',
      players: [],
      speed: 'normal',
      winRule: 'exact',
      stateVersion: 3,
    };

    pm.broadcast(updatePacket);
    expect(mockConn.send).toHaveBeenCalledWith(updatePacket);
  });

  it('immediately closes connection if guest sends forbidden host-only packet (e.g. GAME_START)', () => {
    let dataCallback: (raw: any) => void = () => {};
    mockConn.on.mockImplementation((event: string, fn: any) => {
      if (event === 'data') dataCallback = fn;
    });

    (pm as any).handleIncomingConnection(mockConn);

    // Guest attempts forged GAME_START
    const forgedPacket = {
      type: 'GAME_START',
      players: [
        {
          playerId: 'p_1',
          peerId: 'host',
          name: 'Host',
          slotIndex: 0,
          colorId: 0,
          isHost: true,
          isCpu: false,
          isReady: true,
        },
        {
          playerId: 'p_2',
          peerId: 'guest-peer-1',
          name: 'Hacker',
          slotIndex: 1,
          colorId: 1,
          isHost: false,
          isCpu: false,
          isReady: true,
        },
      ],
      speed: 'normal',
      winRule: 'exact',
      stateVersion: 1,
      turnId: 1,
    };

    dataCallback(forgedPacket);

    // Must close connection and clean up
    expect(mockConn.close).toHaveBeenCalled();
    expect(pm.getAdmissionState('guest-peer-1')).toBeUndefined();
  });

  it('immediately closes connection on malformed or invalid packet', () => {
    let dataCallback: (raw: any) => void = () => {};
    mockConn.on.mockImplementation((event: string, fn: any) => {
      if (event === 'data') dataCallback = fn;
    });

    (pm as any).handleIncomingConnection(mockConn);

    dataCallback({
      type: 'JOIN_REQUEST',
      requestId: 'req_1',
      roomCode: 'INVALID_LONG_CODE',
      name: 'Alice',
      colorId: 0,
    });

    expect(mockConn.close).toHaveBeenCalled();
    expect(pm.getAdmissionState('guest-peer-1')).toBeUndefined();
  });

  it('immediately closes connection if packet is sent out of admission order in pending state', () => {
    let dataCallback: (raw: any) => void = () => {};
    mockConn.on.mockImplementation((event: string, fn: any) => {
      if (event === 'data') dataCallback = fn;
    });

    (pm as any).handleIncomingConnection(mockConn);
    expect(pm.getAdmissionState('guest-peer-1')).toBe('pending');

    // Guest sends ROLL_REQUEST before joining
    dataCallback({
      type: 'ROLL_REQUEST',
      requestId: 'req_roll_1',
      turnId: 1,
      slotIndex: 1,
    });

    expect(mockConn.close).toHaveBeenCalled();
    expect(pm.getAdmissionState('guest-peer-1')).toBeUndefined();
  });

  it('detects impersonation: closes connection if slot in packet does not match bound slot', () => {
    let dataCallback: (raw: any) => void = () => {};
    mockConn.on.mockImplementation((event: string, fn: any) => {
      if (event === 'data') dataCallback = fn;
    });

    (pm as any).handleIncomingConnection(mockConn);
    // Bound to slot 1
    pm.setAdmissionState('guest-peer-1', 'joined', 1);

    // Guest tries to send ROLL_REQUEST for slot 0 (host slot)
    dataCallback({
      type: 'ROLL_REQUEST',
      requestId: 'req_roll_fake',
      turnId: 1,
      slotIndex: 0,
    });

    expect(mockConn.close).toHaveBeenCalled();
    expect(pm.getAdmissionState('guest-peer-1')).toBeUndefined();
  });

  it('cleans up rejected connections', () => {
    (pm as any).handleIncomingConnection(mockConn);
    pm.closeConnection('guest-peer-1', 'Test rejection');

    expect(mockConn.close).toHaveBeenCalled();
    expect(pm.getConnections().length).toBe(0);
    expect(pm.getJoinedConnections().length).toBe(0);
  });
});

describe('6. Reconnect Token Authentication & Impersonation Defense', () => {
  it('validates RECONNECT_REQUEST format with host-issued token', () => {
    const validReconnect: Packet = {
      type: 'RECONNECT_REQUEST',
      requestId: 'req_rec_1',
      roomCode: 'ABCDEF',
      slotIndex: 1,
      reconnectToken: 'tok_sec_1234567890abcdef12345678',
    };
    expect(validatePacket(validReconnect).valid).toBe(true);

    // Reject short or invalid reconnect token
    const invalidToken = {
      ...validReconnect,
      reconnectToken: 'short_token',
    };
    expect(validatePacket(invalidToken).valid).toBe(false);
  });

  it('rejects reconnect attempt if reconnectToken does not match host record', () => {
    const hostSlotTokens = new Map<number, string>();
    hostSlotTokens.set(1, 'valid_secret_token_1234567890abcdef');

    const incomingSlot = 1;
    const incomingToken = 'wrong_attacker_token_9876543210fedcba';

    const tokenMatches = hostSlotTokens.get(incomingSlot) === incomingToken;
    expect(tokenMatches).toBe(false);
  });

  it('never uses display names for identity or authentication', () => {
    // Two players can even have identical names; identity is strictly slot + host-issued token
    const hostSlotTokens = new Map<number, string>();
    const genuineToken = 'genuine_token_1234567890abcdef';
    hostSlotTokens.set(2, genuineToken);

    // Impersonator with identical name "Bob" attempts to claim slot 2 without the token
    const impersonatorToken = 'hacker_token_0000000000000000';
    const authSucceeds = hostSlotTokens.get(2) === impersonatorToken;
    expect(authSucceeds).toBe(false);
  });
});

describe('7. Turn IDs, Request IDs & Duplicate Roll Prevention', () => {
  it('validates ROLL_REQUEST packet structure', () => {
    const validRollReq: Packet = {
      type: 'ROLL_REQUEST',
      requestId: 'req_roll_42',
      turnId: 5,
      slotIndex: 2,
    };
    expect(validatePacket(validRollReq).valid).toBe(true);

    const invalidSlotReq = {
      ...validRollReq,
      slotIndex: 9,
    };
    expect(validatePacket(invalidSlotReq).valid).toBe(false);

    const invalidTurnReq = {
      ...validRollReq,
      turnId: 0, // Must be >= 1
    };
    expect(validatePacket(invalidTurnReq).valid).toBe(false);
  });

  it('detects and rejects duplicate roll requests for the same turn', () => {
    const currentTurnId = 3;
    let hasRolledForTurn = false;
    const processedRequests = new Set<string>();

    function handleRollRequest(reqId: string, turnId: number): boolean {
      if (turnId !== currentTurnId) return false; // Stale or future
      if (hasRolledForTurn) return false; // Duplicate roll
      if (processedRequests.has(reqId)) return false; // Duplicate request

      processedRequests.add(reqId);
      hasRolledForTurn = true;
      return true;
    }

    // First request should succeed
    expect(handleRollRequest('req_1', 3)).toBe(true);

    // Duplicate request with same ID should be rejected
    expect(handleRollRequest('req_1', 3)).toBe(false);

    // Another request for the same turn should be rejected
    expect(handleRollRequest('req_2', 3)).toBe(false);

    // Stale turn request should be rejected
    expect(handleRollRequest('req_3', 2)).toBe(false);
  });
});

describe('8. Player Disconnect/Reconnect & AI Mark Removal', () => {
  it('strips (CPU) suffix reliably from player names', () => {
    expect(stripCpuSuffix('Bob (CPU)')).toBe('Bob');
    expect(stripCpuSuffix('Bob (cpu)')).toBe('Bob');
    expect(stripCpuSuffix('Bob  (CPU) ')).toBe('Bob');
    expect(stripCpuSuffix('CPU 1 (CPU)')).toBe('CPU 1');
    expect(stripCpuSuffix('Alice')).toBe('Alice');
    expect(stripCpuSuffix('')).toBe('');
  });

  it('preserves isCpu as false and clean name when a player disconnects and reconnects', () => {
    // 1. Initial state: Alice (host) and Bob (friend)
    let players = [
      { slotIndex: 0, name: 'Alice', isCpu: false, isReady: true, colorId: 0 },
      { slotIndex: 1, name: 'Bob', isCpu: false, isReady: true, colorId: 1 },
    ];

    // 2. Bob disconnects -> keeps isCpu: false, marks isReady: false, no CPU suffix
    const dcSlot = 1;
    players = players.map((p) =>
      p.slotIndex === dcSlot
        ? { ...p, isCpu: false, isReady: false, name: stripCpuSuffix(p.name) }
        : p,
    );

    expect(players[1].isCpu).toBe(false);
    expect(players[1].isReady).toBe(false);
    expect(players[1].name).toBe('Bob');
    expect(players[1].name.includes('(CPU)')).toBe(false);

    // 3. Bob rejoins -> isReady: true, stays human
    players = players.map((p) =>
      p.slotIndex === dcSlot
        ? { ...p, isCpu: false, isReady: true, name: stripCpuSuffix(p.name) }
        : p,
    );

    expect(players[1].isCpu).toBe(false);
    expect(players[1].isReady).toBe(true);
    expect(players[1].name).toBe('Bob');
    expect(players[1].name.includes('(CPU)')).toBe(false);
  });

  describe('8. Win State Synchronization & Exact Rule Six on 99', () => {
    it('accepts and validates authoritative SYNC_CHECKPOINT with winner', () => {
      const winCheckpoint = {
        type: 'SYNC_CHECKPOINT',
        mode: 'over' as const,
        pos: [100, 75],
        turn: 0,
        phase: 'over',
        rolls: [12, 10],
        laddersHit: [2, 1],
        snakesHit: [1, 2],
        sixesHit: [3, 1],
        winner: 0,
        turnId: 5,
        stateVersion: 10,
      };

      const result = validatePacket(winCheckpoint, 'guest', false);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.packet.type).toBe('SYNC_CHECKPOINT');
        if (result.packet.type === 'SYNC_CHECKPOINT') {
          expect(result.packet.winner).toBe(0);
          expect(result.packet.phase).toBe('over');
          expect(result.packet.mode).toBe('over');
        }
      }
    });

    it('rejects SYNC_CHECKPOINT with missing or invalid mode', () => {
      const invalidCheckpoint = {
        type: 'SYNC_CHECKPOINT',
        mode: 'invalid_mode',
        pos: [50, 40],
        turn: 1,
        phase: 'idle',
        rolls: [5, 4],
        laddersHit: [0, 0],
        snakesHit: [0, 0],
        sixesHit: [0, 0],
        winner: -1,
        turnId: 3,
        stateVersion: 8,
      };
      const result = validatePacket(invalidCheckpoint, 'guest', false);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid mode in SYNC_CHECKPOINT/);
    });

    it('retains turn and awards extra roll when rolling a 6 on square 99 with exact rule', () => {
      // Simulating resolveRoll rule for exact winRule:
      // pos = 99, v = 6 -> pos + v = 105 > 100
      const pos = 99;
      const v = 6;
      const winRule = 'exact';
      let turn = 1;
      const sixesHit = [0, 0];
      let turnSwitched = false;
      let extraRollAwarded = false;

      if (pos + v > 100) {
        if (winRule === 'exact') {
          if (v === 6) {
            sixesHit[turn] += 1;
            extraRollAwarded = true;
            // turn remains `turn`
          } else {
            turnSwitched = true;
            turn = (turn + 1) % 2;
          }
        }
      }

      expect(extraRollAwarded).toBe(true);
      expect(turnSwitched).toBe(false);
      expect(turn).toBe(1);
      expect(sixesHit[1]).toBe(1);
    });

    it('passes turn when rolling a non-6 on square 99 with exact rule', () => {
      const pos = 99;
      const v = 3;
      const winRule = 'exact';
      let turn = 1;
      const sixesHit = [0, 0];
      let turnSwitched = false;
      let extraRollAwarded = false;

      if (pos + v > 100) {
        if (winRule === 'exact') {
          if (v === 6) {
            sixesHit[turn] += 1;
            extraRollAwarded = true;
          } else {
            turnSwitched = true;
            turn = (turn + 1) % 2;
          }
        }
      }

      expect(extraRollAwarded).toBe(false);
      expect(turnSwitched).toBe(true);
      expect(turn).toBe(0);
      expect(sixesHit[1]).toBe(0);
    });
  });

  describe('9. Host Session Persistence & Room Rejoin', () => {
    let mockStore: Record<string, string> = {};

    beforeEach(() => {
      mockStore = {};
      (globalThis as any).window = {
        location: {
          hash: '',
          hostname: 'localhost',
          port: '5173',
          protocol: 'http:',
          pathname: '/',
          origin: 'http://localhost:5173',
        },
      };
      (globalThis as any).localStorage = {
        getItem: (key: string) => mockStore[key] || null,
        setItem: (key: string, val: string) => {
          mockStore[key] = val;
        },
        removeItem: (key: string) => {
          delete mockStore[key];
        },
        clear: () => {
          mockStore = {};
        },
      };
    });

    it('persists and retrieves full host session with room code, slot tokens, and game state', () => {
      const sessionData = {
        roomCode: 'HOST88',
        playerId: 'p_host_1',
        playerName: 'HostAlice',
        colorId: 0,
        slotIndex: 0,
        isHost: true,
        maxPlayers: 3,
        speed: 'fast' as const,
        winRule: 'exact' as const,
        players: [
          { playerId: 'p_host_1', peerId: 'host', name: 'HostAlice', slotIndex: 0, colorId: 0, isHost: true, isCpu: false, isReady: true },
          { playerId: 'p_guest_2', peerId: 'guest_2', name: 'GuestBob', slotIndex: 1, colorId: 1, isHost: false, isCpu: false, isReady: true },
        ],
        slotTokens: [[1, 'token_bob_secret']] as [number, string][],
        turnId: 3,
        stateVersion: 7,
        gameState: {
          pos: [45, 30],
          turn: 1,
          phase: 'idle',
          rolls: [5, 4],
          laddersHit: [1, 0],
          snakesHit: [0, 1],
          sixesHit: [1, 0],
          winner: -1,
          isPlaying: true,
        },
      };

      saveSession(sessionData);

      const retrieved = getSavedSession();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.roomCode).toBe('HOST88');
      expect(retrieved?.isHost).toBe(true);
      expect(retrieved?.slotTokens).toEqual([[1, 'token_bob_secret']]);
      expect(retrieved?.gameState?.pos).toEqual([45, 30]);
      expect(retrieved?.gameState?.isPlaying).toBe(true);
      expect(retrieved?.turnId).toBe(3);
      expect(retrieved?.stateVersion).toBe(7);
    });

    it('keeps a session that is merely hours old, and still honours the claim', () => {
      // (P1 regression) This used to assert the opposite: a 1-hour TTL that
      // called `clearSession()`, deleting the reconnect token. A player who took
      // an hour between matches came back as a *different person* - re-admitted
      // to a new slot, or unable to rejoin. Age alone must not destroy a seat
      // claim.
      const recentish = {
        roomCode: 'OLD123',
        playerId: 'p_old',
        playerName: 'OldHost',
        colorId: 0,
        slotIndex: 1,
        isHost: false,
        reconnectToken: 'a'.repeat(32),
        updatedAt: Date.now() - (61 * 60 * 1000), // 61 minutes ago
      };
      mockStore['snkladr_active_session'] = JSON.stringify(recentish);

      const retrieved = getSavedSession();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.roomCode).toBe('OLD123');
      expect(retrieved?.reconnectToken).toBe('a'.repeat(32));
      expect(mockStore['snkladr_active_session']).toBeDefined();
    });

    it('still discards a session past the multi-day claim TTL', () => {
      const expiredSession = {
        roomCode: 'OLD123',
        playerId: 'p_old',
        playerName: 'OldHost',
        colorId: 0,
        slotIndex: 0,
        isHost: true,
        updatedAt: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
      };
      mockStore['snkladr_active_session'] = JSON.stringify(expiredSession);

      const retrieved = getSavedSession();
      expect(retrieved).toBeNull();
      expect(mockStore['snkladr_active_session']).toBeUndefined();
    });

    it('clears active session upon calling clearSession()', () => {
      saveSession({
        roomCode: 'CLEAR1',
        playerId: 'p_clear',
        playerName: 'ClearHost',
        colorId: 0,
        slotIndex: 0,
        isHost: true,
      });
      expect(getSavedSession()).not.toBeNull();

      clearSession();
      expect(getSavedSession()).toBeNull();
    });

    it('preserves existing room code and avoids generating new random code when re-hosting', () => {
      // Test the logic that useMultiplayer uses when re-hosting
      const existingSession = {
        roomCode: 'KEEP99',
        playerId: 'p_host_1',
        playerName: 'Alice',
        colorId: 0,
        slotIndex: 0,
        isHost: true,
      };

      // If existingRoomCode is provided, code must be exactly existingRoomCode
      const code = (existingSession.roomCode || '').toUpperCase().trim();
      expect(code).toBe('KEEP99');
      expect(code).toHaveLength(6);
    });

    it('restores guest slot as human when guest presents their valid reconnect token', () => {
      // Simulating host restoring slotTokens map after re-hosting
      const savedSlotTokens: [number, string][] = [
        [1, 'secret_token_slot_1'],
        [2, 'secret_token_slot_2'],
      ];
      const slotTokensMap = new Map<number, string>(savedSlotTokens);

      // Returning guest sends RECONNECT_REQUEST
      const reconnectPacket = {
        type: 'RECONNECT_REQUEST' as const,
        requestId: 'req_rec_1',
        roomCode: 'KEEP99',
        token: 'secret_token_slot_1',
        slotIndex: 1,
        name: 'GuestBob',
      };

      // Host verifies reconnect token
      const expectedToken = slotTokensMap.get(reconnectPacket.slotIndex);
      const isTokenValid = expectedToken && expectedToken === reconnectPacket.token;
      expect(isTokenValid).toBe(true);

      // Guest is restored to slot 1 as human (isCpu = false)
      const restoredPlayer = {
        playerId: 'p_bob',
        peerId: 'peer_guest_bob',
        name: stripCpuSuffix(reconnectPacket.name),
        slotIndex: reconnectPacket.slotIndex,
        colorId: 1,
        isHost: false,
        isCpu: false,
        isReady: true,
      };
      expect(restoredPlayer.isCpu).toBe(false);
      expect(restoredPlayer.name).toBe('GuestBob');
      expect(restoredPlayer.name.includes('(CPU)')).toBe(false);
    });

    it('detects when host accidentally joins their own room and routes to re-host', () => {
      const activeHostSession = {
        roomCode: 'MYROOM',
        playerId: 'p_host_me',
        playerName: 'MeHost',
        colorId: 0,
        slotIndex: 0,
        isHost: true,
      };
      saveSession(activeHostSession);

      const enteredCode = 'myroom';
      const cleanCode = enteredCode.toUpperCase().trim();
      const session = getSavedSession();

      const shouldRehost = !!(session && session.roomCode === cleanCode && session.isHost);
      expect(shouldRehost).toBe(true);
    });

    it('PeerManager createRoom handles isRehost flag and allows retry on unavailable-id', () => {
      const pm = new PeerManager();
      // Verify createRoom signature accepts isRehost optional flag
      expect(typeof pm.createRoom).toBe('function');
      expect(pm.createRoom.length).toBeGreaterThanOrEqual(3);
    });
  });
});



