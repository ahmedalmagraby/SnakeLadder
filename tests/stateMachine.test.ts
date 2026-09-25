import { describe, it, expect, beforeEach } from 'vitest';
import {
  gameReducer,
  initialGameState,
  canApplyCheckpoint,
  isStablePhase,
  isNonStablePhase,
  isTerminalCheckpoint,
  type GameState,
  type CheckpointData,
  type Phase,
} from '../src/game/gameReducer';

describe('Authoritative Reducer & State Machine', () => {
  let baseState: GameState;

  beforeEach(() => {
    baseState = gameReducer(initialGameState(), {
      type: 'START_GAME',
      speed: 'normal',
      winRule: 'exact',
    });
  });

  describe('1. Remote Winner Synchronization', () => {
    it('sets mode and phase to over and records remote winner', () => {
      const winnerCheckpoint: CheckpointData = {
        mode: 'over',
        pos: [50, 100],
        turn: 1,
        phase: 'over',
        rolls: [8, 9],
        laddersHit: [1, 2],
        snakesHit: [0, 0],
        sixesHit: [1, 3],
        winner: 1,
        stateVersion: 20,
        turnId: 10,
      };

      const nextState = gameReducer(baseState, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: winnerCheckpoint,
      });

      expect(nextState.mode).toBe('over');
      expect(nextState.phase).toBe('over');
      expect(nextState.winner).toBe(1);
      expect(nextState.pos).toEqual([50, 100]);
      expect(nextState.stateVersion).toBe(20);
    });

    it('clears rolling, moving, and sliding states when applying a terminal checkpoint', () => {
      // Simulate state with active animations mid-move
      const animatingState: GameState = {
        ...baseState,
        phase: 'moving',
        rolling: true,
        roll: 5,
        targetSquare: 80,
        moving: {
          player: 0,
          steps: [{ x: 10, y: 20 }],
          idx: 0,
          t0: 1000,
          base: 40,
          finalRoll: 5,
          finalTarget: 80,
        },
        sliding: {
          player: 0,
          pts: [{ x: 10, y: 20 }],
          cum: [0, 10],
          total: 10,
          t0: 1000,
          dur: 500,
          kind: 'snake',
          from: 80,
          to: 20,
          roll: 5,
        },
      };

      const terminalCheckpoint: CheckpointData = {
        mode: 'over',
        pos: [40, 100],
        turn: 1,
        phase: 'over',
        rolls: [6, 7],
        laddersHit: [0, 1],
        snakesHit: [1, 0],
        sixesHit: [0, 2],
        winner: 1,
        stateVersion: 25,
      };

      const nextState = gameReducer(animatingState, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: terminalCheckpoint,
      });

      // Requirement 8: Clear rolling/moving/sliding state when applying a terminal checkpoint
      expect(nextState.mode).toBe('over');
      expect(nextState.phase).toBe('over');
      expect(nextState.winner).toBe(1);
      expect(nextState.rolling).toBe(false);
      expect(nextState.roll).toBe(0);
      expect(nextState.moving).toBeNull();
      expect(nextState.sliding).toBeNull();
      expect(nextState.targetSquare).toBeUndefined();
      expect(nextState.txId).toBeGreaterThan(animatingState.txId);
    });
  });

  describe('2. Reconnect During Every Phase', () => {
    const allPhases: Phase[] = [
      'idle',
      'rolling',
      'moving',
      'sliding',
      'settling',
      'waiting',
      'over',
    ];

    it.each(allPhases)(
      'safely reconnects from non-terminal state when phase is %s, restoring stable idle phase',
      (phase) => {
        // Setup initial client state in the given phase
        const activeState: GameState = {
          ...baseState,
          phase,
          rolling: phase === 'rolling',
          roll: phase === 'rolling' ? 4 : 0,
          moving:
            phase === 'moving'
              ? {
                  player: 0,
                  steps: [{ x: 5, y: 10 }],
                  idx: 0,
                  t0: 100,
                  base: 10,
                  finalRoll: 3,
                  finalTarget: 13,
                }
              : null,
          sliding:
            phase === 'sliding'
              ? {
                  player: 0,
                  pts: [{ x: 5, y: 10 }],
                  cum: [0, 5],
                  total: 5,
                  t0: 100,
                  dur: 400,
                  kind: 'ladder',
                  from: 13,
                  to: 35,
                  roll: 3,
                }
              : null,
        };

        const reconnectedCheckpoint: CheckpointData = {
          mode: 'playing',
          pos: [35, 20],
          turn: 1,
          phase: 'idle',
          rolls: [4, 3],
          laddersHit: [1, 0],
          snakesHit: [0, 0],
          sixesHit: [0, 0],
          winner: -1,
          stateVersion: 14,
        };

        const reconnected = gameReducer(activeState, {
          type: 'RECONNECT',
          players: baseState.players,
          speed: 'normal',
          winRule: 'exact',
          checkpoint: reconnectedCheckpoint,
        });

        // Requirement 9: Reconnect only from stable idle/over states
        expect(reconnected.phase).toBe('idle');
        expect(reconnected.mode).toBe('playing');
        expect(reconnected.rolling).toBe(false);
        expect(reconnected.roll).toBe(0);
        expect(reconnected.moving).toBeNull();
        expect(reconnected.sliding).toBeNull();
        expect(reconnected.pos).toEqual([35, 20]);
        expect(reconnected.turn).toBe(1);
        expect(reconnected.txId).toBeGreaterThan(activeState.txId);
      },
    );

    it('safely reconnects when match was won (terminal state), restoring stable over phase', () => {
      const overCheckpoint: CheckpointData = {
        mode: 'over',
        pos: [100, 45],
        turn: 0,
        phase: 'over',
        rolls: [12, 10],
        laddersHit: [2, 1],
        snakesHit: [1, 2],
        sixesHit: [3, 1],
        winner: 0,
        stateVersion: 30,
      };

      const reconnected = gameReducer(baseState, {
        type: 'RECONNECT',
        players: baseState.players,
        speed: 'normal',
        winRule: 'exact',
        checkpoint: overCheckpoint,
      });

      expect(reconnected.phase).toBe('over');
      expect(reconnected.mode).toBe('over');
      expect(reconnected.winner).toBe(0);
      expect(reconnected.pos).toEqual([100, 45]);
      expect(reconnected.moving).toBeNull();
      expect(reconnected.sliding).toBeNull();
      expect(reconnected.rolling).toBe(false);
    });
  });

  describe('3. Stale Settling Timer Rejection', () => {
    it('rejects stale settle timer callback when transaction ID has advanced', () => {
      const settleTxId = baseState.txId;

      // Start settling phase on square 45
      const settlingState = gameReducer(baseState, {
        type: 'START_SETTLING',
        txId: settleTxId,
        player: 0,
      });
      expect(settlingState.phase).toBe('settling');

      // Now simulate a turn switch that advances txId and supersedes local state
      const supersededState = gameReducer(settlingState, {
        type: 'SWITCH_TURN',
        fromPlayer: 0,
      });

      expect(supersededState.txId).toBeGreaterThan(settleTxId);
      expect(supersededState.phase).toBe('idle');

      // Stale timer callback triggers with the OLD settleTxId
      const result = gameReducer(supersededState, {
        type: 'SETTLE_COMPLETE',
        txId: settleTxId, // Stale!
        expectedPhase: 'settling',
        player: 0,
        roll: 4,
      });

      // State MUST be completely unchanged (rejected)
      expect(result).toBe(supersededState);
      expect(result.phase).toBe('idle');
      expect(result.turn).toBe(1);
    });

    it('rejects stale settle timer callback when terminal checkpoint supersedes settling phase', () => {
      const settleTxId = baseState.txId;

      const settlingState = gameReducer(baseState, {
        type: 'START_SETTLING',
        txId: settleTxId,
        player: 0,
      });

      // Terminal checkpoint arrives from remote host (player 1 won)
      const terminalCheckpoint: CheckpointData = {
        mode: 'over',
        pos: [55, 100],
        turn: 1,
        phase: 'over',
        rolls: [3, 2],
        laddersHit: [0, 0],
        snakesHit: [0, 0],
        sixesHit: [0, 0],
        winner: 1,
        stateVersion: baseState.stateVersion + 1,
      };

      const gameOverState = gameReducer(settlingState, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: terminalCheckpoint,
      });

      expect(gameOverState.txId).toBeGreaterThan(settleTxId);
      expect(gameOverState.phase).toBe('over');
      expect(gameOverState.mode).toBe('over');
      expect(gameOverState.winner).toBe(1);

      // Stale settle timer fires now
      const result = gameReducer(gameOverState, {
        type: 'SETTLE_COMPLETE',
        txId: settleTxId,
        expectedPhase: 'settling',
        player: 0,
        roll: 4,
      });

      // Timer rejected: game remains over, winner 1 preserved
      expect(result).toBe(gameOverState);
      expect(result.phase).toBe('over');
      expect(result.winner).toBe(1);
    });

    it('rejects settle timer callback if current phase does not match expected settling phase', () => {
      const currentTxId = baseState.txId;

      // Attempt to fire SETTLE_COMPLETE when phase is idle
      const result = gameReducer(baseState, {
        type: 'SETTLE_COMPLETE',
        txId: currentTxId,
        expectedPhase: 'settling', // Mismatch with baseState.phase ('idle')
        player: 0,
        roll: 3,
      });

      expect(result).toBe(baseState);
    });
  });

  describe('4. Stale Lucky-Six Waiting Timer Rejection', () => {
    it('rejects stale lucky-six wait timer when transaction ID has advanced', () => {
      const waitTxId = baseState.txId;

      // Enter lucky-six waiting phase
      const waitingState = gameReducer(baseState, {
        type: 'START_LUCKY_SIX_WAIT',
        txId: waitTxId,
        player: 0,
      });
      expect(waitingState.phase).toBe('waiting');
      expect(waitingState.sixesHit[0]).toBe(1);

      // Local state is superseded (e.g. switch turn or restart or checkpoint)
      const supersededState = gameReducer(waitingState, {
        type: 'SWITCH_TURN',
        fromPlayer: 0,
      });
      expect(supersededState.txId).toBeGreaterThan(waitTxId);
      expect(supersededState.phase).toBe('idle');
      expect(supersededState.turn).toBe(1);

      // Stale timer attempts to finish lucky-six wait
      const result = gameReducer(supersededState, {
        type: 'FINISH_LUCKY_SIX_WAIT',
        txId: waitTxId, // Stale!
        expectedPhase: 'waiting',
        player: 0,
      });

      // Must be rejected
      expect(result).toBe(supersededState);
      expect(result.turn).toBe(1); // Did not steal turn back
    });

    it('rejects lucky-six wait timer if current phase is not waiting', () => {
      const result = gameReducer(baseState, {
        type: 'FINISH_LUCKY_SIX_WAIT',
        txId: baseState.txId,
        expectedPhase: 'waiting',
        player: 0,
      });

      expect(result).toBe(baseState);
    });
  });

  describe('5. Duplicate Checkpoint Rejection', () => {
    it('detects duplicate checkpoint with identical stateVersion and rejects it', () => {
      const initialCp: CheckpointData = {
        mode: 'playing',
        pos: [20, 15],
        turn: 0,
        phase: 'idle',
        rolls: [2, 1],
        laddersHit: [0, 0],
        snakesHit: [0, 0],
        sixesHit: [0, 0],
        winner: -1,
        stateVersion: 10,
      };

      const stateV10 = gameReducer(baseState, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: initialCp,
      });
      expect(stateV10.stateVersion).toBe(10);
      expect(stateV10.pos).toEqual([20, 15]);

      // Guard check
      const check = canApplyCheckpoint(stateV10, initialCp);
      expect(check.canApply).toBe(false);
      expect(check.reason).toBe('duplicate');

      // Applying duplicate to reducer returns existing state reference
      const result = gameReducer(stateV10, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: initialCp,
      });

      expect(result).toBe(stateV10);
    });
  });

  describe('6. Out-of-Order State Version Rejection', () => {
    it('rejects older checkpoint arriving after a newer stateVersion has been applied', () => {
      const newerCp: CheckpointData = {
        mode: 'playing',
        pos: [40, 35],
        turn: 1,
        phase: 'idle',
        rolls: [5, 4],
        laddersHit: [1, 0],
        snakesHit: [0, 1],
        sixesHit: [0, 0],
        winner: -1,
        stateVersion: 15,
      };

      const stateV15 = gameReducer(baseState, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: newerCp,
      });
      expect(stateV15.stateVersion).toBe(15);

      // Delayed packet with stateVersion 11 arrives
      const olderCp: CheckpointData = {
        mode: 'playing',
        pos: [25, 20],
        turn: 0,
        phase: 'idle',
        rolls: [3, 2],
        laddersHit: [0, 0],
        snakesHit: [0, 0],
        sixesHit: [0, 0],
        winner: -1,
        stateVersion: 11,
      };

      const check = canApplyCheckpoint(stateV15, olderCp);
      expect(check.canApply).toBe(false);
      expect(check.reason).toBe('stale');

      const result = gameReducer(stateV15, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: olderCp,
      });

      // Older checkpoint is discarded; newer state is preserved
      expect(result).toBe(stateV15);
      expect(result.pos).toEqual([40, 35]);
      expect(result.stateVersion).toBe(15);
    });
  });

  describe('7. Checkpoint Deferral During Non-Stable Phases (Requirement 4)', () => {
    const nonStablePhases: Phase[] = [
      'rolling',
      'moving',
      'sliding',
      'settling',
      'waiting',
    ];

    it.each(nonStablePhases)(
      'defers or rejects non-terminal checkpoint when local phase is %s',
      (phase) => {
        const activeState: GameState = {
          ...baseState,
          phase,
          stateVersion: 5,
        };

        const incomingCheckpoint: CheckpointData = {
          mode: 'playing',
          pos: [30, 25],
          turn: 1,
          phase: 'idle',
          rolls: [4, 3],
          laddersHit: [0, 0],
          snakesHit: [0, 0],
          sixesHit: [0, 0],
          winner: -1,
          stateVersion: 8,
        };

        // canApplyCheckpoint must return false with reason non_stable
        const check = canApplyCheckpoint(activeState, incomingCheckpoint);
        expect(check.canApply).toBe(false);
        expect(check.reason).toBe('non_stable');

        // Reducer will refuse to apply a non-terminal checkpoint during non-stable phase
        const result = gameReducer(activeState, {
          type: 'APPLY_CHECKPOINT',
          checkpoint: incomingCheckpoint,
        });

        expect(result).toBe(activeState);
        expect(result.phase).toBe(phase);
      },
    );

    it('immediately permits terminal (winner) checkpoint even during non-stable phases', () => {
      const settlingState: GameState = {
        ...baseState,
        phase: 'settling',
        stateVersion: 5,
      };

      const terminalCheckpoint: CheckpointData = {
        mode: 'over',
        pos: [100, 25],
        turn: 0,
        phase: 'over',
        rolls: [10, 8],
        laddersHit: [1, 0],
        snakesHit: [0, 0],
        sixesHit: [1, 0],
        winner: 0,
        stateVersion: 9,
      };

      const check = canApplyCheckpoint(settlingState, terminalCheckpoint);
      expect(check.canApply).toBe(true);

      const result = gameReducer(settlingState, {
        type: 'APPLY_CHECKPOINT',
        checkpoint: terminalCheckpoint,
      });

      expect(result.mode).toBe('over');
      expect(result.phase).toBe('over');
      expect(result.winner).toBe(0);
    });
  });

  describe('8. Phase Helper Functions', () => {
    it('correctly classifies stable vs non-stable phases', () => {
      expect(isStablePhase('idle')).toBe(true);
      expect(isStablePhase('over')).toBe(true);
      expect(isStablePhase('rolling')).toBe(false);
      expect(isStablePhase('moving')).toBe(false);
      expect(isStablePhase('sliding')).toBe(false);
      expect(isStablePhase('settling')).toBe(false);
      expect(isStablePhase('waiting')).toBe(false);

      expect(isNonStablePhase('rolling')).toBe(true);
      expect(isNonStablePhase('settling')).toBe(true);
      expect(isNonStablePhase('waiting')).toBe(true);
      expect(isNonStablePhase('idle')).toBe(false);
      expect(isNonStablePhase('over')).toBe(false);
    });

    it('identifies terminal checkpoints accurately', () => {
      expect(
        isTerminalCheckpoint({
          mode: 'over',
          pos: [100, 20],
          turn: 0,
          phase: 'over',
          rolls: [5, 4],
          laddersHit: [0, 0],
          snakesHit: [0, 0],
          sixesHit: [0, 0],
          winner: 0,
        }),
      ).toBe(true);

      expect(
        isTerminalCheckpoint({
          mode: 'playing',
          pos: [40, 20],
          turn: 0,
          phase: 'idle',
          rolls: [5, 4],
          laddersHit: [0, 0],
          snakesHit: [0, 0],
          sixesHit: [0, 0],
          winner: -1,
        }),
      ).toBe(false);
    });
  });
});
