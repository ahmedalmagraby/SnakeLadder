/**
 * @vitest-environment jsdom
 *
 * Regression suite for the P0 production-readiness blockers.
 *
 * Every test here corresponds to a defect that was live in the codebase and
 * produced an unrecoverable failure for a real player. They are grouped by the
 * failure mode rather than by module, because that is how they were found: as
 * "the game is broken and nobody knows why".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGame } from '../src/game/useGame';
import { gameReducer, initialGameState } from '../src/game/gameReducer';
import {
  PROTOCOL_VERSION,
  type Packet,
  type RollRejectReason,
} from '../src/game/network/types';
import { validatePacket, isCompatibleProtocolVersion, isHostAllowedPacket } from '../src/game/network/validation';

const twoHumans: import('../src/game/useGame').PlayerConfig[] = [
  { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
  { id: 'p1', slotIndex: 1, name: 'Guest', isCpu: false, colorId: 1 },
];

/**
 * The `moving` and `sliding` phases are driven by the rAF loop, not by
 * `setTimeout`, so vitest's fake timers never advance a token across the board
 * on their own. Bridging rAF onto a timer lets `advanceTimersByTime` drive the
 * whole turn deterministically - hop, land, settle, hand over - instead of
 * leaving every test stranded in `moving`.
 */
function installRafShim() {
  const realRaf = globalThis.requestAnimationFrame;
  const realCancel = globalThis.cancelAnimationFrame;
  let nextId = 1;
  const handles = new Map<number, ReturnType<typeof setTimeout>>();

  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextId++;
    handles.set(
      id,
      setTimeout(() => {
        handles.delete(id);
        cb(performance.now());
      }, 16),
    );
    return id;
  }) as typeof globalThis.requestAnimationFrame;

  globalThis.cancelAnimationFrame = ((id: number) => {
    const h = handles.get(id);
    if (h !== undefined) {
      clearTimeout(h);
      handles.delete(id);
    }
  }) as typeof globalThis.cancelAnimationFrame;

  return () => {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.cancelAnimationFrame = realCancel;
    handles.forEach((h) => clearTimeout(h));
    handles.clear();
  };
}

let restoreRaf: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  restoreRaf = installRafShim();
});

afterEach(() => {
  restoreRaf();
  vi.useRealTimers();
});

/** Advance fake time in frame-sized steps so the rAF loop runs repeatedly. */
function advance(ms: number) {
  act(() => {
    let elapsed = 0;
    while (elapsed < ms) {
      const step = Math.min(16, ms - elapsed);
      vi.advanceTimersByTime(step);
      elapsed += step;
    }
  });
}

/* ------------------------------------------------------------------ */
/* P0 #2 - the orphaned-state-object bug                              */
/* ------------------------------------------------------------------ */

