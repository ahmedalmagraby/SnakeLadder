import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSpeed, PlayerPalette, Pt, WinRule } from './constants';
import {
  CELL,
  LADDER_PATHS,
  LOGICAL,
  PLAYER_COLORS,
  PORTALS,
  SNAKE_PATHS,
  SPEEDS,
  START_POS,
  clamp,
  easeInOutCubic,
  getTokenSlotOffset,
  lerp,
  pathCum,
  pointAt,
  squareCenter,
  squareFromPoint,
  getSnakeSlidePoint,
} from './constants';
import { sfx } from './audio';
import { THEMES, getSavedTheme, saveTheme, type BoardTheme, type ThemeId } from './themes';
import {
  drawAnimatedSnakes,
  drawBoardBadgesAndNumbers,
  drawHoverHighlight,
  drawParticles,
  drawStaticBoard,
  drawTargetHighlight,
  drawToken,
  roundRectPath,
  spawnConfetti,
  spawnDust,
  spawnFirework,
  spawnSpark,
  updateParticles,
} from './render';
import type { CheckpointMode, GameStateSnapshot } from './network/types';
import {
  gameReducer,
  initialGameState,
  isStablePhase,
  isNonStablePhase,
  isTerminalCheckpoint,
  defaultPlayers,
  slotToIndex,
  type Phase,
  type Mode,
  type PlayerConfig,
  type CheckpointData,
  type GameState,
  type GameAction,
  type Sliding,
  type FloatingEmote,
} from './gameReducer';

export type { Phase, Mode, PlayerConfig, CheckpointData, Sliding, FloatingEmote, GameState, GameAction };

export interface Hud {
  mode: Mode;
  players: PlayerConfig[];
  turn: number;
  pos: number[];
  roll: number;
  rolling: boolean;
  phase: Phase;
  winner: number;
  rolls: number[];
  laddersHit: number[];
  snakesHit: number[];
  sixesHit: number[];
  speed: GameSpeed;
  winRule: WinRule;
  targetSquare?: number;
  hoveredSquare?: number;
}

export interface Toast {
  id: number;
  title: string;
  sub?: string;
  kind: 'gold' | 'red' | 'cyan' | 'pink' | 'lime' | 'info';
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'p0' | 'p1' | 'p2' | 'p3' | 'event';
}

export interface UseGameOptions {
  isOnline?: boolean;
  isOnlineMatch?: boolean;
  isPaused?: boolean;
  isHost?: boolean;
  onlineSlot?: number;
  onLocalRoll?: (roll: number, player: number) => void;
  onTurnSettled?: (snapshot: GameStateSnapshot) => void;
}

