/**
 * @vitest-environment jsdom
 *
 * Regression suite for online roll-path bugs in the game engine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import { useGame, type PlayerConfig } from '../src/game/useGame';
import Die from '../src/components/Die';
import { gameReducer, initialGameState } from '../src/game/gameReducer';

/** Roster using SPARSE slots so dense index != slot index. */
const sparseRoster: PlayerConfig[] = [
  { id: 'p0', slotIndex: 0, name: 'P0', isCpu: false, colorId: 0 },
  { id: 'p2', slotIndex: 2, name: 'P2', isCpu: false, colorId: 2 },
  { id: 'p3', slotIndex: 3, name: 'P3', isCpu: false, colorId: 3 },
];

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Regression 5: authoritative roll resolves the SLOT, not the dense index', () => {
  it('moves the token whose slotIndex the host broadcast, not roster[n]', () => {
    const { result } = renderHook(() => useGame());

    act(() => {
      result.current.startGame(sparseRoster, 'normal', 'exact');
    });
    expect(result.current.hud.turn).toBe(0);

    // The host broadcasts SLOT indexes (ROLL_RESULT.player is a slotIndex).
    // With the buggy `playerIndexOrSlot < players.length` short-circuit, slot 2 was
    // read as roster index 2 => the wrong player (P3) moved instead of P2.
    act(() => {
      result.current.doRemoteRoll(4, 2);
    });

    // roster index 1 IS slot 2 (P2) - only that player's roll counter moves.
    expect(result.current.hud.rolls).toEqual([0, 1, 0]);
    expect(result.current.hud.roll).toBe(4);
  });

  it('still handles slot 0 and unknown slots without crashing', () => {
    const { result } = renderHook(() => useGame());

    act(() => {
      result.current.startGame(sparseRoster, 'normal', 'exact');
    });

    act(() => {
      result.current.doRemoteRoll(3, 0);
    });
    expect(result.current.hud.rolls).toEqual([1, 0, 0]);

    // An unknown slot must not blow up or move anyone unexpectedly.
    expect(() =>
      act(() => {
        result.current.doRemoteRoll(2, 7);
      }),
    ).not.toThrow();
  });
});

describe('Regression 6: guest does not spam the host with roll requests', () => {
  function mountGuest(onLocalRoll: (roll: number, player: number) => void) {
    return renderHook(() =>
      useGame({
        isOnline: true,
        isOnlineMatch: true,
        isHost: false,
        onlineSlot: 0,
        onLocalRoll,
      }),
    );
  }

  it('sends at most one ROLL_REQUEST until the host answers', () => {
    const onLocalRoll = vi.fn();
    const { result } = mountGuest(onLocalRoll);

    act(() => {
      result.current.startGame(sparseRoster, 'normal', 'exact');
    });

    expect(result.current.canRoll).toBe(true);

    act(() => {
      result.current.doRoll();
    });
    expect(onLocalRoll).toHaveBeenCalledTimes(1);

    // Spamming the button must not queue more requests at the host.
    act(() => {
      result.current.doRoll();
      result.current.doRoll();
    });
    expect(onLocalRoll).toHaveBeenCalledTimes(1);
    expect(result.current.canRoll).toBe(false);
    expect(result.current.awaitingRemoteRoll).toBe(true);
  });

  it('re-arms once the host broadcasts the authoritative roll', () => {
    const onLocalRoll = vi.fn();
    const { result } = mountGuest(onLocalRoll);

    act(() => {
      result.current.startGame(sparseRoster, 'normal', 'exact');
    });

    act(() => {
      result.current.doRoll();
    });
    expect(onLocalRoll).toHaveBeenCalledTimes(1);

    // Host answers -> the pending request is satisfied and the button re-arms.
    act(() => {
      result.current.doRemoteRoll(5, 0);
    });
    expect(result.current.awaitingRemoteRoll).toBe(false);
  });

  it('an authoritative checkpoint also clears the pending request', () => {
    const onLocalRoll = vi.fn();
    const { result } = mountGuest(onLocalRoll);

    act(() => {
      result.current.startGame(sparseRoster, 'normal', 'exact');
    });
    act(() => {
      result.current.doRoll();
    });
    expect(result.current.awaitingRemoteRoll).toBe(true);

    act(() => {
      result.current.syncFromCheckpoint({
        mode: 'playing',
        pos: [5, 0, 0],
        turn: 0,
        phase: 'idle',
        rolls: [1, 0, 0],
        laddersHit: [0, 0, 0],
        snakesHit: [0, 0, 0],
        sixesHit: [0, 0, 0],
        winner: -1,
        stateVersion: 99,
        turnId: 7,
      });
    });

    expect(result.current.awaitingRemoteRoll).toBe(false);
    expect(result.current.canRoll).toBe(true);

    // The guest can request its next roll.
    act(() => {
      result.current.doRoll();
    });
    expect(onLocalRoll).toHaveBeenCalledTimes(2);
  });
});