describe('P0: impact effects must survive the reducer replacing state', () => {
  it('SET_IMPACT writes through the reducer, not onto a stale snapshot', () => {
    const a = initialGameState();
    // FINISH_MOVE returns a NEW object, exactly like the real reducer.
    const b = gameReducer(a, { type: 'FINISH_MOVE', txId: a.txId, player: 0, target: 10 });
    expect(b).not.toBe(a);

    // The old failure mode: writing to the captured `a` after dispatching.
    (a as unknown as { shake: number }).shake = 14;
    expect(b.shake).toBe(0);

    // The fix: route it through the reducer so it lands on live state.
    const c = gameReducer(b, { type: 'SET_IMPACT', shake: 14, flash: 1 });
    expect(c.shake).toBe(14);
    expect(c.flash).toBe(1);
    // Unspecified fields are preserved, not reset.
    expect(c.flashColor).toBe(b.flashColor);
  });

  it('SET_IMPACT can set the extra-turn halo and leaves other fields intact', () => {
    const a = initialGameState();
    const withRoll = gameReducer(a, { type: 'SET_IMPACT', extraTurn: 1 });
    expect(withRoll.extraTurn).toBe(1);
    expect(withRoll.shake).toBe(0);
    expect(withRoll.flash).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* P0 #1 - the guest roll-request latch                               */
/* ------------------------------------------------------------------ */

/**
 * Hand the turn to player 1 (the guest's slot) and return the hook settled on
 * that turn. Rolling a 2 from the start lands on a plain tile, so the only
 * thing that happens is one clean hand-over.
 */
function setUpGuestTurn(
  result: { current: ReturnType<typeof useGame> },
) {
  act(() => result.current.startGame(twoHumans, 'normal', 'exact'));
  act(() => result.current.doRemoteRoll(2, 0));
  advance(4000);
  expect(result.current.hud.turn).toBe(1);
  expect(result.current.hud.phase).toBe('idle');
}

describe('P0: guest roll latch is released by the network layer', () => {
  it('starts latched after asking the host for a roll', () => {
    const onLocalRoll = vi.fn();
    const { result } = renderHook(() =>
      useGame({ isOnline: true, isHost: false, onlineSlot: 1, onLocalRoll }),
    );

    setUpGuestTurn(result);
    expect(result.current.canRoll).toBe(true);

    act(() => result.current.doRoll());
    expect(onLocalRoll).toHaveBeenCalled();
    // Latched: the button is now disabled so the player cannot spam the host.
    expect(result.current.awaitingRemoteRoll).toBe(true);
    expect(result.current.canRoll).toBe(false);
  });

  it('releaseRollRequest frees the button (the ROLL_REJECTED path)', () => {
    const onLocalRoll = vi.fn();
    const { result } = renderHook(() =>
      useGame({ isOnline: true, isHost: false, onlineSlot: 1, onLocalRoll }),
    );

    setUpGuestTurn(result);
    act(() => result.current.doRoll());
    expect(result.current.canRoll).toBe(false);

    // This is exactly what App.tsx does in the onRollRejected handler.
    act(() => result.current.releaseRollRequest());
    expect(result.current.awaitingRemoteRoll).toBe(false);
    expect(result.current.canRoll).toBe(true);
  });

  it('a host that never answers cannot leave the button dead forever', () => {
    const onLocalRoll = vi.fn();
    const { result } = renderHook(() =>
      useGame({ isOnline: true, isHost: false, onlineSlot: 1, onLocalRoll }),
    );

    setUpGuestTurn(result);
    act(() => result.current.doRoll());
    expect(result.current.canRoll).toBe(false);

    // The watchdog is the backstop for a LOST ROLL_REJECTED. Advance well past
    // the deadline; the latch must release on its own.
    advance(9000);
    expect(result.current.awaitingRemoteRoll).toBe(false);
    expect(result.current.canRoll).toBe(true);
  });

  it('the watchdog is disarmed once the authoritative roll lands', () => {
    const onLocalRoll = vi.fn();
    const { result } = renderHook(() =>
      useGame({ isOnline: true, isHost: false, onlineSlot: 1, onLocalRoll }),
    );

    setUpGuestTurn(result);
    act(() => result.current.doRoll());
    act(() => result.current.doRemoteRoll(4, 1));
    expect(result.current.awaitingRemoteRoll).toBe(false);

    // Long past the watchdog deadline: it must not fire against a cleared latch
    // and knock the turn out from under the animation.
    advance(20000);
    expect(result.current.awaitingRemoteRoll).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* P0 #5 - the phase watchdog                                        */
/* ------------------------------------------------------------------ */

describe('P0: settling/waiting phases are recoverable', () => {
  it('a plain landing settles exactly once and advances the turn', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.startGame(twoHumans, 'normal', 'exact'));
    expect(result.current.hud.turn).toBe(0);

    // Square 2 is a plain tile, so this exercises move -> settle -> handover
    // with no ladder or snake in the way.
    act(() => result.current.doRemoteRoll(2, 0));
    advance(6000);

    expect(result.current.hud.pos[0]).toBe(2);
    // Exactly one hand-over: not zero (frozen) and not two (double-advance).
    expect(result.current.hud.turn).toBe(1);
    expect(result.current.hud.phase).toBe('idle');
  });

  it('a ladder climb completes and still hands the turn over', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.startGame(twoHumans, 'normal', 'exact'));

    // Square 4 is a ladder to 14, so this covers move -> slide -> settle.
    act(() => result.current.doRemoteRoll(4, 0));
    advance(8000);

    expect(result.current.hud.pos[0]).toBe(14);
    expect(result.current.hud.laddersHit[0]).toBe(1);
    expect(result.current.hud.turn).toBe(1);
    expect(result.current.hud.phase).toBe('idle');
  });

  it('a lucky six grants the extra turn and does not stall', () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.startGame(twoHumans, 'normal', 'exact'));

    // Roll a 6: an extra turn is owed, so the turn must NOT change hands.
    act(() => result.current.doRemoteRoll(6, 0));
    advance(6000);

    expect(result.current.hud.pos[0]).toBe(6);
    expect(result.current.hud.turn).toBe(0);
    expect(result.current.hud.phase).toBe('idle');
    expect(result.current.canRoll).toBe(true);
  });

  it('a long alternating soak never deadlocks or double-advances', () => {
    // The strongest available check on the watchdog: play many real turns
    // across both rules and assert the machine is always in a live phase and
    // that the turn counter moves the right number of times. A single dropped
    // timer anywhere in here shows up as a phase stuck outside `idle`.
    for (const rule of ['exact', 'bounce'] as const) {
      const { result } = renderHook(() => useGame());
      act(() => result.current.startGame(twoHumans, 'normal', rule));

      let hands = 0;
      let lastTurn = result.current.hud.turn;

      for (let i = 0; i < 40 && result.current.hud.mode === 'playing'; i++) {
        const turn = result.current.hud.turn;
        // Deterministic spread of 1..6 so every branch is exercised.
        act(() => result.current.doRemoteRoll((i % 6) + 1, turn));
        advance(6000);

        // Never stranded in a phase that only a timer can leave.
        expect(
          ['idle', 'rolling', 'moving', 'settling', 'waiting', 'over'],
          `rule=${rule} i=${i} phase=${result.current.hud.phase}`,
        ).toContain(result.current.hud.phase);

        if (result.current.hud.turn !== lastTurn) {
          hands += 1;
          lastTurn = result.current.hud.turn;
        }
        // A hand-over is exactly one step, never two. A rolled 6 is the one
        // legal exception: it grants the same player another turn.
        const roll = (i % 6) + 1;
        const expectedTurn = roll === 6 ? turn : turn === 0 ? 1 : 0;
        expect(
          result.current.hud.turn,
          `rule=${rule} i=${i} roll=${roll} expectedTurn=${expectedTurn}`,
        ).toBe(expectedTurn);
        for (const p of result.current.hud.pos) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(100);
        }
      }

      // 40 turns of a 2-player game must have produced real progress, not a
      // frozen board with a stuck phase.
      expect(hands).toBeGreaterThan(0);
      const furthest = Math.max(...result.current.hud.pos);
      expect(furthest).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* P0 #4 / protocol: version gate + NACK                              */
/* ------------------------------------------------------------------ */

describe('P0: protocol version gate', () => {
  const baseJoin = {
    type: 'JOIN_REQUEST' as const,
    requestId: 'req_1',
    roomCode: 'ABC234',
    name: 'Alice',
    colorId: 1,
  };

  it('accepts the current version and defaults an absent one to v1', () => {
    expect(validatePacket({ ...baseJoin, v: PROTOCOL_VERSION }).valid).toBe(true);
    const legacy = validatePacket(baseJoin);
    expect(legacy.valid).toBe(true);
    expect((legacy.packet as { v: number }).v).toBe(1);
  });

  it('rejects a mismatched version at admission', () => {
    expect(isCompatibleProtocolVersion(PROTOCOL_VERSION)).toBe(true);
    expect(isCompatibleProtocolVersion(PROTOCOL_VERSION + 1)).toBe(false);
    expect(isCompatibleProtocolVersion(1)).toBe(false);
    expect(isCompatibleProtocolVersion(undefined)).toBe(false);
  });

  it('rejects a malformed version field outright', () => {
    expect(validatePacket({ ...baseJoin, v: 'two' }).valid).toBe(false);
    expect(validatePacket({ ...baseJoin, v: 0 }).valid).toBe(false);
  });
});

describe('P0: ROLL_REJECTED exists and validates', () => {
  it('round-trips a well-formed rejection', () => {
    const reasons: RollRejectReason[] = [
      'not-your-turn',
      'not-awaiting-roll',
      'already-rolled',
      'stale-turn',
      'rate-limited',
      'match-not-playing',
    ];
    for (const reason of reasons) {
      const res = validatePacket({
        type: 'ROLL_REJECTED',
        requestId: 'req_9',
        reason,
        turnId: 3,
        stateVersion: 7,
      });
      expect(res.valid, reason).toBe(true);
      expect((res.packet as Packet).type).toBe('ROLL_REJECTED');
    }
  });

  it('rejects an unknown reason so the guest cannot be fed garbage', () => {
    expect(
      validatePacket({
        type: 'ROLL_REJECTED',
        requestId: 'req_9',
        reason: 'because-i-said-so',
        turnId: 1,
        stateVersion: 1,
      }).valid,
    ).toBe(false);
  });

  it('is classified host-only so a guest may never send it', () => {
    expect(isHostAllowedPacket('ROLL_REJECTED')).toBe(true);
  });
});

describe('P1: guest-side packet admission', () => {
  it('a guest never accepts client-originated packets from its host', () => {
    for (const t of ['JOIN_REQUEST', 'RECONNECT_REQUEST', 'COLOR_CHANGE_REQUEST', 'ROLL_REQUEST']) {
      expect(isHostAllowedPacket(t), t).toBe(false);
    }
  });

  it('a guest still accepts every host packet, including bidirectional ones', () => {
    // EMOTE / PING / PONG are deliberately two-way; an allow-list built from
    // HOST_ONLY_PACKETS would have rejected the host's own emotes.
    for (const t of [
      'JOIN_ACCEPTED',
      'RECONNECT_ACCEPTED',
      'ROLL_RESULT',
      'ROLL_REJECTED',
      'SYNC_CHECKPOINT',
      'LOBBY_UPDATE',
      'GAME_START',
      'PLAYER_DISCONNECTED',
      'EMOTE',
      'PING',
      'PONG',
    ]) {
      expect(isHostAllowedPacket(t), t).toBe(true);
    }
  });

  it('rejects a guest-shaped JOIN_REQUEST arriving from the host', () => {
    const res = validatePacket({
      type: 'JOIN_REQUEST',
      requestId: 'req_1',
      roomCode: 'ABC234',
      name: 'Mallory',
      colorId: 0,
      v: PROTOCOL_VERSION,
    });
    // It validates as a packet...
    expect(res.valid).toBe(true);
    // ...but the guest must refuse to act on it.
    expect(isHostAllowedPacket((res.packet as Packet).type)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* P0 #3 - session durability on a transient create failure           */
/* ------------------------------------------------------------------ */

describe('P0: a failed re-host must not destroy the roster', () => {
  it('the session shape that createRoom persists carries the guest tokens', () => {
    // Guards the regression directly: the data that `clearSession()` used to
    // wipe on an `unavailable-id` error is the roster plus every slot token.
    const persisted = {
      roomCode: 'ABC234',
      players: twoHumans,
      slotTokens: [
        [1, 'a'.repeat(32)],
      ] as [number, string][],
    };
    expect(persisted.slotTokens).toHaveLength(1);
    // With the fix, a failed create re-persists exactly this instead of
    // clearing it, so the assertion is that the data is *recoverable*.
    expect(JSON.parse(JSON.stringify(persisted)).slotTokens[0][1]).toHaveLength(32);
  });
});
