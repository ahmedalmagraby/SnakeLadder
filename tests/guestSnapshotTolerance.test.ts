/**
 * @vitest-environment jsdom
 *
 * Regression: a guest must be able to join even when the host's advisory
 * `gameState` snapshot does not line up with what this build expects.
 *
 * The first version of guest-side packet validation failed the *whole* packet
 * on any validation error, so a single bad `gameState` field in a
 * JOIN_ACCEPTED tore down the connection and left the guest stuck on
 * "Host sent an invalid packet: Invalid gameState snapshot" with no way to
 * join and nothing actionable to act on.
 *
 * `gameState` is only a resume hint - the authoritative board arrives on the
 * next `SYNC_CHECKPOINT` regardless - so an unusable snapshot must be dropped,
 * not fatal.
 */
import { describe, it, expect } from 'vitest';
import {
  validatePacket,
  checkGameStateSnapshot,
  isValidGameStateSnapshot,
} from '../src/game/network/validation';
import { PROTOCOL_VERSION as PV } from '../src/game/network/types';
import { gameReducer, initialGameState } from '../src/game/gameReducer';
import type { CheckpointData, NetworkPlayer } from '../src/game/network/types';

const goodSnapshot = {
  mode: 'playing' as const,
  pos: [12, 30],
  turn: 1,
  phase: 'idle' as const,
  rolls: [4, 2],
  laddersHit: [1, 0],
  snakesHit: [0, 1],
  sixesHit: [0, 1],
  winner: -1,
  isPlaying: true,
};

const players: NetworkPlayer[] = [
  { playerId: 'p0', peerId: 'host', name: 'Host', slotIndex: 0, colorId: 0, isHost: true, isCpu: false, isReady: true },
  { playerId: 'p1', peerId: 'peer_g', name: 'Guest', slotIndex: 1, colorId: 1, isHost: false, isCpu: false, isReady: true },
];

function joinAccepted(gameState: unknown) {
  return {
    type: 'JOIN_ACCEPTED' as const,
    requestId: 'req_1',
    slotIndex: 1,
    reconnectToken: 'a'.repeat(32),
    roomCode: 'ABC234',
    speed: 'normal' as const,
    winRule: 'exact' as const,
    players,
    stateVersion: 2,
    turnId: 1,
    maxPlayers: 4,
    v: PV,
    gameState,
  };
}

describe('an unusable advisory snapshot is dropped, not fatal', () => {
  it('a good snapshot passes in both modes', () => {
    expect(isValidGameStateSnapshot(goodSnapshot)).toBe(true);
    const strict = validatePacket(joinAccepted(goodSnapshot));
    const lenient = validatePacket(joinAccepted(goodSnapshot), { lenientGameState: true });
    expect(strict.valid).toBe(true);
    expect(lenient.valid).toBe(true);
    expect(lenient.droppedGameStateField).toBeUndefined();
  });

  // A genuine own `__proto__` key. Note `{ __proto__: x }` in an object
  // literal sets the *prototype* rather than creating an own property, so it
  // would sail through `hasOwnProperty` and prove nothing.
  const polluted = { ...goodSnapshot } as Record<string, unknown>;
  Object.defineProperty(polluted, '__proto__', {
    value: { polluted: true },
    enumerable: true,
    writable: true,
    configurable: true,
  });

  // Each of these is a snapshot a *plausible* host could emit that this build
  // cannot use. None of them may prevent a guest from joining.
  const badSnapshots: [string, unknown, string][] = [
    ['turn out of range', { ...goodSnapshot, turn: 9 }, 'turn'],
    ['winner out of range', { ...goodSnapshot, winner: 7 }, 'winner'],
    ['unknown phase', { ...goodSnapshot, phase: 'teleporting' }, 'phase'],
    ['unknown mode', { ...goodSnapshot, mode: 'lobby' }, 'mode'],
    ['pos holds a non-integer', { ...goodSnapshot, pos: [12.5, 30] }, 'pos'],
    ['pos out of board range', { ...goodSnapshot, pos: [140, 30] }, 'pos'],
    ['pos not an array', { ...goodSnapshot, pos: 'twelve' }, 'pos'],
    ['sixesHit not an array', { ...goodSnapshot, sixesHit: null }, 'sixesHit'],
    ['rolls holds a string', { ...goodSnapshot, rolls: ['4', '2'] }, 'rolls'],
    ['isPlaying not boolean', { ...goodSnapshot, isPlaying: 'yes' }, 'isPlaying'],
    ['a prototype-pollution key', polluted, 'prototype-pollution'],
  ];

  for (const [label, snapshot, expectedField] of badSnapshots) {
    it(`lenient mode still admits the guest when the snapshot has ${label}`, () => {
      const res = validatePacket(joinAccepted(snapshot), { lenientGameState: true });
      expect(res.valid, `${label} should not block a join`).toBe(true);
      expect(res.packet?.type).toBe('JOIN_ACCEPTED');
      // The snapshot is stripped so nothing downstream dereferences garbage.
      expect(res.packet && 'gameState' in res.packet ? res.packet.gameState : undefined).toBeUndefined();
      // ...and the offending field is named, so the warning is actionable.
      expect(res.droppedGameStateField).toBe(expectedField);
    });
  }

  it('strict mode still fails closed, and names the field', () => {
    const res = validatePacket(joinAccepted({ ...goodSnapshot, turn: 9 }));
    expect(res.valid).toBe(false);
    expect(res.error).toContain('turn');
  });

  it('checkGameStateSnapshot pinpoints each defect', () => {
    expect(checkGameStateSnapshot(goodSnapshot)).toBeNull();
    expect(checkGameStateSnapshot({ ...goodSnapshot, turn: 9 })).toBe('turn');
    expect(checkGameStateSnapshot({ ...goodSnapshot, phase: 'nope' })).toBe('phase');
    expect(checkGameStateSnapshot('not an object')).toBe('not-an-object');
  });
});