describe('Regression 7: rolling flag self-heal', () => {
  it('canRoll stays consistent with what doRoll actually does', () => {
    const { result } = renderHook(() => useGame());

    act(() => {
      result.current.startGame(sparseRoster, 'normal', 'exact');
    });

    // Local (offline) roll: exactly one roll per turn.
    act(() => {
      result.current.doRoll();
    });
    const rollsAfterFirst = result.current.hud.rolls[0];
    expect(rollsAfterFirst).toBe(1);

    // Rolling again while the animation is in flight must be ignored.
    act(() => {
      result.current.doRoll();
    });
    expect(result.current.hud.rolls[0]).toBe(1);

    // Letting the roll timer fire resolves the turn.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.hud.rolls[0]).toBe(1);
    expect(result.current.hud.rolling).toBe(false);
  });
});

describe('Regression 8: Die landed badge, reducer active-turn cleanup & rule dispatch', () => {
  it('renders ROLLED badge and lucky-six class when rolling transitions from true to false', () => {
    const { container, rerender } = render(
      <Die value={6} rolling={true} onRoll={() => {}} canRoll={false} rollMs={950} />,
    );
    expect(container.textContent).not.toContain('ROLLED 6');

    // When useGame's ROLL_LANDED fires at rollMs, rolling flips to false before Die's internal timer
    rerender(
      <Die value={6} rolling={false} onRoll={() => {}} canRoll={false} rollMs={950} />,
    );
    expect(container.textContent).toContain('ROLLED 6');
    expect(container.textContent).toContain('★ +1');
    expect(container.querySelector('.lucky-six')).not.toBeNull();
  });

  it('dispatches setSpeed and setWinRule through gameReducer cleanly', () => {
    const { result } = renderHook(() => useGame());
    act(() => {
      result.current.startGame(sparseRoster, 'normal', 'exact');
    });
    act(() => {
      result.current.setSpeed('fast');
      result.current.setWinRule('bounce');
    });
    expect(result.current.hud.speed).toBe('fast');
    expect(result.current.hud.winRule).toBe('bounce');
  });

  it('bumps txId and clears roll/targetSquare when the active player is removed via UPDATE_PLAYERS', () => {
    const init = initialGameState();
    const started = gameReducer(init, {
      type: 'START_GAME',
      players: sparseRoster,
      speed: 'normal',
      winRule: 'exact',
    });
    const rolling = gameReducer(started, {
      type: 'START_ROLL',
      player: 0,
      roll: 5,
    });
    expect(rolling.rolling).toBe(true);
    expect(rolling.roll).toBe(5);

    const updated = gameReducer(rolling, {
      type: 'UPDATE_PLAYERS',
      players: sparseRoster.slice(1),
    });
    expect(updated.phase).toBe('idle');
    expect(updated.rolling).toBe(false);
    expect(updated.roll).toBe(0);
    expect(updated.txId).toBeGreaterThan(rolling.txId);
  });
});
