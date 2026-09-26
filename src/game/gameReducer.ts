import type { GameSpeed, Pt, WinRule } from './constants';
import type { CheckpointMode } from './network/types';
import type { Particle } from './render';

export type Phase =
  | 'idle'
  | 'rolling'
  | 'moving'
  | 'sliding'
  | 'settling'
  | 'waiting'
  | 'over';

export type Mode = 'menu' | 'playing' | 'over';

export interface PlayerConfig {
  id: string;
  slotIndex: number;
  name: string;
  isCpu: boolean;
  colorId: number;
}

/**
 * Map slotIndex -> dense roster index.
 * Returns -1 if the slotIndex is not present in the roster.
 */
export function slotToIndex(slotIndex: number, players: PlayerConfig[]): number {
  return players.findIndex((p) => p.slotIndex === slotIndex);
}

/**
 * Map dense roster index -> slotIndex.
 */
export function indexToSlot(index: number, players: PlayerConfig[]): number {
  const p = players[index];
  return p ? p.slotIndex : -1;
}

/**
 * Lookup PlayerConfig by slotIndex.
 */
export function getPlayerBySlot(slotIndex: number, players: PlayerConfig[]): PlayerConfig | undefined {
  return players.find((p) => p.slotIndex === slotIndex);
}

/** The hard ceiling on roster size. Also bounds every palette index. */
export const MAX_ROSTER_SIZE = 4;

/**
 * (P2) Normalise a per-player counter array to exactly `len` entries.
 *
 * A checkpoint's stat arrays may legitimately be shorter than the roster (a
 * player who just joined has no stats yet), but every array the HUD and the
 * board index must be roster-length or those reads produce `undefined`.
 */
function padTo(arr: number[], len: number): number[] {
  const out = new Array<number>(len).fill(0);
  for (let i = 0; i < Math.min(arr.length, len); i++) {
    const v = arr[i];
    out[i] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  return out;
}

/**
 * Validate that roster slots are unique and within range [0, maxPlayers - 1],
 * and that each entry's own fields are usable.
 *
 * (P2) This used to check slot uniqueness only, and `maxPlayers` defaulted to
 * 4. Two consequences:
 *  - a caller passing a larger `maxPlayers` silently lifted the 4-player
 *    invariant that `START_POS`, the palette and the log-dot map all assume;
 *  - `colorId` and `name` were never validated here, so a roster arriving from
 *    a peer or a restored session could carry a `colorId` of 99 straight into
 *    the render loop.
 *
 * `maxPlayers` is now clamped to `MAX_ROSTER_SIZE` and each player is checked.
 */
export function validateRoster(
  players: PlayerConfig[],
  maxPlayers = MAX_ROSTER_SIZE,
  minPlayers = 2,
): { valid: boolean; error?: string } {
  // Clamp: a caller cannot opt out of the hard 4-player ceiling.
  const cap = Math.min(maxPlayers, MAX_ROSTER_SIZE);
  if (!Array.isArray(players) || players.length < minPlayers) {
    return { valid: false, error: `Roster must contain at least ${minPlayers} players` };
  }
  if (players.length > cap) {
    return { valid: false, error: `Roster exceeds maxPlayers (${cap})` };
  }
  const seenSlots = new Set<number>();
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!p || typeof p !== 'object') {
      return { valid: false, error: `Player at index ${i} is not an object` };
    }
    if (typeof p.slotIndex !== 'number' || !Number.isInteger(p.slotIndex)) {
      return { valid: false, error: `Player at index ${i} has invalid slotIndex` };
    }
    if (p.slotIndex < 0 || p.slotIndex >= cap) {
      return { valid: false, error: `Player slotIndex ${p.slotIndex} out of range [0, ${cap - 1}]` };
    }
    if (seenSlots.has(p.slotIndex)) {
      return { valid: false, error: `Duplicate slotIndex ${p.slotIndex} in roster` };
    }
    seenSlots.add(p.slotIndex);
    // (P2) Bounds the palette index, which the draw loop dereferences directly.
    if (
      typeof p.colorId !== 'number' ||
      !Number.isInteger(p.colorId) ||
      p.colorId < 0 ||
      p.colorId >= cap
    ) {
      return { valid: false, error: `Player at index ${i} has invalid colorId` };
    }
    if (typeof p.name !== 'string' || p.name.length === 0) {
      return { valid: false, error: `Player at index ${i} has an invalid name` };
    }
    if (typeof p.isCpu !== 'boolean') {
      return { valid: false, error: `Player at index ${i} has an invalid isCpu flag` };
    }
  }
  return { valid: true };
}

