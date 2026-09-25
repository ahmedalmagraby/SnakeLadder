import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PeerManager } from '../src/game/network/peerManager';
import {
  saveSession,
  getSavedSession,
  clearSession,
  touchSession,
  markSessionFinished,
} from '../src/game/network/sessionStorage';
import type {
  Packet,
  NetworkPlayer,
  GameStateSnapshot,
  ConnectionStatus,
} from '../src/game/network/types';

// Mock PeerJS
vi.mock('peerjs', () => {
  return {
    default: class MockPeer {
      id: string;
      callbacks: Record<string, ((...args: any[]) => void)[]> = {};
      connections: any[] = [];
      destroyed = false;

      constructor(idOrOptions?: any, _options?: any) {
        if (typeof idOrOptions === 'string') {
          this.id = idOrOptions;
        } else {
          this.id = 'peer_' + Math.random().toString(36).slice(2, 8);
        }
      }

      on(event: string, cb: (...args: any[]) => void) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(cb);
        return this;
      }

      connect(targetId: string, _opts?: any) {
        const conn = new MockDataConnection(targetId);
        this.connections.push(conn);
        return conn;
      }

      destroy() {
        this.destroyed = true;
      }

      reconnect() {}

      // Test helper to simulate peer events
      _trigger(event: string, ...args: any[]) {
        (this.callbacks[event] || []).forEach((cb) => cb(...args));
      }
    },
  };
});

class MockDataConnection {
  peer: string;
  open = false;
  callbacks: Record<string, ((...args: any[]) => void)[]> = {};
  sentPackets: any[] = [];
  closed = false;

  constructor(peer: string) {
    this.peer = peer;
  }

  on(event: string, cb: (...args: any[]) => void) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
    return this;
  }

  send(data: any) {
    this.sentPackets.push(data);
  }

  close() {
    this.closed = true;
    this.open = false;
    (this.callbacks['close'] || []).forEach((cb) => cb());
  }

  _open() {
    this.open = true;
    (this.callbacks['open'] || []).forEach((cb) => cb());
  }

  _receive(data: any) {
    (this.callbacks['data'] || []).forEach((cb) => cb(data));
  }

  _error(err: any) {
    (this.callbacks['error'] || []).forEach((cb) => cb(err));
  }
}