export function useGame(options: UseGameOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const {
    isOnline = false,
    isHost = false,
    onlineSlot = 0,
  } = options;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gs = useRef<GameState>(initialGameState());
  const pendingCheckpoint = useRef<CheckpointData | null>(null);
  const lastStableSnapshot = useRef<GameStateSnapshot | null>(null);
  const boardLayer = useRef<HTMLCanvasElement | null>(null);
  const numberLayer = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef(0);
  const activeTimers = useRef<Map<string, { id: number; txId: number }>>(new Map());
  const uiTimers = useRef<Set<number>>(new Set());
  const toastId = useRef(0);
  const logId = useRef(0);

  const [hud, setHud] = useState<Hud>({
    mode: 'menu',
    players: defaultPlayers,
    turn: 0,
    pos: [0, 0],
    roll: 0,
    rolling: false,
    phase: 'idle',
    winner: -1,
    rolls: [0, 0],
    laddersHit: [0, 0],
    snakesHit: [0, 0],
    sixesHit: [0, 0],
    speed: 'normal',
    winRule: 'exact',
  });

  const [toast, setToast] = useState<Toast | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [muted, setMuted] = useState(false);
  // Guest-only: true between sending ROLL_REQUEST and receiving the host's
  // authoritative ROLL_RESULT. Prevents spamming the host with roll requests.
  const [awaitingRemoteRoll, setAwaitingRemoteRoll] = useState(false);
  const awaitingRemoteRollRef = useRef(false);
  const [showWin, setShowWin] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'restart' | 'menu' | null>(null);
  const [hoveredSquare, setHoveredSquare] = useState<number | undefined>(undefined);
  const [themeId, setThemeIdState] = useState<ThemeId>(() => getSavedTheme());
  const themeRef = useRef<BoardTheme>(THEMES[themeId] || THEMES.jungle);
  themeRef.current = THEMES[themeId] || THEMES.jungle;

  const setAwaitingRoll = useCallback((v: boolean) => {
    awaitingRemoteRollRef.current = v;
    setAwaitingRemoteRoll(v);
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    if (!THEMES[id]) return;
    saveTheme(id);
    themeRef.current = THEMES[id];
    setThemeIdState(id);
  }, []);

  const cancelObsoleteTimers = useCallback((currentTxId?: number) => {
    activeTimers.current.forEach((val, name) => {
      if (currentTxId === undefined || val.txId !== currentTxId) {
        window.clearTimeout(val.id);
        activeTimers.current.delete(name);
      }
    });
  }, []);

  const clearAllTimers = useCallback(() => {
    activeTimers.current.forEach((val) => window.clearTimeout(val.id));
    activeTimers.current.clear();
    uiTimers.current.forEach((t) => window.clearTimeout(t));
    uiTimers.current.clear();
  }, []);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  const scheduleUiTimer = useCallback((ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      uiTimers.current.delete(t);
      fn();
    }, ms);
    uiTimers.current.add(t);
    return t;
  }, []);

  const clearHover = useCallback(() => {
    gs.current.hoveredSquare = undefined;
    setHoveredSquare(undefined);
  }, []);

  const dispatch = useCallback((action: GameAction) => {
    const prevState = gs.current;
    const nextState = gameReducer(prevState, action);
    gs.current = nextState;

    setHud((prev) => ({
      ...prev,
      mode: nextState.mode,
      phase: nextState.phase,
      players: nextState.players,
      turn: nextState.turn,
      pos: [...nextState.pos],
      roll: nextState.roll,
      rolling: nextState.rolling,
      winner: nextState.winner,
      rolls: [...nextState.rolls],
      laddersHit: [...nextState.laddersHit],
      snakesHit: [...nextState.snakesHit],
      sixesHit: [...nextState.sixesHit],
      speed: nextState.speed,
      winRule: nextState.winRule,
      targetSquare: nextState.targetSquare,
      hoveredSquare: nextState.hoveredSquare,
    }));

    return nextState;
  }, []);

  const scheduleGameTimer = useCallback(
    (name: string, ms: number, expectedPhase: Phase, callback: () => void) => {
      const existing = activeTimers.current.get(name);
      if (existing) {
        window.clearTimeout(existing.id);
      }
      const txId = gs.current.txId;
      const t = window.setTimeout(() => {
        activeTimers.current.delete(name);
        if (gs.current.txId !== txId || gs.current.phase !== expectedPhase) {
          if (name === 'roll' && gs.current.rolling) {
            dispatch({ type: 'CLEAR_ROLLING' });
          }
          return;
        }
        callback();
      }, ms);
      activeTimers.current.set(name, { id: t, txId });
      return t;
    },
    [dispatch],
  );

  const recordStableSnapshot = useCallback((state: GameState): GameStateSnapshot => {
    const checkpointMode: CheckpointMode =
      state.winner >= 0 || state.mode === 'over'
        ? 'over'
        : state.mode === 'playing'
        ? 'playing'
        : 'idle';

    const snap: GameStateSnapshot = {
      mode: checkpointMode,
      pos: [...state.pos],
      turn: state.turn,
      phase: state.winner >= 0 || state.mode === 'over' ? 'over' : 'idle',
      rolls: [...state.rolls],
      laddersHit: [...state.laddersHit],
      snakesHit: [...state.snakesHit],
      sixesHit: [...state.sixesHit],
      winner: state.winner,
      isPlaying: state.mode === 'playing',
    };
    lastStableSnapshot.current = snap;
    return snap;
  }, []);

  const playerName = useCallback((p: number) => {
    const g = gs.current;
    return g.players[p]?.name ?? `Player ${p + 1}`;
  }, []);

  const playerPalette = useCallback((p: number): PlayerPalette => {
    const g = gs.current;
    const colorId = g.players[p]?.colorId ?? p;
    return PLAYER_COLORS[colorId % PLAYER_COLORS.length];
  }, []);

  const pushLog = useCallback((text: string, kind: LogEntry['kind']) => {
    logId.current += 1;
    const id = logId.current;
    setLog((l) => [{ id, text, kind }, ...l].slice(0, 8));
  }, []);

  const showToast = useCallback(
    (title: string, sub: string | undefined, kind: Toast['kind']) => {
      toastId.current += 1;
      const id = toastId.current;
      setToast({ id, title, sub, kind });
      scheduleUiTimer(1600, () => setToast((t) => (t && t.id === id ? null : t)));
    },
    [scheduleUiTimer],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sfx.enabled = m;
      return !m;
    });
  }, []);

  const setSpeed = useCallback((spd: GameSpeed) => {
    gs.current.speed = spd;
    setHud((h) => ({ ...h, speed: spd }));
  }, []);

  const setWinRule = useCallback((rule: WinRule) => {
    gs.current.winRule = rule;
    setHud((h) => ({ ...h, winRule: rule }));
  }, []);

  /* ---------- board layer rendering ---------- */

  const renderBoardLayer = useCallback((theme?: BoardTheme) => {
    const canvas = canvasRef.current;
    if (!canvas || canvas.width < 10) return;
    const currentTheme = theme || themeRef.current;

    // 1. Static base board layer
    const c1 = document.createElement('canvas');
    c1.width = canvas.width;
    c1.height = canvas.height;
    const ctx1 = c1.getContext('2d');
    if (ctx1) {
      const s = c1.width / LOGICAL;
      ctx1.setTransform(s, 0, 0, s, 0, 0);
      drawStaticBoard(ctx1, currentTheme, gs.current.players);
      boardLayer.current = c1;
    }

    // 2. High-contrast numbers & badges layer (rendered ON TOP of animated snakes)
    const c2 = document.createElement('canvas');
    c2.width = canvas.width;
    c2.height = canvas.height;
    const ctx2 = c2.getContext('2d');
    if (ctx2) {
      const s = c2.width / LOGICAL;
      ctx2.setTransform(s, 0, 0, s, 0, 0);
      drawBoardBadgesAndNumbers(ctx2, currentTheme);
      numberLayer.current = c2;
    }
  }, []);

  useEffect(() => {
    renderBoardLayer(THEMES[themeId] || THEMES.jungle);
  }, [themeId, renderBoardLayer]);

  /* ---------- game flow ---------- */

  const startGame = useCallback(
    (
      players: PlayerConfig[] = defaultPlayers,
      speed: GameSpeed = 'normal',
      winRule: WinRule = 'exact',
    ) => {
      cancelObsoleteTimers();
      clearHover();
      pendingCheckpoint.current = null;
      setAwaitingRoll(false);

      const nextState = dispatch({
        type: 'START_GAME',
        players,
        speed,
        winRule,
      });

      recordStableSnapshot(nextState);
      renderBoardLayer();

      setLog([]);
      setShowWin(false);
      setConfirmAction(null);
      sfx.click();

      const p0Name = players[0]?.name ?? 'Player 1';
      showToast(`${p0Name.toUpperCase()} STARTS`, 'Roll the dice to begin!', 'cyan');
      pushLog(`Match started — ${p0Name} has the opening turn!`, 'event');
    },
    [cancelObsoleteTimers, clearHover, dispatch, pushLog, recordStableSnapshot, renderBoardLayer, setAwaitingRoll, showToast],
  );

  const backToMenu = useCallback(() => {
    cancelObsoleteTimers();
    clearHover();
    pendingCheckpoint.current = null;
    setAwaitingRoll(false);
    dispatch({ type: 'BACK_TO_MENU' });
    setShowWin(false);
    setToast(null);
    setConfirmAction(null);
    sfx.click();
  }, [cancelObsoleteTimers, clearHover, dispatch, setAwaitingRoll]);

  /* Apply authoritative checkpoint from host (Requirement 3) */
  const applyCheckpoint = useCallback(
    (checkpoint: CheckpointData) => {
      // 1. Cancel obsolete timers when a checkpoint supersedes local state (Requirement 5)
      cancelObsoleteTimers();
      pendingCheckpoint.current = null;
      // An authoritative checkpoint supersedes any outstanding roll request.
      setAwaitingRoll(false);

      const wasOver = gs.current.mode === 'over';

      // 2. Apply host checkpoint through the authoritative reducer
      const nextState = dispatch({
        type: 'APPLY_CHECKPOINT',
        checkpoint,
      });

      if (isStablePhase(nextState.phase)) {
        recordStableSnapshot(nextState);
      }

      // 3. Fix winner synchronization so both gs.mode and hud.mode become over (Requirement 7)
      if (nextState.mode === 'over' && nextState.winner >= 0) {
        if (!wasOver) {
          pushLog(
            `🏆 ${playerName(nextState.winner)} conquered square 100 and WON THE GAME!`,
            'event',
          );
          sfx.win();
          spawnConfetti(nextState.particles);
          spawnFirework(nextState.particles, 520, 200);

          scheduleUiTimer(500, () => {
            if (gs.current.mode === 'over') {
              spawnConfetti(gs.current.particles);
              spawnFirework(gs.current.particles, 300, 300);
            }
          });
          scheduleUiTimer(1100, () => {
            if (gs.current.mode === 'over') {
              spawnConfetti(gs.current.particles);
              spawnFirework(gs.current.particles, 740, 260);
            }
          });
          scheduleUiTimer(1500, () => {
            if (gs.current.mode === 'over') {
              setShowWin(true);
            }
          });
        } else {
          setShowWin(true);
        }
      }
    },
    [cancelObsoleteTimers, dispatch, playerName, pushLog, recordStableSnapshot, scheduleUiTimer, setAwaitingRoll],
  );

  const switchTurn = useCallback(
    (fromPlayer?: number) => {
      const nextState = dispatch({
        type: 'SWITCH_TURN',
        fromPlayer,
      });

      const snap = recordStableSnapshot(nextState);
      const { isOnline, isHost, onTurnSettled } = optionsRef.current;
      if (isOnline && isHost) {
        onTurnSettled?.(snap);
      }

      // If a checkpoint arrived during this turn's animation, safely reconcile now
      if (pendingCheckpoint.current) {
        const cp = pendingCheckpoint.current;
        pendingCheckpoint.current = null;
        applyCheckpoint(cp);
      }
    },
    [applyCheckpoint, dispatch, recordStableSnapshot],
  );

  const finishTurn = useCallback(
    (player: number, v: number, txId: number) => {
      const g = gs.current;
      if (g.mode !== 'playing') return;

      if (g.pos[player] === 100) {
        const nextState = dispatch({
          type: 'GAME_OVER',
          winner: player,
          txId,
        });

        pushLog(`🏆 ${playerName(player)} conquered square 100 and WON THE GAME!`, 'event');
        sfx.win();
        spawnConfetti(nextState.particles);
        spawnFirework(nextState.particles, 520, 200);

        scheduleUiTimer(500, () => {
          if (gs.current.mode === 'over') {
            spawnConfetti(gs.current.particles);
            spawnFirework(gs.current.particles, 300, 300);
          }
        });
        scheduleUiTimer(1100, () => {
          if (gs.current.mode === 'over') {
            spawnConfetti(gs.current.particles);
            spawnFirework(gs.current.particles, 740, 260);
          }
        });
        scheduleUiTimer(1500, () => {
          if (gs.current.mode === 'over') {
            setShowWin(true);
          }
        });

        if (pendingCheckpoint.current) {
          pendingCheckpoint.current = null;
        }

        const snap = recordStableSnapshot(nextState);
        const { isOnline, isHost, onTurnSettled } = optionsRef.current;
        if (isOnline && isHost) {
          onTurnSettled?.(snap);
        }
        return;
      }

      if (v === 6) {
        dispatch({
          type: 'START_LUCKY_SIX_WAIT',
          txId,
          player,
        });
        showToast('LUCKY SIX!', `${playerName(player)} earns an extra roll!`, 'gold');
        sfx.ding();
        const cfg = SPEEDS[g.speed];

        scheduleGameTimer('waiting', cfg.settleMs + 350, 'waiting', () => {
          const nextState = dispatch({
            type: 'FINISH_LUCKY_SIX_WAIT',
            txId,
            expectedPhase: 'waiting',
            player,
          });

          const snap = recordStableSnapshot(nextState);
          const { isOnline, isHost, onTurnSettled } = optionsRef.current;
          if (isOnline && isHost) {
            onTurnSettled?.(snap);
          }

          if (pendingCheckpoint.current) {
            const cp = pendingCheckpoint.current;
            pendingCheckpoint.current = null;
            applyCheckpoint(cp);
          }
        });
      } else {
        switchTurn(player);
      }
    },
    [
      applyCheckpoint,
      dispatch,
      playerName,
      pushLog,
      recordStableSnapshot,
      scheduleGameTimer,
      scheduleUiTimer,
      showToast,
      switchTurn,
    ],
  );

  const afterMove = useCallback(
    (player: number, target: number, v: number, txId: number) => {
      const g = gs.current;
      const portal = PORTALS[target];
      const cfg = SPEEDS[g.speed];

      if (portal?.type === 'ladder') {
        const up = portal.to;
        const pts = LADDER_PATHS[target];
        const { cum, total } = pathCum(pts);
        const sliding: Sliding = {
          player,
          pts,
          cum,
          total,
          t0: performance.now() + 60,
          dur: cfg.slideMs,
          kind: 'ladder',
          from: target,
          to: up,
          roll: v,
        };
        dispatch({
          type: 'START_SLIDE',
          txId,
          player,
          sliding,
        });
        showToast('GOLDEN LADDER!', `Climbing ${target} ➔ ${up}!`, 'gold');
        pushLog(
          `🪜 ${playerName(player)} caught a ladder: ${target} ➔ ${up}`,
          `p${player}` as any,
        );
        sfx.ladder();
      } else if (portal?.type === 'snake') {
        const down = portal.to;
        const pts = SNAKE_PATHS[target];
        const { cum, total } = pathCum(pts);
        const sliding: Sliding = {
          player,
          pts,
          cum,
          total,
          t0: performance.now() + 60,
          dur: cfg.slideMs,
          kind: 'snake',
          from: target,
          to: down,
          roll: v,
        };
        dispatch({
          type: 'START_SLIDE',
          txId,
          player,
          sliding,
        });
        showToast('SNAKE BITE!', `Slithering down ${target} ➔ ${down}!`, 'red');
        pushLog(
          `🐍 ${playerName(player)} was bitten by a snake: ${target} ➔ ${down}`,
          `p${player}` as any,
        );
        sfx.snake();
      } else {
        // Normal square landing settle phase
        dispatch({
          type: 'START_SETTLING',
          txId,
          player,
        });
        sfx.land();
        const c = squareCenter(target);
        spawnDust(g.particles, c.x, c.y);

        scheduleGameTimer('settle', cfg.settleMs, 'settling', () => {
          dispatch({
            type: 'SETTLE_COMPLETE',
            txId,
            expectedPhase: 'settling',
            player,
            roll: v,
          });
          finishTurn(player, v, txId);
        });
      }
    },
    [dispatch, finishTurn, playerName, pushLog, scheduleGameTimer, showToast],
  );

  const resolveRoll = useCallback(
    (player: number, v: number, txId: number) => {
      const g = gs.current;
      const pos = g.pos[player];

      if (pos + v > 100) {
        if (g.winRule === 'bounce') {
          // Bounce back rule
          const overshoot = pos + v - 100;
          const bounceTarget = 100 - overshoot;
          const steps: Pt[] = [];

          for (let s = pos + 1; s <= 100; s++) steps.push(squareCenter(s));
          for (let s = 99; s >= bounceTarget; s--) steps.push(squareCenter(s));

          showToast('BOUNCED BACK!', `Overshot 100 ➔ bounced to ${bounceTarget}`, 'pink');
          sfx.buzz();
          pushLog(
            `↩️ ${playerName(player)} overshot 100 and bounced back to square ${bounceTarget}`,
            'event',
          );

          dispatch({
            type: 'START_MOVE',
            txId,
            player,
            steps,
            target: bounceTarget,
            roll: v,
          });
          return;
        } else {
          // Exact roll required
          if (v === 6) {
            dispatch({
              type: 'START_LUCKY_SIX_WAIT',
              txId,
              player,
            });
            showToast('LUCKY SIX!', `Can't move (need ${100 - pos}), but ${playerName(player)} earns an extra roll!`, 'gold');
            pushLog(
              `🎲 ${playerName(player)} rolled a 6 on square ${pos} (needs ${100 - pos}) — earns an extra roll!`,
              'event',
            );
            sfx.ding();
            const cfg = SPEEDS[g.speed];

            scheduleGameTimer('waiting', cfg.settleMs + 650, 'waiting', () => {
              const nextState = dispatch({
                type: 'FINISH_LUCKY_SIX_WAIT',
                txId,
                expectedPhase: 'waiting',
                player,
              });

              const snap = recordStableSnapshot(nextState);
              const { isOnline, isHost, onTurnSettled } = optionsRef.current;
              if (isOnline && isHost) {
                onTurnSettled?.(snap);
              }

              if (pendingCheckpoint.current) {
                const cp = pendingCheckpoint.current;
                pendingCheckpoint.current = null;
                applyCheckpoint(cp);
              }
            });
            return;
          }

          // Exact roll required (not a 6)
          dispatch({
            type: 'START_PASS_WAIT',
            txId,
            player,
          });
          showToast('NEED EXACT ROLL', `Must land on 100 exactly (need ${100 - pos})`, 'info');
          pushLog(
            `⚠️ ${playerName(player)} needs exactly ${100 - pos} to win — turn passed`,
            'event',
          );
          sfx.buzz();
          const cfg = SPEEDS[g.speed];

          scheduleGameTimer('waiting', cfg.settleMs + 650, 'waiting', () => {
            const nextState = dispatch({
              type: 'FINISH_PASS_WAIT',
              txId,
              expectedPhase: 'waiting',
              player,
            });

            const snap = recordStableSnapshot(nextState);
            const { isOnline, isHost, onTurnSettled } = optionsRef.current;
            if (isOnline && isHost) {
              onTurnSettled?.(snap);
            }

            if (pendingCheckpoint.current) {
              const cp = pendingCheckpoint.current;
              pendingCheckpoint.current = null;
              applyCheckpoint(cp);
            }
          });
          return;
        }
      }

      const target = pos + v;
      const steps: Pt[] = [];
      for (let s = pos + 1; s <= target; s++) steps.push(squareCenter(s));

      dispatch({
        type: 'START_MOVE',
        txId,
        player,
        steps,
        target,
        roll: v,
      });
    },
    [
      applyCheckpoint,
      dispatch,
      playerName,
      pushLog,
      recordStableSnapshot,
      scheduleGameTimer,
      showToast,
    ],
  );

  const doRoll = useCallback(
    (isAI = false) => {
      if (gs.current.mode !== 'playing') return;

      // Self-heal: If rolling flag is stuck but no roll timer is executing, clear it.
      // NOTE: `dispatch` replaces `gs.current` with a NEW object, so the live state
      // must be re-read afterwards — otherwise the guard below reads the pre-heal
      // snapshot and bails out, leaving the roll button permanently dead.
      if (gs.current.rolling && !activeTimers.current.has('roll')) {
        dispatch({ type: 'CLEAR_ROLLING' });
      }

      const g = gs.current;
      if (g.phase !== 'idle' || g.rolling) return;

      const { isOnline, isOnlineMatch, isPaused, isHost, onlineSlot, onLocalRoll } = optionsRef.current;
      if (isPaused) return;
      if (isOnlineMatch && !isOnline) return;

      const currPlayer = g.players[g.turn];
      if (currPlayer?.isCpu && !isAI) return;

      // In online mode, human player can only roll on their assigned slot
      if (isOnline && !currPlayer?.isCpu && currPlayer?.slotIndex !== onlineSlot) return;

      // In online mode, guest asks host for authoritative roll.
      // Guard against spamming the host while a request is already in flight.
      if (isOnline && !isHost) {
        if (awaitingRemoteRollRef.current) return;
        setAwaitingRoll(true);
        onLocalRoll?.(0, currPlayer?.slotIndex ?? g.turn);
        return;
      }

      const activeTurn = g.turn;
      const v = 1 + Math.floor(Math.random() * 6);

      // Start roll via reducer (increments txId!)
      const nextState = dispatch({
        type: 'START_ROLL',
        player: activeTurn,
        roll: v,
      });

      // Broadcast to network if online
      if (isOnline) {
        onLocalRoll?.(v, currPlayer?.slotIndex ?? activeTurn);
      }

      sfx.roll();
      const cfg = SPEEDS[nextState.speed];

      scheduleGameTimer('roll', cfg.rollMs, 'rolling', () => {
        dispatch({
          type: 'ROLL_LANDED',
          txId: nextState.txId,
          expectedPhase: 'rolling',
          player: activeTurn,
          roll: v,
        });

        // Log the roll precisely when it lands!
        pushLog(
          `🎲 ${playerName(activeTurn)} rolled a ${v}`,
          `p${activeTurn}` as any,
        );

        resolveRoll(activeTurn, v, nextState.txId);
      });
    },
    [dispatch, playerName, pushLog, resolveRoll, scheduleGameTimer, setAwaitingRoll],
  );

  /* Trigger roll coming from a remote network peer */
  const doRemoteRoll = useCallback(
    (v: number, playerSlotIndex?: number) => {
      if (gs.current.mode !== 'playing') return;

      // Self-heal: clear a stuck rolling flag (re-read live state after dispatch)
      if (gs.current.rolling && !activeTimers.current.has('roll')) {
        dispatch({ type: 'CLEAR_ROLLING' });
      }

      const g = gs.current;
      // The host broadcasts slot indexes, never dense roster indexes. Resolving via
      // `slotToIndex` only avoids moving the wrong token for sparse rosters
      // (e.g. slots [0,2,3] where slot 2 must not be read as roster index 2).
      let activeTurn = g.turn;
      if (typeof playerSlotIndex === 'number') {
        const idx = slotToIndex(playerSlotIndex, g.players);
        if (idx >= 0) {
          activeTurn = idx;
        } else if (playerSlotIndex >= 0 && playerSlotIndex < g.players.length) {
          activeTurn = playerSlotIndex;
        }
      }

      // The authoritative roll arrived: stop waiting on the host.
      setAwaitingRoll(false);

      // Start roll via reducer (increments txId!)
      const nextState = dispatch({
        type: 'START_ROLL',
        player: activeTurn,
        roll: v,
      });

      sfx.roll();
      const cfg = SPEEDS[nextState.speed];

      scheduleGameTimer('roll', cfg.rollMs, 'rolling', () => {
        dispatch({
          type: 'ROLL_LANDED',
          txId: nextState.txId,
          expectedPhase: 'rolling',
          player: activeTurn,
          roll: v,
        });

        pushLog(
          `🎲 ${playerName(activeTurn)} rolled a ${v}`,
          `p${activeTurn}` as any,
        );

        resolveRoll(activeTurn, v, nextState.txId);
      });
    },
    [dispatch, playerName, pushLog, resolveRoll, scheduleGameTimer, setAwaitingRoll],
  );

  /**
   * Live roll authority for the host.
   *
   * `getSnapshot()` intentionally reports the last *stable* checkpoint (so
   * reconnecting peers never observe half-finished animations), which means its
   * `phase` reads `idle` even while a turn is still resolving. The host must
   * therefore use this live view to reject duplicate / out-of-turn ROLL_REQUESTs.
   */
  const getRollAuthority = useCallback(() => {
    const g = gs.current;
    const activePlayer = g.players[g.turn];
    if (!activePlayer) return undefined;
    return {
      turnSlot: activePlayer.slotIndex,
      isPlaying: g.mode === 'playing',
      isAwaitingRoll: g.mode === 'playing' && g.phase === 'idle' && !g.rolling,
    };
  }, []);

  /* Synchronize full game state from authoritative host checkpoint */
  const syncFromCheckpoint = useCallback(
    (checkpoint: CheckpointData) => {
      const g = gs.current;

      // 1. Reject duplicate or out-of-order state versions
      if (
        checkpoint.stateVersion !== undefined &&
        g.stateVersion !== undefined &&
        checkpoint.stateVersion <= g.stateVersion
      ) {
        return;
      }

      const isTerminal = isTerminalCheckpoint(checkpoint);
      const isStable = isStablePhase(g.phase);

      // 2. Requirement 4: Defer or reject checkpoints during every non-stable phase, including settling and waiting
      if (!isTerminal && !isStable) {
        if (
          !pendingCheckpoint.current ||
          (checkpoint.stateVersion ?? 0) >= (pendingCheckpoint.current.stateVersion ?? 0)
        ) {
          pendingCheckpoint.current = checkpoint;
        }
        return;
      }

      applyCheckpoint(checkpoint);
    },
    [applyCheckpoint],
  );

  /* Reconnect safely from stable state (Requirement 9) */
  const reconnectGame = useCallback(
    (
      players: PlayerConfig[],
      speed: GameSpeed,
      winRule: WinRule,
      checkpoint?: CheckpointData,
    ) => {
      cancelObsoleteTimers();
      pendingCheckpoint.current = null;
      setAwaitingRoll(false);

      const nextState = dispatch({
        type: 'RECONNECT',
        players,
        speed,
        winRule,
        checkpoint,
      });

      recordStableSnapshot(nextState);

      if (nextState.mode === 'over' && nextState.winner >= 0) {
        setShowWin(true);
      } else {
        setShowWin(false);
      }

      setConfirmAction(null);
    },
    [cancelObsoleteTimers, dispatch, recordStableSnapshot, setAwaitingRoll],
  );

  /* Trigger floating emoji above player's token */
  const triggerEmote = useCallback((player: number, emoji: string) => {
    const g = gs.current;
    let p = slotToIndex(player, g.players);
    if (p === -1) {
      p = Math.max(0, Math.min(g.players.length - 1, player));
    }
    const pos = g.pos[p] || 0;
    const c = pos === 0 ? (START_POS[p] || { x: 251, y: 1017 }) : squareCenter(pos);
    sfx.pop();
    if (g.emotes.length >= 10) {
      g.emotes.shift();
    }
    g.emotes.push({
      id: Math.random(),
      player: p,
      emoji,
      x: c.x + (Math.random() - 0.5) * 24,
      y: c.y - 12,
      vy: -55,
      life: 1.8,
      maxLife: 1.8,
    });
  }, []);

  /* ---------- AI Turn Handling ---------- */

  useEffect(() => {
    if (hud.mode !== 'playing' || hud.phase !== 'idle') return;
    const currPlayer = hud.players[hud.turn];
    if (!currPlayer?.isCpu) return;

    // In online matches, only the Host executes CPU bot moves
    if (isOnline && !isHost) return;

    const cfg = SPEEDS[hud.speed];
    scheduleGameTimer('ai', cfg.aiDelayMs, 'idle', () => {
      doRoll(true);
    });
  }, [hud.mode, hud.players, hud.turn, hud.phase, hud.speed, doRoll, isOnline, isHost, scheduleGameTimer]);

  /* ---------- Keyboard Shortcuts ---------- */

  const doRollRef = useRef(doRoll);
  doRollRef.current = doRoll;
  const startRef = useRef(startGame);
  startRef.current = startGame;
  const muteRef = useRef(toggleMute);
  muteRef.current = toggleMute;
  const speedRef = useRef(setSpeed);
  speedRef.current = setSpeed;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest?.('[contenteditable="true"]') ||
          target.closest?.('[role="dialog"]') ||
          target.closest?.('dialog'))
      ) {
        return;
      }
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], dialog')) {
        return;
      }
      if (confirmAction !== null) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        if (gs.current.mode === 'menu') {
          // Handled centrally in App.tsx to honor StartScreen selected settings
          return;
        }
        if (gs.current.mode === 'over') {
          // Prevent non-host winner screens from restarting through Space
          if (optionsRef.current.isOnline && !optionsRef.current.isHost) return;
          e.preventDefault();
          startRef.current(gs.current.players, gs.current.speed, gs.current.winRule);
        } else {
          e.preventDefault();
          doRollRef.current();
        }
      } else if (e.code === 'KeyM') {
        muteRef.current();
      } else if (e.code === 'KeyS') {
        // Locked during active online matches
        if (optionsRef.current.isOnline && gs.current.mode === 'playing') return;
        const nextSpeed: Record<GameSpeed, GameSpeed> = {
          normal: 'fast',
          fast: 'turbo',
          turbo: 'normal',
        };
        speedRef.current(nextSpeed[gs.current.speed]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmAction]);

  /* ---------- Resize + Board Pre-render ---------- */

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (hud.mode === 'menu') return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let touchTimer = 0;
    let resizeRaf = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const size = Math.floor(Math.min(rect.width, rect.height));
      if (size < 20) return;

      const MAX_CANVAS_PIXELS = 2048 * 2048; // 4.19M pixels maximum canvas budget
      let dpr = Math.min(2.5, window.devicePixelRatio || 1);
      if (size * dpr * size * dpr > MAX_CANVAS_PIXELS) {
        dpr = Math.sqrt(MAX_CANVAS_PIXELS) / size;
      }
      const targetPx = Math.round(size * dpr);
      const sizeChanged = sizeRef.current !== size || canvas.width !== targetPx;

      sizeRef.current = size;
      canvas.width = targetPx;
      canvas.height = targetPx;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctxRef.current = canvas.getContext('2d');

      if (sizeChanged) {
        renderBoardLayer();
      }
    };

    const debouncedResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(resize);
    };

    resize();
    const ro = new ResizeObserver(debouncedResize);
    ro.observe(wrap);

    let alive = true;
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (alive) renderBoardLayer();
      });
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const lx = ((e.clientX - rect.left) / rect.width) * LOGICAL;
      const ly = ((e.clientY - rect.top) / rect.height) * LOGICAL;
      const sq = squareFromPoint(lx, ly);
      const val = sq ?? undefined;
      if (gs.current.hoveredSquare !== val) {
        gs.current.hoveredSquare = val;
        setHoveredSquare(val);
      }

      // If pointer is touch, auto-clear inspection badge after 2.5s
      if (e.pointerType === 'touch' && val !== undefined) {
        window.clearTimeout(touchTimer);
        touchTimer = window.setTimeout(() => {
          gs.current.hoveredSquare = undefined;
          setHoveredSquare(undefined);
        }, 2500);
      }
    };

    const onPointerLeave = () => {
      window.clearTimeout(touchTimer);
      if (gs.current.hoveredSquare !== undefined) {
        gs.current.hoveredSquare = undefined;
        setHoveredSquare(undefined);
      }
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    return () => {
      alive = false;
      window.clearTimeout(touchTimer);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [hud.mode, renderBoardLayer]);

  /* ---------- Main Loop + Drawing ---------- */

  const tokenPoint = useCallback(
    (p: number, now: number): { x: number; y: number; hopRatio: number } => {
      const g = gs.current;
      const cfg = SPEEDS[g.speed];
      const player = g.players[p];
      const slotIndex = player ? player.slotIndex : p;
      const dockPos = START_POS[slotIndex] ?? START_POS[p % START_POS.length];

      if ((g.moving && g.moving.player === p) || (g.sliding && g.sliding.player === p)) {
        if (g.moving && g.moving.player === p) {
          const m = g.moving;
          const el = now - m.t0;
          if (el >= 0) {
            const i = Math.min(m.steps.length - 1, Math.floor(el / cfg.hopMs));
            const f = clamp((el - i * cfg.hopMs) / cfg.hopMs, 0, 1);
            const from =
              i === 0
                ? m.base <= 0
                  ? dockPos
                  : squareCenter(m.base)
                : m.steps[i - 1];
            const to = m.steps[i];
            const hop = Math.sin(Math.PI * f);
            return {
              x: lerp(from.x, to.x, f),
              y: lerp(from.y, to.y, f) - hop * 30,
              hopRatio: hop,
            };
          }
        } else if (g.sliding && g.sliding.player === p) {
          const sl = g.sliding;
          const f = easeInOutCubic(clamp((now - sl.t0) / sl.dur, 0, 1));
          if (sl.kind === 'snake') {
            const pt = getSnakeSlidePoint(sl.from, sl.to, f, g.time, true);
            return { x: pt.x, y: pt.y, hopRatio: 0 };
          }
          const pt = pointAt(sl.pts, sl.cum, f * sl.total);
          return { x: pt.x, y: pt.y, hopRatio: 0 };
        }
      }

      const n = g.pos[p];
      if (n <= 0) return { x: dockPos.x, y: dockPos.y, hopRatio: 0 };

      const c = squareCenter(n);
      // Multi-token arrangement on the same square
      const sharing: number[] = [];
      for (let i = 0; i < g.players.length; i++) {
        if (g.pos[i] === n) sharing.push(i);
      }

      const slotIdx = sharing.indexOf(p);
      const offset = getTokenSlotOffset(slotIdx, sharing.length);

      return { x: c.x + offset.x, y: c.y + offset.y, hopRatio: 0 };
    },
    [],
  );

  useEffect(() => {
    if (hud.mode === 'menu') return;
    let raf = 0;
    let last = performance.now();

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      } else {
        last = performance.now();
        if (!raf) {
          raf = requestAnimationFrame(step);
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    const draw = () => {
      const canvas = canvasRef.current;
      const bLayer = boardLayer.current;
      const nLayer = numberLayer.current;
      if (!canvas || !bLayer || canvas.width < 10) return;
      const ctx = ctxRef.current || canvas.getContext('2d');
      if (!ctx) return;
      if (!ctxRef.current) ctxRef.current = ctx;
      const g = gs.current;
      const w = canvas.width;
      const s = w / LOGICAL;

      let ox = 0;
      let oy = 0;
      if (g.shake > 0.4) {
        ox = (Math.random() - 0.5) * g.shake * s;
        oy = (Math.random() - 0.5) * g.shake * s;
      }

      // 1. Draw static board layer 1:1 pixel crisp with zero double-sampling blur
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bLayer, ox, oy);

      // 2. Switch to logical coordinate space for animated elements
      ctx.setTransform(s, 0, 0, s, ox, oy);

      // 3. Draw animated living snakes (slither waves, breathing, eye blinking, flicking tongue, strike reaction)
      const activeSnakeHead = g.sliding?.kind === 'snake' ? g.sliding.from : undefined;
      drawAnimatedSnakes(ctx, g.time, activeSnakeHead, themeRef.current);

      // 4. Blit numbers & badges layer strictly ON TOP of the animated snakes!
      if (nLayer) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(nLayer, ox, oy);
        ctx.setTransform(s, 0, 0, s, ox, oy);
      }

      const now = g.time * 1000;

      // Active player square pulsing highlight
      if (
        g.mode === 'playing' &&
        (g.phase === 'idle' || g.phase === 'rolling' || g.phase === 'waiting')
      ) {
        const p = g.turn;
        const n = g.pos[p];
        if (n > 0) {
          const c = squareCenter(n);
          const pal = PLAYER_COLORS[g.players[p]?.colorId ?? p];
          const pulse = 0.5 + 0.35 * Math.sin(g.time * 5);
          ctx.save();
          ctx.strokeStyle = pal.base;
          ctx.globalAlpha = pulse;
          ctx.lineWidth = 5;
          ctx.shadowColor = pal.base;
          ctx.shadowBlur = 18;
          roundRectPath(ctx, c.x - CELL / 2 + 5, c.y - CELL / 2 + 5, CELL - 10, CELL - 10, 12);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Projected landing preview
      if (g.targetSquare && (g.phase === 'rolling' || g.phase === 'moving')) {
        const pal = PLAYER_COLORS[g.players[g.turn]?.colorId ?? g.turn];
        drawTargetHighlight(ctx, g.targetSquare, pal.base, g.time);
      }

      // Hovered square inspection highlight
      if (g.hoveredSquare && g.hoveredSquare !== g.targetSquare) {
        drawHoverHighlight(ctx, g.hoveredSquare, g.time);
      }

      // Square 100 Finish Line ambient beacon
      if (g.mode === 'playing') {
        const c100 = squareCenter(100);
        const beaconAccent = themeRef.current.ui.accent;
        const pulse = 0.35 + 0.25 * Math.sin(g.time * 3.5);
        ctx.save();
        ctx.strokeStyle = beaconAccent;
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = beaconAccent;
        ctx.shadowBlur = 14;
        roundRectPath(ctx, c100.x - CELL / 2 + 3, c100.y - CELL / 2 + 3, CELL - 6, CELL - 6, 8);
        ctx.stroke();
        ctx.restore();
      }

      // Draw tokens (inactive tokens first, active on top)
      const order = Array.from({ length: g.players.length }, (_, i) => i).sort(
        (a, b) => (a === g.turn ? 1 : 0) - (b === g.turn ? 1 : 0),
      );

      for (const p of order) {
        const tp = tokenPoint(p, now);
        const idleBob =
          g.phase === 'idle' || g.phase === 'rolling' || g.phase === 'over'
            ? Math.sin(g.time * 2.6 + p * 1.5) * 2.2
            : 0;
        const r = 22 * (1 + 0.22 * tp.hopRatio);
        const pal = PLAYER_COLORS[g.players[p]?.colorId ?? p];
        const slotIndex = g.players[p]?.slotIndex ?? p;
        drawToken(ctx, tp.x, tp.y + idleBob, r, pal, String(slotIndex + 1), tp.hopRatio);
      }

      drawParticles(ctx, g.particles);

      // Draw floating reaction emotes
      for (const em of g.emotes) {
        const progress = em.life / em.maxLife;
        const alpha = Math.min(1, progress * 2.2);
        const popScale = progress > 0.8 ? 1 + (1 - progress) * 2 : 1;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${Math.round(36 * popScale)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 10;
        ctx.fillText(em.emoji, em.x, em.y);
        ctx.restore();
      }
    };

    const step = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const g = gs.current;
      g.time = now / 1000;
      const cfg = SPEEDS[g.speed];

      /* Hopping steps */
      if (g.moving) {
        const m = g.moving;
        const el = now - m.t0;
        if (el >= 0) {
          const idx = Math.min(m.steps.length, Math.floor(el / cfg.hopMs));
          const missedHops = idx - m.idx;
          let played = 0;
          while (m.idx < idx) {
            m.idx += 1;
            // Intermediate pos for HUD
            const curStep = m.steps[m.idx - 1];
            // Only play hop sound if not catching up excessively from a background tab
            if (missedHops <= 2 || played < 1 || m.idx === idx) {
              sfx.hop(m.idx - 1);
              played++;
            }
            spawnDust(g.particles, curStep.x, curStep.y);
          }
          if (m.idx >= m.steps.length) {
            const movingPlayer = m.player;
            const target = m.finalTarget;
            const roll = m.finalRoll;
            const txId = g.txId;
            dispatch({
              type: 'FINISH_MOVE',
              txId,
              player: movingPlayer,
              target,
            });
            afterMove(movingPlayer, target, roll, txId);
          }
        }
      }

      /* Sliding down snakes / up ladders */
      if (g.sliding) {
        const sl = g.sliding;
        const f = (now - sl.t0) / sl.dur;
        if (f >= 1) {
          const slidingPlayer = sl.player;
          const to = sl.to;
          const roll = sl.roll;
          const txId = g.txId;
          dispatch({
            type: 'FINISH_SLIDE',
            txId,
            player: slidingPlayer,
            to,
          });
          if (sl.kind === 'snake') {
            g.shake = 14;
            sfx.hit();
            const c = squareCenter(sl.to);
            spawnDust(g.particles, c.x, c.y);
            for (let i = 0; i < 9; i++) spawnSpark(g.particles, c.x, c.y, '#f87171');
          } else {
            sfx.ding();
            const c = squareCenter(sl.to);
            for (let i = 0; i < 9; i++) spawnSpark(g.particles, c.x, c.y, '#fde047');
          }
          finishTurn(slidingPlayer, roll, txId);
        } else if (f > 0) {
          const f2 = easeInOutCubic(clamp(f, 0, 1));
          const pt = sl.kind === 'snake'
            ? getSnakeSlidePoint(sl.from, sl.to, f2, g.time, true)
            : pointAt(sl.pts, sl.cum, f2 * sl.total);
          if (Math.random() < 0.65) {
            spawnSpark(g.particles, pt.x, pt.y, sl.kind === 'ladder' ? '#ffd75e' : '#f87171');
          }
        }
      }

      // Bound particles to avoid unbounded memory growth
      if (g.particles.length > 60) {
        g.particles.splice(0, g.particles.length - 60);
      }
      updateParticles(g.particles, dt / 1000);

      // Bound and update floating emotes
      if (g.emotes.length > 10) {
        g.emotes.splice(0, g.emotes.length - 10);
      }
      for (let i = g.emotes.length - 1; i >= 0; i--) {
        const em = g.emotes[i];
        em.life -= dt / 1000;
        em.y += em.vy * (dt / 1000);
        if (em.life <= 0) {
          g.emotes.splice(i, 1);
        }
      }

      g.shake *= Math.pow(0.88, dt / 16.7);
      if (g.shake < 0.4) g.shake = 0;

      draw();

      if (!document.hidden && gs.current.mode !== 'menu') {
        raf = requestAnimationFrame(step);
      }
    };

    raf = requestAnimationFrame(step);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [afterMove, dispatch, finishTurn, hud.mode, tokenPoint]);

  const canRoll: boolean =
    hud.mode === 'playing' &&
    (hud.phase === 'idle' || (hud.phase === 'rolling' && !activeTimers.current.has('roll'))) &&
    (!hud.rolling || !activeTimers.current.has('roll')) &&
    !awaitingRemoteRoll &&
    !optionsRef.current.isPaused &&
    (!optionsRef.current.isOnlineMatch || !!optionsRef.current.isOnline) &&
    (isOnline ? hud.players[hud.turn]?.slotIndex === onlineSlot : true) &&
    !hud.players[hud.turn]?.isCpu;

  const requestRestart = useCallback(() => {
    clearHover();
    if (hud.mode === 'playing') {
      setConfirmAction('restart');
    } else {
      startGame(hud.players, hud.speed, hud.winRule);
    }
  }, [clearHover, hud.mode, hud.players, hud.speed, hud.winRule, startGame]);

  const requestMenu = useCallback(() => {
    if (hud.mode === 'playing') {
      setConfirmAction('menu');
    } else {
      backToMenu();
    }
  }, [backToMenu, hud.mode]);

  const confirmPending = useCallback(() => {
    if (confirmAction === 'restart') {
      startGame(hud.players, hud.speed, hud.winRule);
    } else if (confirmAction === 'menu') {
      backToMenu();
    }
    setConfirmAction(null);
  }, [backToMenu, confirmAction, hud.players, hud.speed, hud.winRule, startGame]);

  const cancelPending = useCallback(() => {
    setConfirmAction(null);
  }, []);

  const getSnapshot = useCallback((): GameStateSnapshot => {
    const s = gs.current;
    if (lastStableSnapshot.current && isNonStablePhase(s.phase)) {
      return { ...lastStableSnapshot.current };
    }

    const checkpointMode: CheckpointMode =
      s.winner >= 0 || s.mode === 'over'
        ? 'over'
        : s.mode === 'playing'
        ? 'playing'
        : 'idle';

    const stablePhase = s.winner >= 0 || s.mode === 'over' ? 'over' : 'idle';

    return {
      mode: checkpointMode,
      pos: [...s.pos],
      turn: s.turn,
      phase: isStablePhase(s.phase) ? s.phase : stablePhase,
      rolls: [...s.rolls],
      laddersHit: [...s.laddersHit],
      snakesHit: [...s.snakesHit],
      sixesHit: [...s.sixesHit],
      winner: s.winner,
      isPlaying: s.mode === 'playing',
    };
  }, []);

  const updatePlayers = useCallback((players: PlayerConfig[]) => {
    dispatch({ type: 'UPDATE_PLAYERS', players });
  }, [dispatch]);

  const cpuTakeover = useCallback((slotIndex: number, name?: string) => {
    dispatch({ type: 'CPU_TAKEOVER', slotIndex, name });
  }, [dispatch]);

  const reconnectPlayer = useCallback((slotIndex: number, name?: string) => {
    dispatch({ type: 'PLAYER_RECONNECT', slotIndex, name });
  }, [dispatch]);

  const removePlayer = useCallback((slotIndex: number) => {
    dispatch({ type: 'REMOVE_PLAYER', slotIndex });
  }, [dispatch]);

  const getSlotRosterIndex = useCallback((slotIndex: number) => {
    return slotToIndex(slotIndex, gs.current.players);
  }, []);

  return {
    canvasRef,
    wrapRef,
    hud,
    toast,
    log,
    muted,
    showWin,
    canRoll,
    awaitingRemoteRoll,
    confirmAction,
    hoveredSquare,
    theme: THEMES[themeId] || THEMES.jungle,
    themeId,
    setTheme,
    playerName,
    playerPalette,
    startGame,
    reconnectGame,
    updatePlayers,
    cpuTakeover,
    reconnectPlayer,
    removePlayer,
    getSlotRosterIndex,
    getRollAuthority,
    doRoll,
    doRemoteRoll,
    syncFromCheckpoint,
    triggerEmote,
    backToMenu,
    toggleMute,
    setSpeed,
    setWinRule,
    requestRestart,
    requestMenu,
    confirmPending,
    cancelPending,
    showToast,
    getSnapshot,
  };
}