export interface Moving {
  player: number;
  steps: Pt[];
  idx: number;
  t0: number;
  base: number;
  finalRoll: number;
  finalTarget: number;
}

export interface Sliding {
  player: number;
  pts: Pt[];
  cum: number[];
  total: number;
  t0: number;
  dur: number;
  kind: 'ladder' | 'snake';
  from: number;
  to: number;
  roll: number;
}

export interface FloatingEmote {
  id: number;
  player: number;
  emoji: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface CheckpointData {
  mode: CheckpointMode;
  pos: number[];
  turn: number;
  phase: string;
  rolls: number[];
  laddersHit: number[];
  snakesHit: number[];
  sixesHit: number[];
  winner: number;
  stateVersion?: number;
  turnId?: number;
}

export interface GameState {
  mode: Mode;
  phase: Phase;
  players: PlayerConfig[];
  turn: number;
  pos: number[];
  roll: number;
  rolling: boolean;
  winner: number;
  rolls: number[];
  laddersHit: number[];
  snakesHit: number[];
  sixesHit: number[];
  speed: GameSpeed;
  winRule: WinRule;
  targetSquare?: number;
  hoveredSquare?: number;

  // Transaction & versioning
  txId: number;
  stateVersion: number;

  // Active animations & transients
  moving: Moving | null;
  sliding: Sliding | null;
  particles: Particle[];
  emotes: FloatingEmote[];
  shake: number;
  /** (E2) Screen-edge impact flash intensity, 0..1, decays each frame. */
  flash: number;
  /** Colour of the impact flash. */
  flashColor: string;
  /** (E4) Extra-turn celebration halo, 0..1, decays each frame. */
  extraTurn: number;
  time: number;
}

export const defaultPlayers: PlayerConfig[] = [
  { id: 'player-0', slotIndex: 0, name: 'You', isCpu: false, colorId: 0 },
  { id: 'player-1', slotIndex: 1, name: 'CPU', isCpu: true, colorId: 1 },
];

export const initialGameState = (): GameState => ({
  mode: 'menu',
  phase: 'idle',
  players: defaultPlayers,
  turn: 0,
  pos: [0, 0],
  roll: 0,
  rolling: false,
  winner: -1,
  rolls: [0, 0],
  laddersHit: [0, 0],
  snakesHit: [0, 0],
  sixesHit: [0, 0],
  speed: 'normal',
  winRule: 'exact',
  targetSquare: undefined,
  hoveredSquare: undefined,
  txId: 1,
  stateVersion: 1,
  moving: null,
  sliding: null,
  particles: [],
  emotes: [],
  shake: 0,
  flash: 0,
  flashColor: 'rgba(239, 68, 68, 0.55)',
  extraTurn: 0,
  time: 0,
});

export function isStablePhase(phase: Phase | string): boolean {
  return phase === 'idle' || phase === 'over';
}

export function isNonStablePhase(phase: Phase | string): boolean {
  return !isStablePhase(phase);
}

export function isTerminalCheckpoint(cp: CheckpointData): boolean {
  return cp.mode === 'over' || cp.winner >= 0;
}

export function canApplyCheckpoint(
  state: GameState,
  checkpoint: CheckpointData,
): { canApply: boolean; reason?: 'stale' | 'duplicate' | 'non_stable' } {
  if (
    checkpoint.stateVersion !== undefined &&
    state.stateVersion !== undefined &&
    checkpoint.stateVersion <= state.stateVersion
  ) {
    return {
      canApply: false,
      reason: checkpoint.stateVersion === state.stateVersion ? 'duplicate' : 'stale',
    };
  }

  // Defer or reject non-terminal checkpoints during every non-stable phase, including settling and waiting
  if (!isTerminalCheckpoint(checkpoint) && isNonStablePhase(state.phase)) {
    return { canApply: false, reason: 'non_stable' };
  }

  return { canApply: true };
}

/* ---------- Reducer Actions ---------- */

export type GameAction =
  | {
      type: 'START_GAME';
      players?: PlayerConfig[];
      speed?: GameSpeed;
      winRule?: WinRule;
    }
  | {
      type: 'START_ROLL';
      player: number;
      roll: number;
    }
  | {
      type: 'ROLL_LANDED';
      txId: number;
      expectedPhase: 'rolling';
      player: number;
      roll: number;
    }
  | {
      type: 'START_MOVE';
      txId: number;
      player: number;
      steps: Pt[];
      target: number;
      roll: number;
    }
  | {
      type: 'FINISH_MOVE';
      txId: number;
      player: number;
      target: number;
    }
  | {
      type: 'START_SLIDE';
      txId: number;
      player: number;
      sliding: Sliding;
    }
  | {
      type: 'FINISH_SLIDE';
      txId: number;
      player: number;
      to: number;
    }
  | {
      /**
       * (P0 fix) Set the one-shot impact transients: the bite camera shake,
       * the screen-edge flash and the lucky-six extra-turn halo.
       *
       * These used to be assigned directly onto a `gs.current` reference that
       * had *already* been replaced by the reducer moments earlier in the same
       * rAF frame (`FINISH_MOVE` / `FINISH_SLIDE` both return a fresh object),
       * so the writes landed on an orphaned snapshot and the three effects were
       * never visible. Routing them through the reducer keeps every state
       * mutation in one place and makes them unit-testable.
       */
      type: 'SET_IMPACT';
      shake?: number;
      flash?: number;
      flashColor?: string;
      extraTurn?: number;
    }
  | {
      type: 'START_SETTLING';
      txId: number;
      player: number;
    }
  | {
      type: 'SETTLE_COMPLETE';
      txId: number;
      expectedPhase: 'settling';
      player: number;
      roll: number;
    }
  | {
      type: 'START_LUCKY_SIX_WAIT';
      txId: number;
      player: number;
    }
  | {
      type: 'FINISH_LUCKY_SIX_WAIT';
      txId: number;
      expectedPhase: 'waiting';
      player: number;
    }
  | {
      type: 'START_PASS_WAIT';
      txId: number;
      player: number;
    }
  | {
      type: 'FINISH_PASS_WAIT';
      txId: number;
      expectedPhase: 'waiting';
      player: number;
    }
  | {
      type: 'SWITCH_TURN';
      txId?: number;
      fromPlayer?: number;
    }
  | {
      type: 'GAME_OVER';
      winner: number;
      txId?: number;
    }
  | {
      type: 'APPLY_CHECKPOINT';
      checkpoint: CheckpointData;
    }
  | {
      type: 'RECONNECT';
      players: PlayerConfig[];
      speed: GameSpeed;
      winRule: WinRule;
      checkpoint?: CheckpointData;
    }
  | {
      type: 'BACK_TO_MENU';
    }
  | {
      type: 'UPDATE_PLAYERS';
      players: PlayerConfig[];
    }
  | {
      type: 'UPDATE_ROSTER';
      players: PlayerConfig[];
    }
  | {
      type: 'CPU_TAKEOVER';
      slotIndex: number;
      name?: string;
    }
  | {
      type: 'PLAYER_RECONNECT';
      slotIndex: number;
      name?: string;
    }
  | {
      type: 'REMOVE_PLAYER';
      slotIndex: number;
    }
  | {
      type: 'SET_SPEED';
      speed: GameSpeed;
    }
  | {
      type: 'SET_WIN_RULE';
      winRule: WinRule;
    }
  | {
      type: 'CLEAR_ROLLING';
    };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME': {
      const players = action.players ?? state.players;
      const valid = validateRoster(players);
      if (!valid.valid) {
        return state;
      }
      const speed = action.speed ?? state.speed;
      const winRule = action.winRule ?? state.winRule;
      const count = players.length;

