/**
 * @vitest-environment jsdom
 *
 * Regression suite for multiplayer desynchronisation and lobby bugs.
 *
 * These tests drive the REAL `useMultiplayer` hook on one side and a real
 * `PeerManager` instance on the other, over an in-memory WebRTC data channel, so
 * the packet validation / admission / broadcast path is genuinely exercised.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PeerManager, peerManager } from '../src/game/network/peerManager';
import { useMultiplayer } from '../src/game/network/useMultiplayer';
import { validatePacket } from '../src/game/network/validation';
import {
  clearSession,
  getSavedSession,
  saveSession,
} from '../src/game/network/sessionStorage';
import type { NetworkPlayer, Packet } from '../src/game/network/types';

/* ------------------------------------------------------------------ */
/* In-memory cross-connected mock data connection                     */
/* ------------------------------------------------------------------ */

class PairedDataConnection {
  peer: string;
  open = false;
  closed = false;
  pairedWith: PairedDataConnection | null = null;
  callbacks: Record<string, ((...args: any[]) => void)[]> = {};

  constructor(peer: string) {
    this.peer = peer;
  }

  on(event: string, cb: (...args: any[]) => void) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
    return this;
  }

  send(data: any) {
    if (this.closed) return;
    setTimeout(() => {
      if (this.pairedWith && !this.pairedWith.closed) {
        this.pairedWith._emit('data', data);
      }
    }, 0);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this._emit('close');
    if (this.pairedWith && !this.pairedWith.closed) {
      this.pairedWith.closed = true;
      this.pairedWith.open = false;
      this.pairedWith._emit('close');
    }
  }

  _emit(event: string, ...args: any[]) {
    (this.callbacks[event] || []).forEach((cb) => cb(...args));
  }

  /** Deliver inbound traffic (the perspective of the remote side). */
  _receive(data: any) {
    this._emit('data', data);
  }
}

/** Bare peer used to stand in for a remote host we fully control. */
class HostStub {
  id: string;
  destroyed = false;
  conn: PairedDataConnection | null = null;
  callbacks: Record<string, ((...args: any[]) => void)[]> = {};

  constructor(id: string) {
    this.id = id;
  }

  on(event: string, cb: (...args: any[]) => void) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
    return this;
  }

  _emit(event: string, ...args: any[]) {
    (this.callbacks[event] || []).forEach((cb) => cb(...args));
  }

  _captureConn(c: PairedDataConnection) {
    this.conn = c;
  }
}

const peerRegistry = new Map<string, any>();

vi.mock('peerjs', () => {
  return {
    default: class MockPeer {
      id: string;
      callbacks: Record<string, ((...args: any[]) => void)[]> = {};
      destroyed = false;

      constructor(idOrOptions?: any) {
        this.id =
          typeof idOrOptions === 'string'
            ? idOrOptions
            : 'peer_' + Math.random().toString(36).slice(2, 8);
        peerRegistry.set(this.id, this);
        setTimeout(() => this._emit('open', this.id), 0);
      }

      on(event: string, cb: (...args: any[]) => void) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(cb);
        return this;
      }

      connect(targetId: string) {
        const clientConn = new PairedDataConnection(targetId);
        const targetPeer = peerRegistry.get(targetId);

        setTimeout(() => {
          if (targetPeer && !targetPeer.destroyed) {
            const hostConn = new PairedDataConnection(this.id);
            clientConn.pairedWith = hostConn;
            hostConn.pairedWith = clientConn;
            clientConn.open = true;
            hostConn.open = true;

            targetPeer._emit('connection', hostConn);
            if (typeof targetPeer._captureConn === 'function') {
              targetPeer._captureConn(hostConn);
            }
            setTimeout(() => {
              clientConn._emit('open');
              hostConn._emit('open');
            }, 0);
          } else {
            clientConn._emit('error', new Error('Peer not found'));
          }
        }, 1);

        return clientConn;
      }

      destroy() {
        this.destroyed = true;
        peerRegistry.delete(this.id);
      }

      reconnect() {}

      _emit(event: string, ...args: any[]) {
        (this.callbacks[event] || []).forEach((cb) => cb(...args));
      }
    },
  };
});

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Let queued `setTimeout(..., 0/1)` data deliveries drain. */
async function flush(ms = 40) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