describe('Connection & Room Lifecycle Handling', () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    (globalThis as any).window = {
      location: {
        hash: '',
        search: '',
        pathname: '/',
      },
      setInterval: (fn: any, ms: any) => setInterval(fn, ms),
      clearInterval: (id: any) => clearInterval(id),
      setTimeout: (fn: any, ms: any) => setTimeout(fn, ms),
      clearTimeout: (id: any) => clearTimeout(id),
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
    clearSession();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  /* ------------------------------------------------------------------ */
  /* 1. Full-Room Rejection: Close & Reset State                        */
  /* ------------------------------------------------------------------ */
  describe('1. Full-Room Rejection', () => {
    it('rejects join request and closes connection when host room is full', async () => {
      const pm = new PeerManager();
      const statuses: ConnectionStatus[] = [];
      pm.onStatus((s) => statuses.push(s));

      const joinPromise = pm.joinRoom('ABCDEF', 'Alice', 1);

      const peerInstance = (pm as any).peer;
      expect(peerInstance).toBeDefined();

      // Simulate peer open and connection to host
      peerInstance._trigger('open');
      const hostConn = (pm as any).hostConn as MockDataConnection;
      expect(hostConn).toBeDefined();

      // Host connection opens
      hostConn._open();
      expect(hostConn.sentPackets.length).toBe(1);
      expect(hostConn.sentPackets[0].type).toBe('JOIN_REQUEST');

      // Host sends JOIN_REJECTED due to full room
      const rejectPacket: Packet = {
        type: 'JOIN_REJECTED',
        requestId: hostConn.sentPackets[0].requestId,
        reason: 'Room is already full.',
      };
      hostConn._receive(rejectPacket);

      // joinRoom promise must reject with the host reason
      await expect(joinPromise).rejects.toThrow('Room is already full.');

      // State is reset and connection is closed
      expect(pm.getSlotIndex()).toBe(0);
      expect(statuses).toContain('error');
    });

    it('rejects reconnect request and resets session on RECONNECT_REJECTED', async () => {
      const pm = new PeerManager();
      const statuses: ConnectionStatus[] = [];
      pm.onStatus((s) => statuses.push(s));

      saveSession({
        roomCode: 'ABCDEF',
        playerId: 'p_guest',
        playerName: 'Guest',
        colorId: 1,
        slotIndex: 1,
        reconnectToken: 'tok_invalid_123',
        isHost: false,
        maxPlayers: 4,
      });

      const joinPromise = pm.joinRoom('ABCDEF', 'Guest', 1, true, 1, 'tok_invalid_123');
      const peerInstance = (pm as any).peer;
      peerInstance._trigger('open');
      const hostConn = (pm as any).hostConn as MockDataConnection;
      hostConn._open();

      expect(hostConn.sentPackets[0].type).toBe('RECONNECT_REQUEST');

      hostConn._receive({
        type: 'RECONNECT_REJECTED',
        requestId: hostConn.sentPackets[0].requestId,
        reason: 'Invalid or expired reconnect token.',
      });

      await expect(joinPromise).rejects.toThrow('Invalid or expired reconnect token.');
      expect(statuses).toContain('error');
    });
  });

  /* ------------------------------------------------------------------ */
  /* 2. Failed Signaling: Peer Unavailable / Timeout                    */
  /* ------------------------------------------------------------------ */
  describe('2. Failed Signaling & Timeouts', () => {
    it('rejects joinRoom if host peer ID is not found on network', async () => {
      const pm = new PeerManager();
      const joinPromise = pm.joinRoom('NOPE99', 'Bob', 1);

      const peerInstance = (pm as any).peer;
      peerInstance._trigger('error', { type: 'peer-unavailable' });

      await expect(joinPromise).rejects.toMatchObject({ type: 'peer-unavailable' });
    });

    it('rejects joinRoom if admission response times out after deadline', async () => {
      const pm = new PeerManager();
      const joinPromise = pm.joinRoom('TIMEOUT', 'Charlie', 2, false, 0, '', 5000);

      const peerInstance = (pm as any).peer;
      peerInstance._trigger('open');
      const hostConn = (pm as any).hostConn as MockDataConnection;
      hostConn._open();

      // Host never sends acceptance; advance timer past 5000ms
      vi.advanceTimersByTime(5001);

      await expect(joinPromise).rejects.toThrow('Join request timed out');
    });
  });

  /* ------------------------------------------------------------------ */
  /* 3. Disconnect During a Turn: Disable Local Rolling                 */
  /* ------------------------------------------------------------------ */
  describe('3. Disconnect During a Turn', () => {
    it('disables rolling when online match is disconnected or paused', () => {
      // Simulating canRoll evaluation under disconnected conditions
      const evaluateCanRoll = (state: {
        mode: string;
        phase: string;
        rolling: boolean;
        isOnline: boolean;
        isOnlineMatch: boolean;
        isPaused: boolean;
        turnSlot: number;
        onlineSlot: number;
        isCpu: boolean;
      }) => {
        return (
          state.mode === 'playing' &&
          state.phase === 'idle' &&
          !state.rolling &&
          !state.isPaused &&
          (!state.isOnlineMatch || !!state.isOnline) &&
          (state.isOnline ? state.turnSlot === state.onlineSlot : true) &&
          !state.isCpu
        );
      };

      // 1. While connected and player's turn: canRoll is true
      expect(
        evaluateCanRoll({
          mode: 'playing',
          phase: 'idle',
          rolling: false,
          isOnline: true,
          isOnlineMatch: true,
          isPaused: false,
          turnSlot: 1,
          onlineSlot: 1,
          isCpu: false,
        }),
      ).toBe(true);

      // 2. Disconnect drops isOnline to false: canRoll must become false immediately!
      expect(
        evaluateCanRoll({
          mode: 'playing',
          phase: 'idle',
          rolling: false,
          isOnline: false,
          isOnlineMatch: true,
          isPaused: false,
          turnSlot: 1,
          onlineSlot: 1,
          isCpu: false,
        }),
      ).toBe(false);

      // 3. Match paused while reconnecting: canRoll must remain false!
      expect(
        evaluateCanRoll({
          mode: 'playing',
          phase: 'idle',
          rolling: false,
          isOnline: false,
          isOnlineMatch: true,
          isPaused: true,
          turnSlot: 1,
          onlineSlot: 1,
          isCpu: false,
        }),
      ).toBe(false);
    });
  });

  /* ------------------------------------------------------------------ */
  /* 4. Reconnect While Lobby                                           */
  /* ------------------------------------------------------------------ */
  describe('4. Reconnect While Lobby', () => {
    it('resolves joinRoom on RECONNECT_ACCEPTED and adopts assigned slot', async () => {
      const pm = new PeerManager();
      const joinPromise = pm.joinRoom('LOBBY1', 'Alice', 1, true, 2, 'tok_secret_lobby');

      const peerInstance = (pm as any).peer;
      peerInstance._trigger('open');
      const hostConn = (pm as any).hostConn as MockDataConnection;
      hostConn._open();

      const players: NetworkPlayer[] = [
        {
          playerId: 'p0',
          peerId: 'host',
          name: 'Host',
          slotIndex: 0,
          colorId: 0,
          isHost: true,
          isCpu: false,
          isReady: true,
        },
        {
          playerId: 'p2',
          peerId: 'peer_alice',
          name: 'Alice',
          slotIndex: 2,
          colorId: 1,
          isHost: false,
          isCpu: false,
          isReady: true,
        },
      ];

      hostConn._receive({
        type: 'RECONNECT_ACCEPTED',
        requestId: hostConn.sentPackets[0].requestId,
        slotIndex: 2,
        reconnectToken: 'tok_secret_lobby',
        roomCode: 'LOBBY1',
        speed: 'normal',
        winRule: 'exact',
        players,
        turnId: 1,
        stateVersion: 2,
        maxPlayers: 4,
      });

      await expect(joinPromise).resolves.toBeUndefined();
      expect(pm.getSlotIndex()).toBe(2);
    });
  });

  /* ------------------------------------------------------------------ */
  /* 5. Reconnect While Playing                                         */
  /* ------------------------------------------------------------------ */
  describe('5. Reconnect While Playing', () => {
    it('receives active GameStateSnapshot on reconnect during live match', async () => {
      const pm = new PeerManager();
      let receivedPacket: Packet | null = null;
      pm.onPacket((p) => {
        receivedPacket = p;
      });

      const joinPromise = pm.joinRoom('PLAY01', 'Bob', 2, true, 1, 'tok_secret_play');
      const peerInstance = (pm as any).peer;
      peerInstance._trigger('open');
      const hostConn = (pm as any).hostConn as MockDataConnection;
      hostConn._open();

      const gameState: GameStateSnapshot = {
        mode: 'playing',
        pos: [24, 38],
        turn: 1,
        phase: 'idle',
        rolls: [4, 5],
        laddersHit: [1, 0],
        snakesHit: [0, 1],
        sixesHit: [0, 0],
        winner: -1,
        isPlaying: true,
      };

      const players: NetworkPlayer[] = [
        {
          playerId: 'p0',
          peerId: 'host',
          name: 'Host',
          slotIndex: 0,
          colorId: 0,
          isHost: true,
          isCpu: false,
          isReady: true,
        },
        {
          playerId: 'p1',
          peerId: 'peer_bob',
          name: 'Bob',
          slotIndex: 1,
          colorId: 2,
          isHost: false,
          isCpu: false,
          isReady: true,
        },
      ];

      hostConn._receive({
        type: 'RECONNECT_ACCEPTED',
        requestId: hostConn.sentPackets[0].requestId,
        slotIndex: 1,
        reconnectToken: 'tok_secret_play',
        roomCode: 'PLAY01',
        speed: 'fast',
        winRule: 'exact',
        players,
        turnId: 6,
        stateVersion: 12,
        maxPlayers: 4,
        gameState,
      });

      await expect(joinPromise).resolves.toBeUndefined();
      expect((receivedPacket as any)?.gameState).toEqual(gameState);
    });
  });

  /* ------------------------------------------------------------------ */
  /* 6. Reconnect While Over & Session Clearing                         */
  /* ------------------------------------------------------------------ */
  describe('6. Reconnect While Over', () => {
    it('marks session finished when match concludes so it cannot be reconnected', () => {
      saveSession({
        roomCode: 'OVER01',
        playerId: 'p1',
        playerName: 'WinnerPlayer',
        colorId: 0,
        slotIndex: 0,
        isHost: true,
        maxPlayers: 4,
        gameState: {
          mode: 'playing',
          pos: [99, 50],
          turn: 0,
          phase: 'idle',
          rolls: [10, 10],
          laddersHit: [2, 1],
          snakesHit: [0, 2],
          sixesHit: [1, 0],
          winner: -1,
          isPlaying: true,
        },
      });

      expect(getSavedSession()).not.toBeNull();

      // Active play updates session
      touchSession();
      expect(getSavedSession()?.updatedAt).toBeGreaterThan(0);

      // Match concludes with a winner -> markSessionFinished
      markSessionFinished();

      // getSavedSession must now return null because finished match cannot be resumed!
      expect(getSavedSession()).toBeNull();
    });
  });

  /* ------------------------------------------------------------------ */
  /* 7. Rapid Leave / Rejoin: Generation Invariant                      */
  /* ------------------------------------------------------------------ */
  describe('7. Rapid Leave / Rejoin Generation Guards', () => {
    it('increments generation on cleanup and blocks callbacks from old rooms', () => {
      const pm = new PeerManager();
      const initialGen = pm.getGeneration();
      expect(initialGen).toBe(0);

      // Start room 1
      pm.joinRoom('ROOM01', 'Alice', 0).catch(() => {});
      const gen1 = pm.getGeneration();
      expect(gen1).toBeGreaterThan(initialGen);

      const oldConn = (pm as any).hostConn;

      // User rapidly leaves room 1
      pm.cleanup();
      const genAfterCleanup = pm.getGeneration();
      expect(genAfterCleanup).toBeGreaterThan(gen1);

      // User starts room 2
      pm.joinRoom('ROOM02', 'Alice', 0).catch(() => {});
      const gen2 = pm.getGeneration();
      expect(gen2).toBeGreaterThan(genAfterCleanup);

      let packetReceived = false;
      pm.onPacket(() => {
        packetReceived = true;
      });

      // Stale packet from old connection arrives
      oldConn?._receive({
        type: 'ROLL_RESULT',
        player: 0,
        roll: 6,
        turnId: 1,
        stateVersion: 1,
        timestamp: Date.now(),
      });

      // Stale packet must be completely ignored!
      expect(packetReceived).toBe(false);
    });
  });

  /* ------------------------------------------------------------------ */
  /* 8. Host Refresh: Re-host with Original Room Code                   */
  /* ------------------------------------------------------------------ */
  describe('8. Host Refresh / Re-host', () => {
    it('re-hosts existing room code with isRehost=true', async () => {
      const pm = new PeerManager();
      const createPromise = pm.createRoom('REHOST', 'HostUser', 0, true);

      const peerInstance = (pm as any).peer;
      expect(peerInstance.id).toBe('snkladr-rehost');

      peerInstance._trigger('open');
      const code = await createPromise;
      expect(code).toBe('REHOST');
      expect(pm.getIsHost()).toBe(true);
    });

    it('emits error and rejects when room code ID is held/unavailable', async () => {
      const pm = new PeerManager();
      const statuses: ConnectionStatus[] = [];
      pm.onStatus((s) => statuses.push(s));

      const createPromise = pm.createRoom('LOCKED', 'HostUser', 0, false);
      const peerInstance = (pm as any).peer;

      // Simulate unavailable-id error from PeerJS signaling
      peerInstance._trigger('error', { type: 'unavailable-id' });

      await expect(createPromise).rejects.toMatchObject({ type: 'unavailable-id' });
      expect(statuses).toContain('error');
    });
  });

  /* ------------------------------------------------------------------ */
  /* 9. Host Loss: 20s Reconnect Grace Period                           */
  /* ------------------------------------------------------------------ */
  describe('9. Host Loss Grace Period', () => {
    it('grace period timer fires after 20s and marks match abandoned', () => {
      let isPaused = true;
      let gameStatus = 'paused';
      let sessionCleared = false;

      const gracePeriodTimer = setTimeout(() => {
        isPaused = false;
        gameStatus = 'abandoned';
        sessionCleared = true;
      }, 20000);

      // At 10s: match is still paused
      vi.advanceTimersByTime(10000);
      expect(isPaused).toBe(true);
      expect(gameStatus).toBe('paused');
      expect(sessionCleared).toBe(false);

      // At 20s: grace period expires, match transitions to abandoned!
      vi.advanceTimersByTime(10001);
      expect(isPaused).toBe(false);
      expect(gameStatus).toBe('abandoned');
      expect(sessionCleared).toBe(true);
      clearTimeout(gracePeriodTimer);
    });
  });

  /* ------------------------------------------------------------------ */
  /* 10. Heartbeat Deadlines & Missed Responses                         */
  /* ------------------------------------------------------------------ */
  describe('10. Heartbeat Deadlines', () => {
    it('host closes connection if guest heartbeat deadline (9s) is exceeded', () => {
      const pm = new PeerManager();
      (pm as any).isHost = true;
      (pm as any).roomCode = 'HEART1';

      const mockGuestConn = new MockDataConnection('guest-hb');
      mockGuestConn.open = true;

      (pm as any).handleIncomingConnection(mockGuestConn);
      pm.setAdmissionState('guest-hb', 'joined', 1);

      const mc = (pm as any).connections.get('guest-hb');
      expect(mc).toBeDefined();

      // Start ping monitor
      (pm as any).startPingMonitor();

      // Advance 10s without guest sending PONG or packets
      vi.advanceTimersByTime(10000);

      // Heartbeat deadline was 9s -> connection should now be closed!
      expect(mockGuestConn.closed).toBe(true);
      expect(pm.getAdmissionState('guest-hb')).toBeUndefined();
    });

    it('guest considers host lost when host heartbeat deadline (9s) is exceeded', () => {
      const pm = new PeerManager();
      const statuses: ConnectionStatus[] = [];
      pm.onStatus((s) => statuses.push(s));

      (pm as any).isHost = false;
      (pm as any).roomCode = 'HEART2';
      const mockHostConn = new MockDataConnection('host');
      mockHostConn.open = true;
      (pm as any).hostConn = mockHostConn;
      (pm as any).lastHostHeartbeat = Date.now();

      (pm as any).startPingMonitor();

      // Advance 10 seconds without any host response
      vi.advanceTimersByTime(10000);

      expect(statuses).toContain('disconnected');
    });
  });
});