      return {
        ...state,
        mode: 'playing',
        phase: 'idle',
        players,
        turn: 0,
        pos: new Array(count).fill(0),
        rolls: new Array(count).fill(0),
        laddersHit: new Array(count).fill(0),
        snakesHit: new Array(count).fill(0),
        sixesHit: new Array(count).fill(0),
        winner: -1,
        speed,
        winRule,
        roll: 0,
        rolling: false,
        targetSquare: undefined,
        txId: state.txId + 1,
        stateVersion: 1,
        moving: null,
        sliding: null,
        particles: [],
        emotes: [],
        shake: 0,
        flash: 0,
        extraTurn: 0,
      };
    }

    case 'START_ROLL': {
      if (state.mode !== 'playing' || state.phase !== 'idle' || state.rolling) {
        return state;
      }
      const player = action.player;
      const roll = action.roll;
      const nextRolls = [...state.rolls];
      nextRolls[player] = (nextRolls[player] || 0) + 1;

      /* (P2) Projected landing square for the board's highlight.
       *
       * This only ever computed the *exact* rule, so in a bounce match an
       * overshooting roll produced `undefined` and the highlight was silently
       * suppressed - the preview was wrong by omission for the entire bounce
       * rule set, even though the token does move (to `100 - overshoot`).
       *
       * Under the bounce rule the token always lands somewhere, so project it.
       * Under the exact rule an overshoot really is "you do not move", and
       * showing no target is the honest answer. */
      const raw = state.pos[player] + roll;
      let projectedTarget: number | undefined;
      if (raw <= 100) {
        projectedTarget = raw;
      } else if (state.winRule === 'bounce') {
        projectedTarget = 100 - (raw - 100);
      }

      return {
        ...state,
        txId: state.txId + 1, // New roll transaction
        turn: player,
        rolling: true,
        phase: 'rolling',
        roll,
        rolls: nextRolls,
        targetSquare: projectedTarget,
        moving: null,
        sliding: null,
      };
    }

    case 'ROLL_LANDED': {
      // Verify transaction ID and expected phase
      if (state.txId !== action.txId || state.phase !== action.expectedPhase) {
        return state;
      }
      return {
        ...state,
        rolling: false,
        roll: action.roll,
      };
    }

    case 'START_MOVE': {
      if (state.txId !== action.txId) {
        return state;
      }
      return {
        ...state,
        phase: 'moving',
        targetSquare: action.target,
        moving: {
          player: action.player,
          steps: action.steps,
          idx: 0,
          t0: performance.now() + 60,
          base: state.pos[action.player],
          finalRoll: action.roll,
          finalTarget: action.target,
        },
      };
    }

    case 'FINISH_MOVE': {
      if (state.txId !== action.txId) {
        return state;
      }
      const nextPos = [...state.pos];
      nextPos[action.player] = action.target;
      return {
        ...state,
        moving: null,
        pos: nextPos,
      };
    }

    case 'START_SLIDE': {
      if (state.txId !== action.txId) {
        return state;
      }
      const isLadder = action.sliding.kind === 'ladder';
      const nextLadders = [...state.laddersHit];
      const nextSnakes = [...state.snakesHit];
      if (isLadder) {
        nextLadders[action.player] = (nextLadders[action.player] || 0) + 1;
      } else {
        nextSnakes[action.player] = (nextSnakes[action.player] || 0) + 1;
      }

      return {
        ...state,
        phase: 'sliding',
        sliding: action.sliding,
        laddersHit: nextLadders,
        snakesHit: nextSnakes,
      };
    }

    case 'FINISH_SLIDE': {
      if (state.txId !== action.txId) {
        return state;
      }
      const nextPos = [...state.pos];
      nextPos[action.player] = action.to;
      return {
        ...state,
        sliding: null,
        pos: nextPos,
      };
    }

    case 'SET_IMPACT': {
      return {
        ...state,
        shake: action.shake ?? state.shake,
        flash: action.flash ?? state.flash,
        flashColor: action.flashColor ?? state.flashColor,
        extraTurn: action.extraTurn ?? state.extraTurn,
      };
    }

    case 'START_SETTLING': {
      if (state.txId !== action.txId) {
        return state;
      }
      return {
        ...state,
        phase: 'settling',
      };
    }

    case 'SETTLE_COMPLETE': {
      // Verify transaction ID and expected phase before mutating state
      if (state.txId !== action.txId || state.phase !== action.expectedPhase) {
        return state;
      }
      return state;
    }

    case 'START_LUCKY_SIX_WAIT': {
      if (state.txId !== action.txId) {
        return state;
      }
      const nextSixes = [...state.sixesHit];
      nextSixes[action.player] = (nextSixes[action.player] || 0) + 1;
      return {
        ...state,
        turn: action.player,
        phase: 'waiting',
        sixesHit: nextSixes,
      };
    }

    case 'FINISH_LUCKY_SIX_WAIT': {
      // Verify transaction ID and expected phase
      if (state.txId !== action.txId || state.phase !== action.expectedPhase) {
        return state;
      }
      return {
        ...state,
        phase: 'idle',
        rolling: false,
      };
    }

    case 'START_PASS_WAIT': {
      if (state.txId !== action.txId) {
        return state;
      }
      return {
        ...state,
        phase: 'waiting',
      };
    }

    case 'FINISH_PASS_WAIT': {
      // Verify transaction ID and expected phase
      if (state.txId !== action.txId || state.phase !== action.expectedPhase) {
        return state;
      }
      const nextTurn = (action.player + 1) % state.players.length;
      return {
        ...state,
        txId: state.txId + 1, // New turn transaction
        turn: nextTurn,
        phase: 'idle',
        rolling: false,
        roll: 0,
        targetSquare: undefined,
      };
    }

    case 'SWITCH_TURN': {
      const current = typeof action.fromPlayer === 'number' ? action.fromPlayer : state.turn;
      const nextTurn = (current + 1) % state.players.length;
      return {
        ...state,
        txId: state.txId + 1, // Unique transaction ID for every turn
        turn: nextTurn,
        phase: 'idle',
        rolling: false,
        roll: 0,
        targetSquare: undefined,
      };
    }

    case 'GAME_OVER': {
      return {
        ...state,
        txId: state.txId + 1,
        mode: 'over',
        phase: 'over',
        winner: action.winner,
        rolling: false,
        roll: 0,
        moving: null,
        sliding: null,
        targetSquare: undefined,
      };
    }

    case 'APPLY_CHECKPOINT': {
      const cp = action.checkpoint;

      /* 0. (P0 FIX) Normalise, do not discard, a checkpoint whose per-player
       * arrays do not line up with the local roster.
       *
       * `pos`, `rolls`, `laddersHit`, `snakesHit` and `sixesHit` were copied
       * straight from the wire with no length check. A short `pos` makes
       * `g.pos[p]` `undefined`; `undefined <= 0` is `false`, so the token
       * point path falls through to `squareCenter(undefined)` and every
       * coordinate becomes NaN - the token silently stops drawing and the
       * multi-token `sharing` list is poisoned, with no error anywhere.
       *
       * My first attempt returned the state unchanged whenever the widths
       * disagreed. That fixed the NaN but introduced a worse bug: a guest
       * whose roster briefly differs from the host's (a player joining, a CPU
       * being removed) would silently drop every checkpoint, so its board would
       * freeze while the host's marched on. A desync is worse than a clamped
       * number.
       *
       * So only genuinely unusable input is fatal - a missing array, or values
       * outside the legal range. Width mismatches are *repaired* to the local
       * roster length, and `turn` is clamped rather than rejected. The next
       * checkpoint (and the roster that comes with it) converges everything.
       */
      const n = state.players.length;
      if (!Array.isArray(cp.pos) || cp.pos.length === 0) {
        return state;
      }
      if (!cp.pos.every((x) => Number.isInteger(x) && x >= 0 && x <= 100)) {
        return state;
      }
      for (const arr of [cp.rolls, cp.laddersHit, cp.snakesHit, cp.sixesHit]) {
        if (!Array.isArray(arr) || arr.length === 0) return state;
        if (!arr.every((x) => Number.isInteger(x) && x >= 0)) return state;
      }
      if (!Number.isInteger(cp.turn) || cp.turn < 0) {
        return state;
      }

      // 1. Reject duplicate or out-of-order state versions
      if (
        cp.stateVersion !== undefined &&
        state.stateVersion !== undefined &&
        cp.stateVersion <= state.stateVersion
      ) {
        return state;
      }

      const isTerminal = isTerminalCheckpoint(cp);

      // 2. Reject non-terminal checkpoints during every non-stable phase
      if (!isTerminal && isNonStablePhase(state.phase)) {
        return state;
      }

      // 3. Terminal checkpoint: game over
      if (isTerminal) {
        return {
          ...state,
          txId: state.txId + 1, // Invalidate all pending timers
          mode: 'over',
          phase: 'over',
          winner: cp.winner,
          pos: padTo(cp.pos, n),
          turn: Math.min(cp.turn, n - 1),
          rolls: padTo(cp.rolls, n),
          laddersHit: padTo(cp.laddersHit, n),
          snakesHit: padTo(cp.snakesHit, n),
          sixesHit: padTo(cp.sixesHit, n),
          stateVersion: cp.stateVersion ?? state.stateVersion + 1,
          // Requirement 8: Clear rolling/moving/sliding state when applying a terminal checkpoint
          rolling: false,
          roll: 0,
          moving: null,
          sliding: null,
          targetSquare: undefined,
        };
      }

      // 4. Non-terminal stable checkpoint
      const targetMode: Mode =
        cp.mode === 'idle' && state.mode === 'menu'
          ? 'menu'
          : cp.mode === 'over'
          ? 'over'
          : 'playing';

      const targetPhase: Phase = (cp.phase as Phase) || 'idle';

      return {
        ...state,
        txId: state.txId + 1,
        mode: targetMode,
        phase: targetPhase,
        pos: padTo(cp.pos, n),
        turn: Math.min(cp.turn, n - 1),
        rolls: padTo(cp.rolls, n),
        laddersHit: padTo(cp.laddersHit, n),
        snakesHit: padTo(cp.snakesHit, n),
        sixesHit: padTo(cp.sixesHit, n),
        winner: cp.winner,
        stateVersion: cp.stateVersion ?? state.stateVersion + 1,
        rolling: false,
        roll: 0,
        moving: null,
        sliding: null,
        targetSquare: undefined,
      };
    }

    case 'RECONNECT': {
      const players = action.players;
      const valid = validateRoster(players);
      if (!valid.valid) {
        return state;
      }
      const speed = action.speed;
      const winRule = action.winRule;
      const cp = action.checkpoint;

      if (cp) {
        const isTerminal = isTerminalCheckpoint(cp);
        const resolvedMode: Mode = isTerminal
          ? 'over'
          : cp.mode === 'idle'
          ? 'playing'
          : (cp.mode as Mode);

        // Requirement 9: Reconnect only from stable idle/over states
        const resolvedPhase: Phase = isTerminal ? 'over' : 'idle';

        /* (P0) Same rule as APPLY_CHECKPOINT: repair widths rather than
         * discarding the resume. Refusing here left a rejoining guest on a
         * stale board whenever the host's roster no longer matched the stored
         * one, which is exactly the case a reconnect exists to recover from. */
        const n = players.length;
        if (!Array.isArray(cp.pos) || cp.pos.length === 0) {
          return state;
        }
        if (!cp.pos.every((x) => Number.isInteger(x) && x >= 0 && x <= 100)) {
          return state;
        }
        if (!Number.isInteger(cp.turn) || cp.turn < 0) {
          return state;
        }

        return {
          ...state,
          mode: resolvedMode,
          phase: resolvedPhase,
          players,
          turn: Math.min(cp.turn, n - 1),
          pos: padTo(cp.pos, n),
          rolls: padTo(cp.rolls, n),
          laddersHit: padTo(cp.laddersHit, n),
          snakesHit: padTo(cp.snakesHit, n),
          sixesHit: padTo(cp.sixesHit, n),
          winner: cp.winner,
          speed,
          winRule,
          txId: state.txId + 1,
          stateVersion: cp.stateVersion ?? state.stateVersion + 1,
          rolling: false,
          roll: 0,
          moving: null,
          sliding: null,
          targetSquare: undefined,
        };
      }

      return {
        ...state,
        mode: 'playing',
        phase: 'idle',
        players,
        turn: 0,
        pos: new Array(players.length).fill(0),
        rolls: new Array(players.length).fill(0),
        laddersHit: new Array(players.length).fill(0),
        snakesHit: new Array(players.length).fill(0),
        sixesHit: new Array(players.length).fill(0),
        winner: -1,
        speed,
        winRule,
        txId: state.txId + 1,
        stateVersion: 1,
        rolling: false,
        roll: 0,
        moving: null,
        sliding: null,
        targetSquare: undefined,
      };
    }

    case 'BACK_TO_MENU': {
      return {
        ...state,
        txId: state.txId + 1,
        mode: 'menu',
        phase: 'idle',
        moving: null,
        sliding: null,
        rolling: false,
        roll: 0,
        targetSquare: undefined,
        particles: [],
        emotes: [],
        shake: 0,
        flash: 0,
        extraTurn: 0,
      };
    }

    case 'UPDATE_PLAYERS':
    case 'UPDATE_ROSTER': {
      const newPlayers = action.players;
      const valid = validateRoster(newPlayers);
      if (!valid.valid) {
        return state;
      }

      if (state.mode !== 'playing') {
        return {
          ...state,
          players: newPlayers,
        };
      }

      const nextPos: number[] = [];
      const nextRolls: number[] = [];
      const nextLaddersHit: number[] = [];
      const nextSnakesHit: number[] = [];
      const nextSixesHit: number[] = [];

      for (let i = 0; i < newPlayers.length; i++) {
        const p = newPlayers[i];
        const oldIdx = slotToIndex(p.slotIndex, state.players);
        if (oldIdx >= 0) {
          nextPos.push(state.pos[oldIdx] ?? 0);
          nextRolls.push(state.rolls[oldIdx] ?? 0);
          nextLaddersHit.push(state.laddersHit[oldIdx] ?? 0);
          nextSnakesHit.push(state.snakesHit[oldIdx] ?? 0);
          nextSixesHit.push(state.sixesHit[oldIdx] ?? 0);
        } else {
          nextPos.push(0);
          nextRolls.push(0);
          nextLaddersHit.push(0);
          nextSnakesHit.push(0);
          nextSixesHit.push(0);
        }
      }

      const currentActiveSlot = indexToSlot(state.turn, state.players);
      let nextTurn = slotToIndex(currentActiveSlot, newPlayers);
      let nextPhase = state.phase;
      let nextMoving = state.moving;
      let nextSliding = state.sliding;

      if (nextTurn === -1) {
        nextTurn = Math.min(state.turn, newPlayers.length - 1);
        if (nextTurn < 0) nextTurn = 0;
        nextPhase = 'idle';
        nextMoving = null;
        nextSliding = null;
      } else {
        if (nextMoving) {
          nextMoving = { ...nextMoving, player: nextTurn };
        }
        if (nextSliding) {
          nextSliding = { ...nextSliding, player: nextTurn };
        }
      }

      let nextWinner = state.winner;
      if (state.winner >= 0) {
        const winnerSlot = indexToSlot(state.winner, state.players);
        nextWinner = slotToIndex(winnerSlot, newPlayers);
      }

      return {
        ...state,
        txId: state.txId,
        players: newPlayers,
        pos: nextPos,
        rolls: nextRolls,
        laddersHit: nextLaddersHit,
        snakesHit: nextSnakesHit,
        sixesHit: nextSixesHit,
        turn: nextTurn,
        winner: nextWinner,
        phase: nextPhase,
        rolling: nextPhase === 'idle' ? false : state.rolling,
        moving: nextMoving,
        sliding: nextSliding,
      };
    }

    case 'CPU_TAKEOVER': {
      const idx = slotToIndex(action.slotIndex, state.players);
      if (idx === -1) return state;
      const target = state.players[idx];
      const updatedPlayer: PlayerConfig = {
        ...target,
        isCpu: true,
        name: action.name || (target.name.includes('(CPU)') ? target.name : `${target.name} (CPU)`),
      };
      const nextPlayers = [...state.players];
      nextPlayers[idx] = updatedPlayer;
      return {
        ...state,
        txId: state.txId,
        players: nextPlayers,
      };
    }

    case 'PLAYER_RECONNECT': {
      const idx = slotToIndex(action.slotIndex, state.players);
      if (idx === -1) return state;
      const target = state.players[idx];
      const cleanName = action.name || target.name.replace(/\s*\(CPU\)/gi, '').trim();
      const updatedPlayer: PlayerConfig = {
        ...target,
        isCpu: false,
        name: cleanName,
      };
      const nextPlayers = [...state.players];
      nextPlayers[idx] = updatedPlayer;
      return {
        ...state,
        txId: state.txId,
        players: nextPlayers,
        rolling: state.phase === 'idle' ? false : state.rolling,
      };
    }

    case 'REMOVE_PLAYER': {
      const idx = slotToIndex(action.slotIndex, state.players);
      if (idx === -1 || state.players.length <= 1) return state;
      const newPlayers = state.players.filter((_, i) => i !== idx);
      const nextPos = state.pos.filter((_, i) => i !== idx);
      const nextRolls = state.rolls.filter((_, i) => i !== idx);
      const nextLadders = state.laddersHit.filter((_, i) => i !== idx);
      const nextSnakes = state.snakesHit.filter((_, i) => i !== idx);
      const nextSixes = state.sixesHit.filter((_, i) => i !== idx);

      let nextTurn = state.turn;
      let nextPhase = state.phase;
      let nextMoving = state.moving;
      let nextSliding = state.sliding;

      if (state.turn === idx) {
        nextTurn = idx % newPlayers.length;
        nextPhase = 'idle';
        nextMoving = null;
        nextSliding = null;
      } else if (state.turn > idx) {
        nextTurn = state.turn - 1;
        if (nextMoving) nextMoving = { ...nextMoving, player: nextMoving.player - 1 };
        if (nextSliding) nextSliding = { ...nextSliding, player: nextSliding.player - 1 };
      }

      let nextWinner = state.winner;
      if (state.winner === idx) {
        nextWinner = -1;
      } else if (state.winner > idx) {
        nextWinner = state.winner - 1;
      }

      return {
        ...state,
        txId: state.txId + 1,
        players: newPlayers,
        pos: nextPos,
        rolls: nextRolls,
        laddersHit: nextLadders,
        snakesHit: nextSnakes,
        sixesHit: nextSixes,
        turn: nextTurn,
        winner: nextWinner,
        phase: nextPhase,
        moving: nextMoving,
        sliding: nextSliding,
      };
    }

    case 'SET_SPEED': {
      return {
        ...state,
        speed: action.speed,
      };
    }

    case 'SET_WIN_RULE': {
      return {
        ...state,
        winRule: action.winRule,
      };
    }

    case 'CLEAR_ROLLING': {
      return {
        ...state,
        rolling: false,
        phase: state.phase === 'rolling' ? 'idle' : state.phase,
      };
    }

    default:
      return state;
  }
}