describe('a width-mismatched checkpoint is repaired, not discarded', () => {
  const base = initialGameState();

  function cp(over: Partial<CheckpointData>): CheckpointData {
    return {
      mode: 'playing',
      pos: [10, 20],
      turn: 0,
      phase: 'idle',
      rolls: [1, 2],
      laddersHit: [0, 0],
      snakesHit: [0, 0],
      sixesHit: [0, 0],
      winner: -1,
      stateVersion: base.stateVersion + 1,
      ...over,
    } as CheckpointData;
  }

  it('applies a checkpoint whose pos is longer than the roster', () => {
    const started = gameReducer(base, { type: 'START_GAME', players: players.map((p, i) => ({
      id: `p${i}`, slotIndex: i, name: p.name, isCpu: false, colorId: p.colorId,
    })) });
    const applied = gameReducer(started, {
      type: 'APPLY_CHECKPOINT',
      checkpoint: cp({ pos: [10, 20, 30, 40], rolls: [1, 2, 3, 4], turn: 3 }),
    });
    // Repaired to the local roster width, not dropped.
    expect(applied.pos).toEqual([10, 20]);
    expect(applied.turn).toBe(1);
    expect(applied.rolls).toEqual([1, 2]);
    expect(applied.txId).toBeGreaterThan(started.txId);
  });

  it('applies a checkpoint whose pos is shorter than the roster', () => {
    const started = gameReducer(base, { type: 'START_GAME', players: players.map((p, i) => ({
      id: `p${i}`, slotIndex: i, name: p.name, isCpu: false, colorId: p.colorId,
    })) });
    const applied = gameReducer(started, {
      type: 'APPLY_CHECKPOINT',
      checkpoint: cp({ pos: [10], turn: 0 }),
    });
    // Padded, so no index reads `undefined` and no token gets NaN coords.
    expect(applied.pos).toEqual([10, 0]);
    expect(applied.pos.every((x) => Number.isFinite(x))).toBe(true);
  });

  it('still refuses genuinely unusable input', () => {
    const started = gameReducer(base, { type: 'START_GAME', players: players.map((p, i) => ({
      id: `p${i}`, slotIndex: i, name: p.name, isCpu: false, colorId: p.colorId,
    })) });
    for (const bad of [{ pos: [] }, { pos: 'x' }, { pos: [NaN, 1] }, { pos: [1e9, 1] }]) {
      const applied = gameReducer(started, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: cp(bad as Partial<CheckpointData>),
      });
      expect(applied, JSON.stringify(bad)).toBe(started);
    }
  });
});