function hostPlayer(name = 'Host'): NetworkPlayer {
  return {
    playerId: 'p_host',
    peerId: 'host',
    name,
    slotIndex: 0,
    colorId: 0,
    isHost: true,
    isCpu: false,
    isReady: true,
  };
}

beforeEach(() => {
  peerRegistry.clear();
  clearSession();
  window.location.hash = '';
});

afterEach(() => {
  try {
    peerManager.cleanup();
  } catch {
    // ignore
  }
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* 1. Host refresh must not produce a roster that fails validation     */
/* ------------------------------------------------------------------ */

describe('Regression 1: host refresh keeps the restored roster broadcast-safe', () => {
  it('never restores a seat with an empty peerId (which would disconnect every guest)', async () => {
    const { result } = renderHook(() => useMultiplayer());

    // Simulate the session left behind by a host that crashed mid-match.
    saveSession({
      roomCode: 'REFR01',
      playerId: 'p_host',
      playerName: 'Host',
      colorId: 0,
      slotIndex: 0,
      isHost: true,
      maxPlayers: 4,
      speed: 'normal',
      winRule: 'exact',
      players: [
        hostPlayer(),
        {
          playerId: 'p_g1',
          peerId: 'peer_g1',
          name: 'Alice',
          slotIndex: 1,
          colorId: 1,
          isHost: false,
          isCpu: false,
          isReady: true,
        },
        {
          playerId: 'p_g2',
          peerId: 'peer_g2',
          name: 'Bob',
          slotIndex: 2,
          colorId: 2,
          isHost: false,
          isCpu: false,
          isReady: true,
        },
      ],
      slotTokens: [
        [1, 'secret_token_slot_1'],
        [2, 'secret_token_slot_2'],
      ],
      turnId: 4,
      stateVersion: 12,
      gameState: {
        mode: 'playing',
        pos: [30, 12, 44],
        turn: 1,
        phase: 'idle',
        rolls: [4, 3, 5],
        laddersHit: [1, 0, 1],
        snakesHit: [0, 1, 0],
        sixesHit: [0, 0, 1],
        winner: -1,
        isPlaying: true,
      },
    });

    await act(async () => {
      await result.current.createRoom('Host', 0, 4, 'normal', 'exact', 'REFR01', true);
    });
    await flush();

    const restored = result.current.players;
    expect(restored.map((p) => p.slotIndex)).toEqual([0, 1, 2]);

    // The original bug: re-hosting assigned `peerId: ''`, which fails
    // `isValidNetworkPlayer`, so peerManager closed EVERY guest connection on the
    // first broadcast after a host refresh.
    for (const p of restored) {
      expect(typeof p.peerId).toBe('string');
      expect(p.peerId.length).toBeGreaterThan(0);
    }

    // Every broadcast the host can now emit must survive validation.
    expect(
      validatePacket({
        type: 'LOBBY_UPDATE',
        players: restored,
        speed: 'normal',
        winRule: 'exact',
        stateVersion: 99,
        maxPlayers: 4,
      }).valid,
    ).toBe(true);

    expect(
      validatePacket({
        type: 'GAME_START',
        players: restored,
        speed: 'normal',
        winRule: 'exact',
        stateVersion: 99,
        turnId: 1,
      }).valid,
    ).toBe(true);

    // Reconnect tokens must survive a refresh so returning guests keep their seat.
    await act(async () => {
      await result.current.reconnectRoom();
    });
    await flush();

    const g1 = new PeerManager();
    await g1.joinRoom('REFR01', 'Alice', 1, true, 1, 'secret_token_slot_1');
    await flush();

    expect(g1.getSlotIndex()).toBe(1);
    expect(result.current.players.find((p) => p.slotIndex === 1)?.isCpu).toBe(false);
    expect(result.current.players.find((p) => p.slotIndex === 1)?.isReady).toBe(true);

    g1.cleanup();
  });
});

/* ------------------------------------------------------------------ */
/* 2. Host-authoritative roll validation                              */
/* ------------------------------------------------------------------ */

describe('Regression 2: host rejects duplicate and out-of-turn roll requests', () => {
  async function mountLiveHost() {
    const onRemoteRoll = vi.fn();
    const onGameStart = vi.fn();
    // Mutable so each test can dictate what the host's *live* state reports.
    const authority = { turnSlot: 1, isPlaying: true, isAwaitingRoll: true };
    // The stable snapshot deliberately lies with `phase: 'idle'` for the whole
    // duration of a turn's animation - that is exactly why the old guard failed.
    const stableSnapshot = {
      mode: 'playing' as const,
      pos: [10, 10],
      turn: 1,
      phase: 'idle',
      rolls: [1, 1],
      laddersHit: [0, 0],
      snakesHit: [0, 0],
      sixesHit: [0, 0],
      winner: -1,
      isPlaying: true,
    };

    const hook = renderHook(() =>
      useMultiplayer({
        onRemoteRoll,
        onGameStart,
        getGameStateSnapshot: () => stableSnapshot,
        getRollAuthority: () => authority,
      }),
    );

    await act(async () => {
      await hook.result.current.createRoom('Host', 0, 4, 'normal', 'exact', 'ROLL01');
    });
    await flush();

    const guest = new PeerManager();
    await guest.joinRoom('ROLL01', 'Alice', 1);
    await flush();

    act(() => {
      hook.result.current.startGame();
    });
    await flush();

    return { hook, guest, onRemoteRoll, authority, stableSnapshot };
  }

  it('serves exactly one authoritative roll per turn, even on a replayed request', async () => {
    const { hook, guest, onRemoteRoll } = await mountLiveHost();

    const request = (reqId: string): Packet => ({
      type: 'ROLL_REQUEST',
      requestId: reqId,
      turnId: 1,
      slotIndex: 1,
    });

    guest.sendToPeer('snkladr-roll01', request('roll_a'));
    await flush();
    expect(onRemoteRoll).toHaveBeenCalledTimes(1);

    // Same turn, brand new requestId (e.g. the guest double-tapped).
    guest.sendToPeer('snkladr-roll01', request('roll_b'));
    await flush();
    expect(onRemoteRoll).toHaveBeenCalledTimes(1);

    // Exact replay of the very first request must also be dropped.
    guest.sendToPeer('snkladr-roll01', request('roll_a'));
    await flush();
    expect(onRemoteRoll).toHaveBeenCalledTimes(1);

    guest.cleanup();
    hook.unmount();
  });

  it('rejects a roll request while the host is still resolving the previous turn', async () => {
    const { hook, guest, onRemoteRoll, authority, stableSnapshot } =
      await mountLiveHost();

    // Host is mid-animation. The stable snapshot still claims `phase: 'idle'`,
    // which is precisely what defeated the previous duplicate-roll guard.
    authority.isAwaitingRoll = false;
    expect(stableSnapshot.phase).toBe('idle');

    guest.sendToPeer('snkladr-roll01', {
      type: 'ROLL_REQUEST',
      requestId: 'roll_midturn',
      turnId: 1,
      slotIndex: 1,
    });
    await flush();

    expect(onRemoteRoll).not.toHaveBeenCalled();

    guest.cleanup();
    hook.unmount();
  });

  it('rejects a roll request from a player who does not own the current turn', async () => {
    const { hook, guest, onRemoteRoll, authority } = await mountLiveHost();

    authority.turnSlot = 0; // host's turn
    authority.isAwaitingRoll = true;

    guest.sendToPeer('snkladr-roll01', {
      type: 'ROLL_REQUEST',
      requestId: 'roll_outofturn',
      turnId: 1,
      slotIndex: 1,
    });
    await flush();

    expect(onRemoteRoll).not.toHaveBeenCalled();

    guest.cleanup();
    hook.unmount();
  });

  it('rejects a roll request carrying a stale turnId', async () => {
    const { hook, guest, onRemoteRoll } = await mountLiveHost();

    guest.sendToPeer('snkladr-roll01', {
      type: 'ROLL_REQUEST',
      requestId: 'roll_stale',
      turnId: 99,
      slotIndex: 1,
    });
    await flush();

    expect(onRemoteRoll).not.toHaveBeenCalled();

    guest.cleanup();
    hook.unmount();
  });
});

/* ------------------------------------------------------------------ */
/* 3. A dropped player is never handed to an AI bot                    */
/* ------------------------------------------------------------------ */

describe('Regression 3: disconnected players are reserved, never AI-controlled', () => {
  it('keeps the seat human while the player is away', async () => {
    const onPlayersUpdated = vi.fn();
    const { result } = renderHook(() => useMultiplayer({ onPlayersUpdated }));
    await act(async () => {
      await result.current.createRoom('Host', 0, 4, 'normal', 'exact', 'NOCPU1');
    });
    await flush();

    const guest = new PeerManager();
    await guest.joinRoom('NOCPU1', 'Alice', 1);
    await flush();

    const seatOf = (slot: number) =>
      result.current.players.find((p) => p.slotIndex === slot)!;

    expect(seatOf(1).isCpu).toBe(false);
    expect(seatOf(1).isReady).toBe(true);

    // Alice drops out.
    guest.cleanup();
    await flush();

    // The seat must stay reserved for a HUMAN: no bot, no "(CPU)" label, and the
    // game roster (which drives the engine's AI turn handler) must stay human too.
    expect(seatOf(1).isCpu).toBe(false);
    expect(seatOf(1).isReady).toBe(false);
    expect(seatOf(1).name).not.toContain('CPU');

    const lastConfigs = onPlayersUpdated.mock.calls.at(-1)![0];
    const aliceConfig = lastConfigs.find((c: { slotIndex: number }) => c.slotIndex === 1);
    expect(aliceConfig.isCpu).toBe(false);
    expect(aliceConfig.name).not.toContain('CPU');
  });

  it('ignores a LATE close from the connection that a rejoin already replaced', async () => {
    const { result } = renderHook(() => useMultiplayer());
    await act(async () => {
      await result.current.createRoom('Host', 0, 4, 'normal', 'exact', 'LATE01');
    });
    await flush();

    const guest = new PeerManager();
    await guest.joinRoom('LATE01', 'Alice', 1);
    await flush();

    const seatOf = (slot: number) =>
      result.current.players.find((p) => p.slotIndex === slot)!;
    const readToken = () =>
      JSON.parse(localStorage.getItem('snkladr_active_session')!)
        .slotTokens[0][1] as string;

    const stalePeerId = seatOf(1).peerId;
    const staleConn = (peerManager as any).connections.get(stalePeerId).conn;

    // The guest re-establishes a brand new connection (a new PeerJS id) and
    // successfully reclaims its seat. This normally happens ~1s after the drop.
    const returning = new PeerManager();
    await returning.joinRoom('LATE01', 'Alice', 1, true, 1, readToken());
    await flush();

    expect(seatOf(1).isReady).toBe(true);
    expect(seatOf(1).peerId).not.toBe(stalePeerId);

    // The host now finally notices the ORIGINAL dropped socket. That close event
    // belongs to a connection that no longer owns the seat, so it must not flip
    // the live player back to "not ready".
    await act(async () => {
      staleConn._emit('close');
      await flush();
    });

    expect(seatOf(1).isReady).toBe(true);
    expect(seatOf(1).peerId).not.toBe(stalePeerId);
    expect(seatOf(1).name).toBe('Alice');

    returning.cleanup();
  });

  it('propagates the correction to every other client in the room', async () => {
    const stub = new HostStub('snkladr-observe');
    peerRegistry.set('snkladr-observe', stub);

    const observerHook = renderHook(() => useMultiplayer());

    let joinPromise: Promise<void>;
    await act(async () => {
      joinPromise = observerHook.result.current.joinRoom('OBSERVE', 'Observer', 2);
      await flush();
    });

    // Hand the observer a real roster so it behaves like a joined client.
    await act(async () => {
      stub.conn!.send({
        type: 'JOIN_ACCEPTED',
        requestId: 'req_obs',
        slotIndex: 2,
        reconnectToken: 'secret_token_slot_2',
        roomCode: 'OBSERVE',
        speed: 'normal',
        winRule: 'exact',
        players: [
          hostPlayer(),
          {
            playerId: 'p_a',
            peerId: 'peer_a',
            name: 'Alice',
            slotIndex: 1,
            colorId: 1,
            isHost: false,
            isCpu: false,
            isReady: true,
          },
          {
            playerId: 'p_obs',
            peerId: 'observer_peer',
            name: 'Observer',
            slotIndex: 2,
            colorId: 2,
            isHost: false,
            isCpu: false,
            isReady: true,
          },
        ],
        stateVersion: 5,
        turnId: 1,
        maxPlayers: 4,
      });
      await flush();
    });
    await act(async () => {
      await joinPromise;
    });

    const observerSeat = (slot: number) =>
      observerHook.result.current.players.find((p) => p.slotIndex === slot)!;

    // Host reports Alice away, then Alice comes back.
    await act(async () => {
      stub.conn!.send({
        type: 'LOBBY_UPDATE',
        players: [
          hostPlayer(),
          {
            playerId: 'p_a',
            peerId: 'peer_a',
            name: 'Alice',
            slotIndex: 1,
            colorId: 1,
            isHost: false,
            isCpu: false,
            isReady: false,
          },
          {
            playerId: 'p_obs',
            peerId: 'observer_peer',
            name: 'Observer',
            slotIndex: 2,
            colorId: 2,
            isHost: false,
            isCpu: false,
            isReady: true,
          },
        ],
        speed: 'normal',
        winRule: 'exact',
        stateVersion: 6,
        maxPlayers: 4,
      });
      await flush();
    });
    expect(observerSeat(1).isReady).toBe(false);

    // Alice reclaims her seat on a NEW connection; the host bumps stateVersion.
    const newPeerId = 'peer_a_reconnected';
    await act(async () => {
      stub.conn!.send({
        type: 'LOBBY_UPDATE',
        players: [
          hostPlayer(),
          {
            playerId: 'p_a',
            peerId: newPeerId,
            name: 'Alice',
            slotIndex: 1,
            colorId: 1,
            isHost: false,
            isCpu: false,
            isReady: true,
          },
          {
            playerId: 'p_obs',
            peerId: 'observer_peer',
            name: 'Observer',
            slotIndex: 2,
            colorId: 2,
            isHost: false,
            isCpu: false,
            isReady: true,
          },
        ],
        speed: 'normal',
        winRule: 'exact',
        stateVersion: 7,
        maxPlayers: 4,
      });
      await flush();
    });

    expect(observerSeat(1).isReady).toBe(true);
    expect(observerSeat(1).peerId).toBe(newPeerId);

    // A stale LOBBY_UPDATE that predates the rejoin must be dropped outright.
    await act(async () => {
      stub.conn!.send({
        type: 'LOBBY_UPDATE',
        players: [
          hostPlayer(),
          {
            playerId: 'p_a',
            peerId: 'peer_a',
            name: 'Alice',
            slotIndex: 1,
            colorId: 1,
            isHost: false,
            isCpu: false,
            isReady: false,
          },
          {
            playerId: 'p_obs',
            peerId: 'observer_peer',
            name: 'Observer',
            slotIndex: 2,
            colorId: 2,
            isHost: false,
            isCpu: false,
            isReady: true,
          },
        ],
        speed: 'normal',
        winRule: 'exact',
        stateVersion: 6,
        maxPlayers: 4,
      });
      await flush();
    });

    expect(observerSeat(1).isReady).toBe(true);

    observerHook.unmount();
  });

  it('restores human control (and the seat) when the player comes back', async () => {
    const { result } = renderHook(() => useMultiplayer());
    await act(async () => {
      await result.current.createRoom('Host', 0, 4, 'normal', 'exact', 'NOCPU2');
    });
    await flush();

    const first = new PeerManager();
    await first.joinRoom('NOCPU2', 'Alice', 1);
    await flush();
    const token = JSON.parse(
      localStorage.getItem('snkladr_active_session')!,
    ).slotTokens[0][1] as string;
    first.cleanup();
    await flush();

    const returning = new PeerManager();
    await returning.joinRoom('NOCPU2', 'Alice', 1, true, 1, token);
    await flush();

    const seat = result.current.players.find((p) => p.slotIndex === 1)!;
    expect(seat.isCpu).toBe(false);
    expect(seat.isReady).toBe(true);
    expect(seat.name).toBe('Alice');
    expect(returning.getSlotIndex()).toBe(1);

    returning.cleanup();
  });

  it('does not convert reserved seats into CPU bots when the host re-hosts', async () => {
    saveSession({
      roomCode: 'NOCPU3',
      playerId: 'p_host',
      playerName: 'Host',
      colorId: 0,
      slotIndex: 0,
      isHost: true,
      maxPlayers: 4,
      speed: 'normal',
      winRule: 'exact',
      players: [
        hostPlayer(),
        {
          playerId: 'p_g1',
          peerId: 'peer_g1',
          name: 'Alice',
          slotIndex: 1,
          colorId: 1,
          isHost: false,
          isCpu: false,
          isReady: true,
        },
        {
          playerId: 'bot_2',
          peerId: 'cpu-2',
          name: 'CPU 2',
          slotIndex: 2,
          colorId: 2,
          isHost: false,
          isCpu: true,
          isReady: true,
        },
      ],
      slotTokens: [[1, 'secret_token_slot_1']],
      turnId: 3,
      stateVersion: 8,
      gameState: {
        mode: 'playing',
        pos: [10, 20, 30],
        turn: 0,
        phase: 'idle',
        rolls: [2, 2, 2],
        laddersHit: [0, 0, 0],
        snakesHit: [0, 0, 0],
        sixesHit: [0, 0, 0],
        winner: -1,
        isPlaying: true,
      },
    });

    const { result } = renderHook(() => useMultiplayer());
    await act(async () => {
      await result.current.createRoom('Host', 0, 4, 'normal', 'exact', 'NOCPU3', true);
    });
    await flush();

    const seatOf = (slot: number) =>
      result.current.players.find((p) => p.slotIndex === slot)!;

    // The absent human keeps their seat but is NOT played by an AI.
    expect(seatOf(1).isCpu).toBe(false);
    expect(seatOf(1).isReady).toBe(false);
    expect(seatOf(1).name).not.toContain('CPU');

    // A bot the host added on purpose in the lobby stays a bot.
    expect(seatOf(2).isCpu).toBe(true);
    expect(seatOf(2).isReady).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 4. Room membership survives a finished match + next match           */
/* ------------------------------------------------------------------ */

describe('Regression 4: a new match re-arms the room session', () => {
  const roster = (): NetworkPlayer[] => [
    hostPlayer(),
    {
      playerId: 'p_guest',
      peerId: 'peer_guest',
      name: 'Guest',
      slotIndex: 1,
      colorId: 1,
      isHost: false,
      isCpu: false,
      isReady: true,
    },
  ];

  async function mountGuest() {
    const stub = new HostStub('snkladr-rstrt1');
    peerRegistry.set('snkladr-rstrt1', stub);

    const hook = renderHook(() => useMultiplayer());
    let joinPromise: Promise<void>;
    await act(async () => {
      joinPromise = hook.result.current.joinRoom('RSTRT1', 'Guest', 1);
      await flush();
    });

    await act(async () => {
      stub.conn!.send({
        type: 'JOIN_ACCEPTED',
        requestId: 'req_rm',
        slotIndex: 1,
        reconnectToken: 'secret_token_slot_1',
        roomCode: 'RSTRT1',
        speed: 'normal',
        winRule: 'exact',
        players: roster(),
        stateVersion: 2,
        turnId: 1,
        maxPlayers: 4,
        gameState: {
          mode: 'playing',
          pos: [10, 10],
          turn: 0,
          phase: 'idle',
          rolls: [1, 1],
          laddersHit: [0, 0],
          snakesHit: [0, 0],
          sixesHit: [0, 0],
          winner: -1,
          isPlaying: true,
        },
      });
      await flush();
    });
    await act(async () => {
      await joinPromise;
    });

    return { hook, stub };
  }

  it('keeps the rejoin identity after the match ends and the host starts another', async () => {
    const { hook, stub } = await mountGuest();

    const tokenBefore = hook.result.current.savedSession?.reconnectToken;
    expect(tokenBefore).toBe('secret_token_slot_1');

    // Match 1 concludes: the host wins.
    await act(async () => {
      stub.conn!.send({
        type: 'SYNC_CHECKPOINT',
        mode: 'over',
        pos: [100, 20],
        turn: 0,
        phase: 'over',
        rolls: [12, 4],
        laddersHit: [2, 1],
        snakesHit: [0, 1],
        sixesHit: [1, 0],
        winner: 0,
        stateVersion: 30,
        turnId: 9,
      });
      await flush();
    });

    // A finished match must not offer to resume a stale board...
    expect(hook.result.current.savedSession?.isFinished).toBe(true);
    expect(hook.result.current.savedSession?.gameState?.isPlaying).toBeFalsy();
    // ...but the player must STILL hold their claim on the room.
    expect(hook.result.current.savedSession?.reconnectToken).toBe('secret_token_slot_1');

    // Host launches the next match.
    await act(async () => {
      stub.conn!.send({
        type: 'GAME_START',
        players: roster(),
        speed: 'normal',
        winRule: 'exact',
        stateVersion: 31,
        turnId: 1,
      });
      await flush();
    });

    // The session is live again: resume/rejoin is offered and the token is intact.
    expect(hook.result.current.savedSession?.isFinished).toBeFalsy();
    expect(hook.result.current.savedSession?.reconnectToken).toBe('secret_token_slot_1');
    expect(hook.result.current.savedSession?.slotIndex).toBe(1);
    expect(hook.result.current.savedSession?.roomCode).toBe('RSTRT1');
    expect(hook.result.current.gameStatus).toBe('playing');

    // And the same identity survives a page reload mid-match-2.
    const reloaded = getSavedSession();
    expect(reloaded?.reconnectToken).toBe('secret_token_slot_1');
    expect(reloaded?.isFinished).toBeFalsy();

    hook.unmount();
  });

  it('preserves the seat identity when the guest leaves and comes back', async () => {
    const { hook } = await mountGuest();

    act(() => {
      hook.result.current.leaveRoom();
    });
    await flush();

    // Leaving the room must not destroy the reconnect token: the host still holds
    // the seat reserved, so returning must be recognised as the same player.
    const afterLeave = hook.result.current.savedSession;
    expect(afterLeave?.reconnectToken).toBe('secret_token_slot_1');
    expect(afterLeave?.roomCode).toBe('RSTRT1');
    expect(afterLeave?.slotIndex).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Kicking a human actually removes them                            */
/* ------------------------------------------------------------------ */

describe('Regression 5: kicking a human player removes the seat', () => {
  it('drops the roster entry, revokes the token and closes the transport', async () => {
    const { result } = renderHook(() => useMultiplayer());
    await act(async () => {
      await result.current.createRoom('Host', 0, 4, 'normal', 'exact', 'KICK01');
    });
    await flush();

    const guest = new PeerManager();
    const statuses: string[] = [];
    guest.onStatus((s) => statuses.push(s));
    await guest.joinRoom('KICK01', 'Alice', 1);
    await flush();

    expect(result.current.players.map((p) => p.slotIndex)).toEqual([0, 1]);

    act(() => {
      result.current.toggleCpuSlot(1);
    });
    await flush();

    // Previously the host returned the roster untouched for human players, so the
    // "Kick" button in the lobby was a silent no-op.
    expect(result.current.players.map((p) => p.slotIndex)).toEqual([0]);

    // The removed guest's transport is torn down, so it can no longer roll.
    expect(statuses).toContain('disconnected');
  });

  it('still adds and removes CPU bots', async () => {
    const { result } = renderHook(() => useMultiplayer());
    await act(async () => {
      await result.current.createRoom('Host', 0, 4, 'normal', 'exact', 'CPU001');
    });
    await flush();

    act(() => {
      result.current.toggleCpuSlot(1);
    });
    await flush();
    expect(result.current.players.find((p) => p.slotIndex === 1)?.isCpu).toBe(true);

    act(() => {
      result.current.toggleCpuSlot(1);
    });
    await flush();
    expect(result.current.players.map((p) => p.slotIndex)).toEqual([0]);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Guest lifecycle: lobby rejoin must not jump into the match        */
/* ------------------------------------------------------------------ */

describe('Regression 6: guest rejoin respects lobby vs live match', () => {
  it('stays in the lobby when the host has not started a match', async () => {
    const stub = new HostStub('snkladr-lobby1');
    peerRegistry.set('snkladr-lobby1', stub);

    const onReconnected = vi.fn();
    const hook = renderHook(() => useMultiplayer({ onReconnected }));

    let joinPromise: Promise<void>;
    await act(async () => {
      joinPromise = hook.result.current.joinRoom('LOBBY1', 'Guest', 1);
      await flush();
    });

    // The host answers with a pre-match snapshot (`isPlaying: false`).
    await act(async () => {
      stub.conn!.send({
        type: 'RECONNECT_ACCEPTED',
        requestId: 'req_1',
        slotIndex: 1,
        reconnectToken: 'secret_token_slot_1',
        roomCode: 'LOBBY1',
        speed: 'normal',
        winRule: 'exact',
        players: [
          hostPlayer(),
          {
            playerId: 'p_guest',
            peerId: 'guest_peer',
            name: 'Guest',
            slotIndex: 1,
            colorId: 1,
            isHost: false,
            isCpu: false,
            isReady: true,
          },
        ],
        stateVersion: 3,
        turnId: 1,
        maxPlayers: 4,
        gameState: {
          mode: 'idle',
          pos: [0, 0],
          turn: 0,
          phase: 'idle',
          rolls: [0, 0],
          laddersHit: [0, 0],
          snakesHit: [0, 0],
          sixesHit: [0, 0],
          winner: -1,
          isPlaying: false,
        },
      });
      await flush();
    });
    await act(async () => {
      await joinPromise;
    });

    // Must NOT be force-pushed onto the board, and must NOT be told it reconnected
    // into a live match that does not exist yet.
    expect(hook.result.current.gameStatus).toBe('lobby');
    expect(onReconnected).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('resumes the match when the host reports a live game', async () => {
    const stub = new HostStub('snkladr-live01');
    peerRegistry.set('snkladr-live01', stub);

    const onReconnected = vi.fn();
    const hook = renderHook(() => useMultiplayer({ onReconnected }));

    let joinPromise: Promise<void>;
    await act(async () => {
      joinPromise = hook.result.current.joinRoom('LIVE01', 'Guest', 1);
      await flush();
    });

    await act(async () => {
      stub.conn!.send({
        type: 'RECONNECT_ACCEPTED',
        requestId: 'req_2',
        slotIndex: 1,
        reconnectToken: 'secret_token_slot_1',
        roomCode: 'LIVE01',
        speed: 'fast',
        winRule: 'exact',
        players: [
          hostPlayer(),
          {
            playerId: 'p_guest',
            peerId: 'guest_peer',
            name: 'Guest',
            slotIndex: 1,
            colorId: 1,
            isHost: false,
            isCpu: false,
            isReady: true,
          },
        ],
        stateVersion: 9,
        turnId: 5,
        maxPlayers: 4,
        gameState: {
          mode: 'playing',
          pos: [40, 25],
          turn: 0,
          phase: 'idle',
          rolls: [6, 4],
          laddersHit: [1, 1],
          snakesHit: [0, 1],
          sixesHit: [1, 0],
          winner: -1,
          isPlaying: true,
        },
      });
      await flush();
    });
    await act(async () => {
      await joinPromise;
    });

    expect(hook.result.current.gameStatus).toBe('playing');
    expect(onReconnected).toHaveBeenCalledTimes(1);
    expect(onReconnected.mock.calls[0][3]).toMatchObject({ pos: [40, 25] });

    hook.unmount();
  });
});
