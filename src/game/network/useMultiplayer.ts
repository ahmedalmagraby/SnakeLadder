import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSpeed, WinRule } from '../constants';
import type { PlayerConfig } from '../useGame';
import { generateRoomCode, peerManager } from './peerManager';
import {
  clearSession,
  detachSession,
  getOrCreatePlayerId,
  getSavedSession,
  markSessionFinished,
  reactivateSession,
  saveSession,
  touchSession,
  type SavedSession,
} from './sessionStorage';
import {
  MAX_PLAYERS,
  MIN_EMOTE_INTERVAL_MS,
  PROTOCOL_VERSION,
  type AuthStatus,
  type CheckpointMode,
  type ConnectionStatus,
  type GameLifecycleStatus,
  type GameStateSnapshot,
  type NetworkPlayer,
  type Packet,
  type RoomMembership,
  type RollRejectReason,
  type TransportStatus,
} from './types';
import {
  isCompatibleProtocolVersion,
  isValidEmoji,
  isValidNetworkPlayer,
  stripCpuSuffix,
} from './validation';

function generateSecureToken(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return (crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).slice(2)).slice(0, 32);
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  }
  return 'tok_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function generateRequestId(prefix = 'req'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;}

/* (P1) ROLL_REQUEST flood control. See `consumeRollToken`. */
const ROLL_BUCKET_CAPACITY = 6;
const ROLL_BUCKET_REFILL_PER_SEC = 2;

/**
 * (P1) Constant-time string comparison for reconnect tokens.
 *
 * The check used to be `expectedToken !== packet.reconnectToken`, which exits
 * at the first differing character and so leaks the token's common prefix
 * through response timing.
 *
 * `crypto.subtle` is unavailable in non-secure contexts, and this app is
 * explicitly playable over plain-http LAN URLs, so a WebCrypto HMAC is not an
 * option. This is a small local XOR accumulator, which is the standard fix and
 * needs no platform support.
 *
 * Practical note: over a WebRTC data channel the timing signal is tiny, so this
 * is defence in depth rather than the fix for a live exploit - but the token is
 * the sole bearer credential for a seat, and "we compared it in constant time"
 * should be a property of the code rather than an accident.
 */
function tokensEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Length is not secret: tokens are always the same minted length.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export interface UseMultiplayerProps {
  onGameStart?: (players: PlayerConfig[], speed: GameSpeed, winRule: WinRule) => void;
  onRemoteRoll?: (player: number, roll: number) => void;
  onSyncCheckpoint?: (checkpoint: {
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
  }) => void;
  onEmoteReceived?: (player: number, emoji: string) => void;
  onPlayerDisconnected?: (slotIndex: number, name: string) => void;
  onPlayerReconnected?: (slotIndex: number, name: string) => void;
  onPlayersUpdated?: (players: PlayerConfig[]) => void;
  onReconnected?: (
    players: PlayerConfig[],
    speed: GameSpeed,
    winRule: WinRule,
    gameState?: GameStateSnapshot,
  ) => void;
  getGameStateSnapshot?: () => GameStateSnapshot | undefined;
  /**
   * Live view of whose turn it is and whether the local game is actually waiting
   * for a roll. Required for correct host-side duplicate/out-of-turn rejection,
   * because `getGameStateSnapshot` intentionally reports the last *stable* state.
   */
  getRollAuthority?: () => { turnSlot: number; isPlaying: boolean; isAwaitingRoll: boolean } | undefined;
  /**
   * (P0) Called when the host refuses a roll this guest requested. The guest
   * must release its `awaitingRemoteRoll` latch here, otherwise the roll button
   * stays disabled for the remainder of the match.
   */
  onRollRejected?: (reason: RollRejectReason) => void;
}

export function useMultiplayer({
  onGameStart,
  onRemoteRoll,
  onSyncCheckpoint,
  onEmoteReceived,
  onPlayerDisconnected,
  onPlayerReconnected,
  onPlayersUpdated,
  onReconnected,
  getGameStateSnapshot,
  getRollAuthority,
  onRollRejected,
}: UseMultiplayerProps = {}) {
  const [isOnline, setIsOnline] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [mySlot, setMySlot] = useState(0);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [players, setPlayers] = useState<NetworkPlayer[]>([]);
  const [speed, setSpeed] = useState<GameSpeed>('normal');
  const [winRule, setWinRule] = useState<WinRule>('exact');
  const [maxPlayers, setMaxPlayers] = useState<number>(4);
  const [ping, setPing] = useState(0);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(() => getSavedSession());

  // Separated lifecycle state
  const [transportStatus, setTransportStatus] = useState<TransportStatus>('disconnected');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unauthenticated');
  const [roomMembership, setRoomMembership] = useState<RoomMembership>('none');
  const [gameStatus, setGameStatus] = useState<GameLifecycleStatus>('none');
  const [isPaused, setIsPaused] = useState(false);

  const transportStatusRef = useRef<TransportStatus>('disconnected');
  const authStatusRef = useRef<AuthStatus>('unauthenticated');
  const roomMembershipRef = useRef<RoomMembership>('none');
  const gameStatusRef = useRef<GameLifecycleStatus>('none');
  const isPausedRef = useRef(false);

  transportStatusRef.current = transportStatus;
  authStatusRef.current = authStatus;
  roomMembershipRef.current = roomMembership;
  gameStatusRef.current = gameStatus;
  isPausedRef.current = isPaused;

  const reconnectAttemptRef = useRef<number>(0);
  const reconnectRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gracePeriodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimers = useCallback(() => {
    if (reconnectRetryTimerRef.current !== null) {
      clearTimeout(reconnectRetryTimerRef.current);
      reconnectRetryTimerRef.current = null;
    }
    if (gracePeriodTimerRef.current !== null) {
      clearTimeout(gracePeriodTimerRef.current);
      gracePeriodTimerRef.current = null;
    }
    reconnectAttemptRef.current = 0;
  }, []);

  // Protocol state versions and turn IDs
  const stateVersionRef = useRef<number>(1);
  const turnIdRef = useRef<number>(1);
  const lastSeenStateVersionRef = useRef<number>(0);
  const hasRolledForCurrentTurnRef = useRef<boolean>(false);

  // Host-only private state
  const slotTokensRef = useRef<Map<number, string>>(new Map()); // slotIndex -> reconnectToken
  const processedRequestIdsRef = useRef<Set<string>>(new Set());
  const lastEmoteTimeRef = useRef<Map<number, number>>(new Map());
  /* (P1) Per-peer token bucket for ROLL_REQUEST, keyed by peerId so one noisy
     guest cannot spend everyone else's budget. A turn is at most a few seconds
     long and a legitimate guest sends exactly one request per turn, so a
     modest burst with steady refill admits real play while making a flood
     loop pointless. See `consumeRollToken`. */
  const rollBucketsRef = useRef<Map<string, { tokens: number; last: number }>>(new Map());

  /**
   * (P1) Token bucket for ROLL_REQUEST. Returns false when the peer is over
   * budget, in which case the caller answers `rate-limited` and the guest
   * releases its `awaitingRemoteRoll` latch.
   */
  const consumeRollToken = useCallback((peerId: string): boolean => {
    const now = Date.now();
    const bucket = rollBucketsRef.current.get(peerId);
    if (!bucket) {
      rollBucketsRef.current.set(peerId, {
        tokens: ROLL_BUCKET_CAPACITY - 1,
        last: now,
      });
      return true;
    }
    const elapsed = now - bucket.last;
    bucket.last = now;
    // Refill at ROLL_BUCKET_REFILL_PER_SEC, capped at the burst capacity.
    bucket.tokens = Math.min(
      ROLL_BUCKET_CAPACITY,
      bucket.tokens + (elapsed / 1000) * ROLL_BUCKET_REFILL_PER_SEC,
    );
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }, []);

  // Keep references to state and callbacks for packet handlers
  const stateRef = useRef({
    isHost: false,
    players: [] as NetworkPlayer[],
    maxPlayers: 4,
    speed: 'normal' as GameSpeed,
    winRule: 'exact' as WinRule,
    mySlot: 0,
    roomCode: '',
  });

  const callbacksRef = useRef({
    onGameStart,
    onRemoteRoll,
    onSyncCheckpoint,
    onEmoteReceived,
    onPlayerDisconnected,
    onPlayerReconnected,
    onPlayersUpdated,
    onReconnected,
    getGameStateSnapshot,
    getRollAuthority,
    onRollRejected,
  });

  /* Synchronous mirror of the roster.
   * Packet handlers run outside React, so reading the `players` state captured on
   * the last render lets two near-simultaneous JOIN_REQUESTs allocate the SAME
   * slot. Every roster mutation must go through `commitPlayers`. */
  const playersRef = useRef<NetworkPlayer[]>([]);
  const commitPlayers = useCallback(
    (
      next: NetworkPlayer[] | ((curr: NetworkPlayer[]) => NetworkPlayer[]),
    ): NetworkPlayer[] => {
      const resolved = typeof next === 'function' ? next(playersRef.current) : next;
      playersRef.current = resolved;
      setPlayers(resolved);
      return resolved;
    },
    [],
  );

  stateRef.current = {
    isHost,
    players: playersRef.current,
    maxPlayers,
    speed,
    winRule,
    mySlot,
    roomCode,
  };

  callbacksRef.current = {
    onGameStart,
    onRemoteRoll,
    onSyncCheckpoint,
    onEmoteReceived,
    onPlayerDisconnected,
    onPlayerReconnected,
    onPlayersUpdated,
    onReconnected,
    getGameStateSnapshot,
    getRollAuthority,
    onRollRejected,
  };

  // Sync saved session state
  const refreshSavedSession = useCallback(() => {
    setSavedSession(getSavedSession());
  }, []);

  /* Listen to peer connection status */
  useEffect(() => {
    const unsubStatus = peerManager.onStatus((st, detail) => {
      setStatus(st);
      if (detail) setStatusDetail(detail);

      if (st === 'connected') {
        setIsOnline(true);
        setTransportStatus('connected');
        clearRetryTimers();
        if (isPausedRef.current) {
          setIsPaused(false);
          setGameStatus('playing');
        }
        setStatusDetail('');
      } else if (st === 'creating' || st === 'joining') {
        setTransportStatus('connecting');
      } else if (st === 'reconnecting') {
        setTransportStatus('reconnecting');
      } else if (st === 'disconnected' || st === 'error') {
        setIsOnline(false);
        setTransportStatus(st === 'error' ? 'failed' : 'disconnected');

        // Check if an active match was interrupted
        if (
          roomMembershipRef.current === 'joined' &&
          (gameStatusRef.current === 'playing' || gameStatusRef.current === 'paused')
        ) {
          if (!stateRef.current.isHost) {
            // Guest pauses match and attempts bounded exponential reconnect
            setIsPaused(true);
            setGameStatus('paused');
            setTransportStatus('reconnecting');

            // Start 20s grace period if not already running
            if (!gracePeriodTimerRef.current) {
              gracePeriodTimerRef.current = setTimeout(() => {
                console.warn('[useMultiplayer] 20s grace period expired: host unreachable');
                setIsPaused(false);
                setGameStatus('abandoned');
                setRoomMembership('left');
                setTransportStatus('failed');
                setAuthStatus('unauthenticated');
                /* (P1) Do NOT `clearSession()` here.
                 *
                 * This used to run on expiry, which deleted the guest's
                 * `reconnectToken` from storage. Re-hosting is a first-class
                 * flow, so a host who refreshed and came back 30s later found
                 * every guest had silently forgotten their seat: `canRejoinRoom`
                 * returned false, so they were re-admitted as brand-new players
                 * in different slots, or could not rejoin at all. Giving up on
                 * the *match* must not mean giving up on the player's *identity*.
                 *
                 * The claim is kept so the resume banner stays available. The
                 * guest is told plainly that the match ended, and the explicit
                 * "forget this room" control in the lobby remains the only way
                 * to discard it. */
                touchSession();
                refreshSavedSession();
                callbacksRef.current.onPlayerDisconnected?.(0, 'Host');
              }, 20000);
            }

            // Schedule bounded exponential reconnect retry (1s, 2s, 4s, 8s; max 4 attempts)
            const delays = [1000, 2000, 4000, 8000];
            const attempt = reconnectAttemptRef.current;
            if (attempt < 4) {
              // Never stack retry timers: a second 'disconnected' event would
              // otherwise orphan the previous timer and fire overlapping joins.
              if (reconnectRetryTimerRef.current !== null) {
                clearTimeout(reconnectRetryTimerRef.current);
              }
              const delay = delays[attempt];
              reconnectAttemptRef.current = attempt + 1;
              reconnectRetryTimerRef.current = setTimeout(async () => {
                const session = getSavedSession();
                if (!session || roomMembershipRef.current !== 'joined') return;
                try {
                  await peerManager.joinRoom(
                    session.roomCode,
                    session.playerName,
                    session.colorId,
                    true,
                    session.slotIndex,
                    session.reconnectToken,
                  );
                } catch {
                  // Retry failed; next tick or error event will trigger next attempt or timeout
                }
              }, delay);
            }
          }
        } else if (roomMembershipRef.current === 'joining') {
          setRoomMembership('none');
          setAuthStatus(st === 'error' ? 'rejected' : 'unauthenticated');
        } else if (roomMembershipRef.current === 'joined' && stateRef.current.isHost) {
          /* (P1) A guest that drops out while the room is still in the *lobby*.
           *
           * The recovery logic above is gated on the match being `playing` or
           * `paused`, so a guest in the waiting room whose host disappears fell
           * through every branch: no retry, no grace timer, no error, no
           * session cleanup. The UI just sat at "disconnected" indefinitely
           * with nothing to click and no explanation.
           *
           * Match state is irrelevant to the connection being gone, so handle
           * it explicitly and say what happened. */
          console.warn('[useMultiplayer] Host lost while still in the lobby');
          setTransportStatus('failed');
          setAuthStatus('unauthenticated');
          setStatusDetail('The host left before the match started.');
          /* (P1) Keep the room claim: if they re-host the same code, returning
           * players are re-admitted to their own seat rather than treated as
           * new guests in a different slot. */
          touchSession();
          refreshSavedSession();
          callbacksRef.current.onPlayerDisconnected?.(0, 'Host');
        }
      }
    });

    return () => {
      unsubStatus();
      clearRetryTimers();
    };
  }, [clearRetryTimers, refreshSavedSession]);

  /* Monitor ping */
  useEffect(() => {
    const interval = window.setInterval(() => {
      setPing(peerManager.currentPing);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  /* Handle incoming packets */
  useEffect(() => {
    const unsubPacket = peerManager.onPacket((packet, fromPeerId) => {
      // Requirement 8: Do not let stale packets revive a left or unjoined room
      if (roomMembershipRef.current === 'none' || roomMembershipRef.current === 'left') {
        return;
      }

      const s = stateRef.current;
      const peerId = fromPeerId ?? '';
      // Always read the live roster mirror: two packets processed before React
      // re-renders must not observe the same roster.
      const roster = playersRef.current;

      // Host packet handler
      if (s.isHost) {
        // Enforce request deduplication
        if ('requestId' in packet && packet.requestId) {
          if (processedRequestIdsRef.current.has(packet.requestId)) {
            // Already processed this request
            return;
          }
          // Cap processed requests history to avoid memory growth
          if (processedRequestIdsRef.current.size > 500) {
            const first = processedRequestIdsRef.current.values().next().value;
            if (first !== undefined) processedRequestIdsRef.current.delete(first);
          }
          processedRequestIdsRef.current.add(packet.requestId);
        }

        switch (packet.type) {
          case 'JOIN_REQUEST': {
            /* (P0) Protocol version gate, checked before anything is allocated
             * so a mismatched client can never occupy a slot or mint a token.
             * Reported as a plain JOIN_REJECTED rather than a silent drop so a
             * player on a stale cached tab learns *why* they cannot join. */
            if (!isCompatibleProtocolVersion(packet.v)) {
              peerManager.sendToPeer(peerId, {
                type: 'JOIN_REJECTED',
                requestId: packet.requestId,
                reason: `Incompatible game version (host speaks v${PROTOCOL_VERSION}, you sent v${packet.v ?? 1}). Please hard-refresh.`,
              });
              peerManager.closeConnection(peerId, 'Protocol version mismatch');
              return;
            }

            // Verify room code
            if (packet.roomCode !== s.roomCode) {
              peerManager.sendToPeer(peerId, {
                type: 'JOIN_REJECTED',
                requestId: packet.requestId,
                reason: `Invalid room code: expected ${s.roomCode}`,
              });
              peerManager.closeConnection(peerId, 'Invalid room code');
              return;
            }

            // Check if room is full
            const humanCount = roster.filter((p) => !p.isCpu).length;
            if (humanCount >= s.maxPlayers) {
              peerManager.sendToPeer(peerId, {
                type: 'JOIN_REJECTED',
                requestId: packet.requestId,
                reason: 'Room is already full.',
              });
              peerManager.closeConnection(peerId, 'Room full');
              return;
            }

            // Find next available slot
            const occupiedSlots = new Set(roster.map((p) => p.slotIndex));
            let assignedSlot = -1;
            for (let i = 0; i < s.maxPlayers; i++) {
              if (!occupiedSlots.has(i)) {
                assignedSlot = i;
                break;
              }
            }

            if (assignedSlot === -1) {
              peerManager.sendToPeer(peerId, {
                type: 'JOIN_REJECTED',
                requestId: packet.requestId,
                reason: 'No open slots.',
              });
              peerManager.closeConnection(peerId, 'No slots available');
              return;
            }

            // Ensure unique color
            const takenColors = new Set(roster.map((p) => p.colorId));
            let finalColorId = packet.colorId;
            if (takenColors.has(finalColorId) || finalColorId < 0 || finalColorId > 3) {
              finalColorId = [0, 1, 2, 3].find((c) => !takenColors.has(c)) ?? assignedSlot;
            }

            // Generate secret host-issued reconnect token
            const reconnectToken = generateSecureToken();
            slotTokensRef.current.set(assignedSlot, reconnectToken);

            // Update peer admission state in peerManager to 'joined'
            peerManager.setAdmissionState(peerId, 'joined', assignedSlot);

            const newPlayer: NetworkPlayer = {
              playerId: 'p_' + peerId.slice(-6),
              peerId,
              name: packet.name,
              slotIndex: assignedSlot,
              colorId: finalColorId,
              isHost: false,
              isCpu: false,
              isReady: true,
            };

            const updatedPlayers = commitPlayers([...roster, newPlayer].sort(
              (a, b) => a.slotIndex - b.slotIndex,
            ));

            stateVersionRef.current += 1;

            const currentSnap = callbacksRef.current.getGameStateSnapshot?.();
            const isMatchInProgress = currentSnap?.isPlaying ?? false;

            // Send ACCEPTED to the joining guest with their private reconnect token and full gameState if in progress
            peerManager.sendToPeer(peerId, {
              type: 'JOIN_ACCEPTED',
              requestId: packet.requestId,
              slotIndex: assignedSlot,
              reconnectToken,
              roomCode: s.roomCode,
              speed: s.speed,
              winRule: s.winRule,
              players: updatedPlayers,
              stateVersion: stateVersionRef.current,
              turnId: turnIdRef.current,
              maxPlayers: s.maxPlayers,
              v: PROTOCOL_VERSION,
              gameState: isMatchInProgress ? currentSnap : undefined,
            });

            // Broadcast updated lobby roster to all other peers
            peerManager.broadcast({
              type: 'LOBBY_UPDATE',
              players: updatedPlayers,
              speed: s.speed,
              winRule: s.winRule,
              stateVersion: stateVersionRef.current,
              maxPlayers: s.maxPlayers,
            });

            const updatedConfigs: PlayerConfig[] = updatedPlayers.map((p) => ({
              id: p.playerId || `p_${p.slotIndex}`,
              slotIndex: p.slotIndex,
              name: p.name,
              isCpu: p.isCpu,
              colorId: p.colorId,
            }));
            callbacksRef.current.onPlayersUpdated?.(updatedConfigs);

            saveSession({
              roomCode: s.roomCode,
              playerId: roster[0]?.playerId || getOrCreatePlayerId(),
              playerName: roster[0]?.name || 'Host',
              colorId: roster[0]?.colorId || 0,
              slotIndex: 0,
              isHost: true,
              maxPlayers: s.maxPlayers,
              speed: s.speed,
              winRule: s.winRule,
              players: updatedPlayers,
              slotTokens: Array.from(slotTokensRef.current.entries()),
              gameState: callbacksRef.current.getGameStateSnapshot?.(),
              turnId: turnIdRef.current,
              stateVersion: stateVersionRef.current,
            });
            refreshSavedSession();
            break;
          }

          case 'RECONNECT_REQUEST': {
            if (!isCompatibleProtocolVersion(packet.v)) {
              peerManager.sendToPeer(peerId, {
                type: 'RECONNECT_REJECTED',
                requestId: packet.requestId,
                reason: `Incompatible game version (host speaks v${PROTOCOL_VERSION}, you sent v${packet.v ?? 1}). Please hard-refresh.`,
              });
              peerManager.closeConnection(peerId, 'Protocol version mismatch');
              return;
            }

            if (packet.roomCode !== s.roomCode) {
              peerManager.sendToPeer(peerId, {
                type: 'RECONNECT_REJECTED',
                requestId: packet.requestId,
                reason: `Invalid room code: expected ${s.roomCode}`,
              });
              peerManager.closeConnection(peerId, 'Invalid room code');
              return;
            }

            // Authenticate using host-issued reconnect token
            const expectedToken = slotTokensRef.current.get(packet.slotIndex);
            if (!expectedToken || !tokensEqual(expectedToken, packet.reconnectToken)) {
              // Failed token authentication
              peerManager.sendToPeer(peerId, {
                type: 'RECONNECT_REJECTED',
                requestId: packet.requestId,
                reason: 'Authentication failed: Invalid or expired reconnect token.',
              });
              peerManager.closeConnection(peerId, 'Invalid reconnect token');
              return;
            }

            const targetPlayer = roster.find((p) => p.slotIndex === packet.slotIndex);
            if (!targetPlayer) {
              peerManager.sendToPeer(peerId, {
                type: 'RECONNECT_REJECTED',
                requestId: packet.requestId,
                reason: 'Player slot no longer exists.',
              });
              peerManager.closeConnection(peerId, 'Slot does not exist');
              return;
            }

            // Restore player to active human state
            peerManager.setAdmissionState(peerId, 'joined', packet.slotIndex);

            const cleanName = stripCpuSuffix(targetPlayer.name);
            const restored: NetworkPlayer = {
              ...targetPlayer,
              peerId,
              isCpu: false,
              isReady: true,
              name: cleanName,
            };

            const updated = commitPlayers(
              roster.map((p) => (p.slotIndex === packet.slotIndex ? restored : p)),
            );

            stateVersionRef.current += 1;

            /* (P0) `hasRolledForCurrentTurnRef` is intentionally NOT cleared
             * here.
             *
             * It used to be reset on every reconnect, which reopened the
             * per-turn single-roll guard: a guest whose socket dropped while it
             * was the current player could reconnect, see a still-idle phase in
             * the rejoin snapshot, and be served a *second* authoritative roll
             * for one turn. The guest then applied both ROLL_RESULTs, and
             * nothing detected it - there was no turnId check on that path.
             *
             * The guard is now cleared only where a turn genuinely begins:
             * `broadcastCheckpoint` (host settles a turn) and `startGame`.
             * Reconnecting is a transport event and says nothing about whose
             * turn it is or whether it has already been rolled. */

            const configs: PlayerConfig[] = updated.map((p) => ({
              id: p.playerId || `p_${p.slotIndex}`,
              slotIndex: p.slotIndex,
              name: stripCpuSuffix(p.name),
              isCpu: p.isCpu,
              colorId: p.colorId,
            }));
            callbacksRef.current.onPlayersUpdated?.(configs);
            callbacksRef.current.onPlayerReconnected?.(packet.slotIndex, cleanName);

            const currentGameState = callbacksRef.current.getGameStateSnapshot?.();

            peerManager.sendToPeer(peerId, {
              type: 'RECONNECT_ACCEPTED',
              requestId: packet.requestId,
              slotIndex: packet.slotIndex,
              reconnectToken: expectedToken,
              roomCode: s.roomCode,
              speed: s.speed,
              winRule: s.winRule,
              players: updated,
              stateVersion: stateVersionRef.current,
              turnId: turnIdRef.current,
              maxPlayers: s.maxPlayers,
              v: PROTOCOL_VERSION,
              gameState: currentGameState,
            });

            peerManager.broadcast({
              type: 'LOBBY_UPDATE',
              players: updated,
              speed: s.speed,
              winRule: s.winRule,
              stateVersion: stateVersionRef.current,
              maxPlayers: s.maxPlayers,
            });

            saveSession({
              roomCode: s.roomCode,
              playerId: roster[0]?.playerId || getOrCreatePlayerId(),
              playerName: roster[0]?.name || 'Host',
              colorId: roster[0]?.colorId || 0,
              slotIndex: 0,
              isHost: true,
              maxPlayers: s.maxPlayers,
              speed: s.speed,
              winRule: s.winRule,
              players: updated,
              slotTokens: Array.from(slotTokensRef.current.entries()),
              gameState: callbacksRef.current.getGameStateSnapshot?.(),
              turnId: turnIdRef.current,
              stateVersion: stateVersionRef.current,
            });
            refreshSavedSession();
            break;
          }

          case 'COLOR_CHANGE_REQUEST': {
            // Verify slot is bound to this connection
            const admission = peerManager.getAdmissionState(peerId);
            if (admission !== 'joined') return;

            // Reject if color taken by someone else
            const isTaken = roster.some(
              (p) => p.slotIndex !== packet.slotIndex && p.colorId === packet.colorId,
            );
            if (isTaken) return;

            const updated = commitPlayers(
              roster.map((p) =>
                p.slotIndex === packet.slotIndex ? { ...p, colorId: packet.colorId } : p,
              ),
            );
            stateVersionRef.current += 1;

            peerManager.broadcast({
              type: 'LOBBY_UPDATE',
              players: updated,
              speed: s.speed,
              winRule: s.winRule,
              stateVersion: stateVersionRef.current,
              maxPlayers: s.maxPlayers,
            });

            // Persist the new palette so a host refresh restores it.
            saveSession({
              roomCode: s.roomCode,
              playerId: roster[0]?.playerId || getOrCreatePlayerId(),
              playerName: roster[0]?.name || 'Host',
              colorId: roster[0]?.colorId || 0,
              slotIndex: 0,
              isHost: true,
              maxPlayers: s.maxPlayers,
              speed: s.speed,
              winRule: s.winRule,
              players: updated,
              slotTokens: Array.from(slotTokensRef.current.entries()),
              gameState: callbacksRef.current.getGameStateSnapshot?.(),
              turnId: turnIdRef.current,
              stateVersion: stateVersionRef.current,
            });
            refreshSavedSession();
            break;
          }

          case 'ROLL_REQUEST': {
            // Validate connection is joined
            const admission = peerManager.getAdmissionState(peerId);
            if (admission !== 'joined') {
              peerManager.closeConnection(peerId, 'Unauthenticated ROLL_REQUEST');
              return;
            }

            /* (P0) Every rejection below now *answers*.
             *
             * They used to be bare `return`s and the protocol had no NACK, so a
             * guest that had already latched `awaitingRemoteRoll` before
             * sending had no way to learn its request was dropped: its roll
             * button stayed disabled for the rest of the match with no timeout
             * and no recovery. The guest now clears its latch on ROLL_REJECTED
             * *and* on a local timeout, so a lost rejection is survivable too. */
            const rejectRoll = (reason: RollRejectReason) => {
              peerManager.sendToPeer(peerId, {
                type: 'ROLL_REJECTED',
                requestId: packet.requestId,
                reason,
                turnId: turnIdRef.current,
                stateVersion: stateVersionRef.current,
              });
            };

            /* (P1) Flood guard. The per-turn latches below already stop a peer
             * from obtaining more than one *roll*, but nothing stopped it from
             * making the host run a full validatePacket + NACK fan-out an
             * unlimited number of times. Token bucket per peer. */
            if (!consumeRollToken(peerId)) {
              rejectRoll('rate-limited');
              return;
            }

            /*
             * Authoritative turn/phase validation.
             *
             * `getGameStateSnapshot()` deliberately reports the last *stable*
             * checkpoint, so its `phase` reads 'idle' for the whole duration of a
             * turn's animation. Guarding on it therefore let duplicate ROLL_REQUESTs
             * through and produced a second authoritative roll per turn (desyncing
             * the guest). Prefer the live view when the host supplies one.
             */
            const authority = callbacksRef.current.getRollAuthority?.();
            const snapshot = callbacksRef.current.getGameStateSnapshot?.();

            if (authority) {
              if (!authority.isPlaying) {
                rejectRoll('match-not-playing');
                return;
              }
              if (packet.slotIndex !== authority.turnSlot) {
                rejectRoll('not-your-turn');
                return;
              }
              if (!authority.isAwaitingRoll) {
                rejectRoll('not-awaiting-roll');
                return;
              }
            } else {
              // Fallback for headless use without a live authority source.
              const currentTurnIdx = snapshot ? snapshot.turn : 0;
              const activePlayer = roster[currentTurnIdx];
              if (packet.slotIndex !== activePlayer?.slotIndex) {
                rejectRoll('not-your-turn');
                return;
              }
              if (snapshot && snapshot.phase !== 'idle') {
                rejectRoll('not-awaiting-roll');
                return;
              }
            }

            // Reject stale or future turn requests. `turnId` is bumped by the host on
            // every authoritative checkpoint, so a mismatch means the guest is behind.
            if (packet.turnId !== turnIdRef.current) {
              rejectRoll('stale-turn');
              return;
            }

            // Belt-and-braces duplicate guard for this exact turn.
            if (hasRolledForCurrentTurnRef.current) {
              rejectRoll('already-rolled');
              return;
            }

            // Host generates authoritative roll 1..6
            const roll = 1 + Math.floor(Math.random() * 6);
            hasRolledForCurrentTurnRef.current = true;
            stateVersionRef.current += 1;

            peerManager.broadcast({
              type: 'ROLL_RESULT',
              player: packet.slotIndex,
              roll,
              turnId: turnIdRef.current,
              stateVersion: stateVersionRef.current,
              timestamp: Date.now(),
            });

            // Execute roll locally on host
            callbacksRef.current.onRemoteRoll?.(packet.slotIndex, roll);
            break;
          }

          case 'EMOTE': {
            const admission = peerManager.getAdmissionState(peerId);
            if (admission !== 'joined') return;

            // Rate limit: 1 emote per MIN_EMOTE_INTERVAL_MS
            const now = Date.now();
            const last = lastEmoteTimeRef.current.get(packet.player) || 0;
            if (now - last < MIN_EMOTE_INTERVAL_MS) {
              return;
            }
            lastEmoteTimeRef.current.set(packet.player, now);

            if (!isValidEmoji(packet.emoji)) return;

            // Relay emote to all other joined peers
            peerManager.broadcast(packet);
            callbacksRef.current.onEmoteReceived?.(packet.player, packet.emoji);
            break;
          }

          case 'PLAYER_DISCONNECTED': {
            // Internal disconnect notification emitted by peerManager
            const dcSlot = packet.slotIndex;
            if (dcSlot >= 0) {
              const dcPlayer = roster.find((p) => p.slotIndex === dcSlot);
              if (dcPlayer && !dcPlayer.isCpu) {
                /*
                 * A data-channel `close` can be delivered seconds AFTER the player
                 * has already reconnected on a fresh connection (guests retry after
                 * 1s, while the host may only notice the dead socket much later).
                 * Honouring that stale event would flip the live player back to
                 * "not ready", leaving the UI stuck on
                 * "WAITING FOR <name> TO RECONNECT..." even though they can roll.
                 * Only trust a departure from the connection that still owns the seat.
                 */
                if (peerId && dcPlayer.peerId && dcPlayer.peerId !== peerId) {
                  break;
                }

                const cleanName = stripCpuSuffix(dcPlayer.name);
                // Do NOT convert to CPU bot; keep isCpu: false, mark isReady: false
                const updated = commitPlayers(
                  roster.map((p) =>
                    p.slotIndex === dcSlot
                      ? { ...p, isCpu: false, isReady: false, name: cleanName }
                      : p,
                  ),
                );
                stateVersionRef.current += 1;

                peerManager.broadcast({
                  type: 'LOBBY_UPDATE',
                  players: updated,
                  speed: s.speed,
                  winRule: s.winRule,
                  stateVersion: stateVersionRef.current,
                  maxPlayers: s.maxPlayers,
                });

                peerManager.broadcast({
                  type: 'PLAYER_DISCONNECTED',
                  slotIndex: dcSlot,
                  name: cleanName,
                  stateVersion: stateVersionRef.current,
                });

                const configs: PlayerConfig[] = updated.map((p) => ({
                  id: p.playerId || `p_${p.slotIndex}`,
                  slotIndex: p.slotIndex,
                  name: p.name,
                  isCpu: p.isCpu,
                  colorId: p.colorId,
                }));
                callbacksRef.current.onPlayersUpdated?.(configs);
                callbacksRef.current.onPlayerDisconnected?.(dcPlayer.slotIndex, cleanName);

                saveSession({
                  roomCode: s.roomCode,
                  playerId: roster[0]?.playerId || getOrCreatePlayerId(),
                  playerName: roster[0]?.name || 'Host',
                  colorId: roster[0]?.colorId || 0,
                  slotIndex: 0,
                  isHost: true,
                  maxPlayers: s.maxPlayers,
                  speed: s.speed,
                  winRule: s.winRule,
                  players: updated,
                  slotTokens: Array.from(slotTokensRef.current.entries()),
                  gameState: callbacksRef.current.getGameStateSnapshot?.(),
                  turnId: turnIdRef.current,
                  stateVersion: stateVersionRef.current,
                });
                refreshSavedSession();
              }
            }
            break;
          }

          default:
            // Forbidden guest-originated packet (e.g. GAME_START, LOBBY_UPDATE, SYNC_CHECKPOINT, ROLL_RESULT)
            peerManager.closeConnection(peerId, `Unauthorized packet type: ${packet.type}`);
            break;
        }
      } else {
        // Guest packet handler (receiving from host)
        if ('stateVersion' in packet && typeof packet.stateVersion === 'number') {
          if (packet.stateVersion < lastSeenStateVersionRef.current) {
            // Drop stale packet from host
            return;
          }
          lastSeenStateVersionRef.current = packet.stateVersion;
        }

        switch (packet.type) {
          case 'JOIN_ACCEPTED': {
            setMySlot(packet.slotIndex);
            setRoomCode(packet.roomCode);
            setSpeed(packet.speed);
            setWinRule(packet.winRule);
            commitPlayers(packet.players);
            setMaxPlayers(packet.maxPlayers);
            turnIdRef.current = packet.turnId;
            setStatus('connected');
            setIsOnline(true);
            setTransportStatus('connected');
            setAuthStatus('authenticated');
            setRoomMembership('joined');
            setGameStatus(packet.gameState?.isPlaying ? 'playing' : 'lobby');
            setIsPaused(false);
            clearRetryTimers();
            setStatusDetail('Joined room successfully!');

            const me = packet.players.find((x) => x.slotIndex === packet.slotIndex);
            saveSession({
              roomCode: packet.roomCode,
              playerId: me?.playerId || getOrCreatePlayerId(),
              reconnectToken: packet.reconnectToken,
              playerName: me?.name || 'Player',
              colorId: me?.colorId ?? packet.slotIndex,
              slotIndex: packet.slotIndex,
              isHost: false,
              maxPlayers: packet.maxPlayers,
            });
            refreshSavedSession();

            const configs: PlayerConfig[] = packet.players.map((p) => ({
              id: p.playerId || `p_${p.slotIndex}`,
              slotIndex: p.slotIndex,
              name: p.name,
              isCpu: p.isCpu,
              colorId: p.colorId,
            }));
            callbacksRef.current.onPlayersUpdated?.(configs);

            // Only resume the match locally when the host reports a LIVE match.
            // A pre-match snapshot (`isPlaying: false`) would otherwise drag the
            // guest onto the board before the host has pressed Start.
            if (packet.gameState?.isPlaying) {
              callbacksRef.current.onReconnected?.(
                configs,
                packet.speed,
                packet.winRule,
                packet.gameState,
              );
            }
            break;
          }

          case 'RECONNECT_ACCEPTED': {
            setMySlot(packet.slotIndex);
            setRoomCode(packet.roomCode);
            setSpeed(packet.speed);
            setWinRule(packet.winRule);
            commitPlayers(packet.players);
            setMaxPlayers(packet.maxPlayers);
            turnIdRef.current = packet.turnId;
            setStatus('connected');
            setIsOnline(true);
            setTransportStatus('connected');
            setAuthStatus('authenticated');
            setRoomMembership('joined');
            // Mirror JOIN_ACCEPTED: a reconnect into a lobby is still a lobby.
            const isLiveMatch = packet.gameState?.isPlaying ?? false;
            setGameStatus(isLiveMatch ? 'playing' : 'lobby');
            setIsPaused(false);
            clearRetryTimers();
            setStatusDetail(isLiveMatch ? 'Reconnected to match!' : 'Rejoined the room lobby!');

            const me = packet.players.find((x) => x.slotIndex === packet.slotIndex);
            saveSession({
              roomCode: packet.roomCode,
              playerId: me?.playerId || getOrCreatePlayerId(),
              reconnectToken: packet.reconnectToken,
              playerName: me ? stripCpuSuffix(me.name) : 'Player',
              colorId: me?.colorId ?? packet.slotIndex,
              slotIndex: packet.slotIndex,
              isHost: false,
              maxPlayers: packet.maxPlayers,
            });
            refreshSavedSession();

            const configs: PlayerConfig[] = packet.players.map((x) => ({
              id: x.playerId || `p_${x.slotIndex}`,
              slotIndex: x.slotIndex,
              name: x.isCpu ? `${stripCpuSuffix(x.name)} (CPU)` : stripCpuSuffix(x.name),
              isCpu: x.isCpu,
              colorId: x.colorId,
            }));

            callbacksRef.current.onPlayersUpdated?.(configs);

            // Lobby rejoin: stay in the lobby and wait for the host to launch.
            if (isLiveMatch) {
              callbacksRef.current.onReconnected?.(
                configs,
                packet.speed,
                packet.winRule,
                packet.gameState,
              );
            }
            break;
          }

          case 'JOIN_REJECTED':
          case 'RECONNECT_REJECTED': {
            clearRetryTimers();
            clearSession();
            refreshSavedSession();
            setIsOnline(false);
            setTransportStatus('disconnected');
            setAuthStatus('rejected');
            setRoomMembership('none');
            setGameStatus('none');
            setIsPaused(false);
            setStatus('error');
            setStatusDetail(packet.reason);
            break;
          }

          case 'LOBBY_UPDATE': {
            commitPlayers(packet.players);
            setSpeed(packet.speed);
            setWinRule(packet.winRule);
            setMaxPlayers(packet.maxPlayers);

            const configs: PlayerConfig[] = packet.players.map((p) => ({
              id: p.playerId || `p_${p.slotIndex}`,
              slotIndex: p.slotIndex,
              name: p.isCpu ? `${stripCpuSuffix(p.name)} (CPU)` : stripCpuSuffix(p.name),
              isCpu: p.isCpu,
              colorId: p.colorId,
            }));
            callbacksRef.current.onPlayersUpdated?.(configs);
            break;
          }

          case 'GAME_START': {
            commitPlayers(packet.players);
            setSpeed(packet.speed);
            setWinRule(packet.winRule);
            turnIdRef.current = packet.turnId;
            setGameStatus('playing');
            setIsPaused(false);

            /*
             * A NEW match is starting (typically the host replaying after a win).
             * The previous match had flagged this session as finished, which used
             * to wipe it - killing the resume/rejoin affordance and the reconnect
             * token, so the returning player was treated as a brand new guest.
             * Re-arm the session for this match instead.
             */
            reactivateSession({
              roomCode: stateRef.current.roomCode,
              maxPlayers: stateRef.current.maxPlayers,
              speed: packet.speed,
              winRule: packet.winRule,
              players: packet.players,
              turnId: packet.turnId,
              stateVersion: packet.stateVersion,
              gameState: packet.gameState,
            });
            refreshSavedSession();

            const configs: PlayerConfig[] = packet.players.map((p) => ({
              id: p.playerId || `p_${p.slotIndex}`,
              slotIndex: p.slotIndex,
              name: p.name,
              isCpu: p.isCpu,
              colorId: p.colorId,
            }));
            callbacksRef.current.onGameStart?.(configs, packet.speed, packet.winRule);
            break;
          }

          case 'ROLL_RESULT': {
            /* (P0) Ordering guard.
             *
             * This handler used to apply any ROLL_RESULT it was handed. There
             * was no check that the result belonged to the turn the guest was
             * actually waiting on, so a duplicate or reordered delivery made
             * the guest roll twice for one turn and desync its board from the
             * host's. `turnId` only ever moves forward, and the host bumps it on
             * every authoritative checkpoint, so a result for an older turn is
             * a replay and is dropped.
             *
             * The matching double-roll source on the host - clearing
             * `hasRolledForCurrentTurnRef` on RECONNECT_REQUEST - is fixed in
             * the host's RECONNECT_REQUEST handler. */
            if (packet.turnId < turnIdRef.current) {
              break;
            }
            turnIdRef.current = packet.turnId;
            if (packet.stateVersion > lastSeenStateVersionRef.current) {
              lastSeenStateVersionRef.current = packet.stateVersion;
            }
            touchSession();
            callbacksRef.current.onRemoteRoll?.(packet.player, packet.roll);
            break;
          }

          /* (P0) The host refused our roll. Release the guest's
           * `awaitingRemoteRoll` latch so the roll button comes back instead of
           * staying dead for the rest of the match, and resync the turn id so
           * the retry is aimed at the turn the host is actually on. */
          case 'ROLL_REJECTED': {
            if (packet.turnId > turnIdRef.current) {
              turnIdRef.current = packet.turnId;
            }
            callbacksRef.current.onRollRejected?.(packet.reason);
            break;
          }

          case 'SYNC_CHECKPOINT': {
            turnIdRef.current = packet.turnId;
            if (packet.winner >= 0 || packet.mode === 'over') {
              markSessionFinished();
              // The room claim survives, so the rejoin affordance must refresh.
              refreshSavedSession();
              setGameStatus('over');
            } else {
              touchSession();
            }
            callbacksRef.current.onSyncCheckpoint?.(packet);
            break;
          }

          case 'EMOTE': {
            callbacksRef.current.onEmoteReceived?.(packet.player, packet.emoji);
            break;
          }

          case 'PLAYER_DISCONNECTED': {
            callbacksRef.current.onPlayerDisconnected?.(packet.slotIndex, packet.name);
            break;
          }
        }
      }
    });

    return () => {
      unsubPacket();
    };
  }, [refreshSavedSession]);

  /* Host creates or re-hosts room */
  const createRoom = useCallback(
    async (
      hostName: string,
      colorId = 0,
      capacity = 4,
      initialSpeed: GameSpeed = 'normal',
      initialRule: WinRule = 'exact',
      existingRoomCode?: string,
      isRehost = false,
    ) => {
      clearRetryTimers();
      const session = isRehost ? getSavedSession() : null;
      const code = (existingRoomCode || session?.roomCode || generateRoomCode()).toUpperCase().trim();
      const myPlayerId = getOrCreatePlayerId();

      const finalCapacity = session?.maxPlayers || capacity;
      const finalSpeed = session?.speed || initialSpeed;
      const finalRule = session?.winRule || initialRule;

      setIsHost(true);
      setRoomCode(code);
      setMySlot(0);
      setMaxPlayers(finalCapacity);
      setSpeed(finalSpeed);
      setWinRule(finalRule);
      setRoomMembership('joining');
      setAuthStatus('authenticated');
      setTransportStatus('connecting');
      setGameStatus(isRehost && session?.gameState?.isPlaying ? 'playing' : 'lobby');
      setIsPaused(false);

      stateVersionRef.current = session?.stateVersion || 1;
      turnIdRef.current = session?.turnId || 1;
      hasRolledForCurrentTurnRef.current = false;
      processedRequestIdsRef.current.clear();

      /* (P1) Rebuild the token map defensively.
       *
       * This ran `new Map(session.slotTokens)` *before* the `try` that guards
       * `peerManager.createRoom`. `validateSavedSession` checks only seven
       * scalar fields - it never inspects `slotTokens` - so a corrupt or
       * tampered storage entry whose `slotTokens` is a string instead of an
       * array of pairs made `new Map` throw a `TypeError` straight out of
       * `createRoom`, bypassing the error UI entirely and leaving the caller
       * with an unhandled rejection.
       *
       * Reconstruct entry by entry and drop anything malformed: a partial map
       * means some seats cannot be reclaimed, which is bad, whereas a thrown
       * TypeError means the host cannot start at all. */
      slotTokensRef.current.clear();
      if (Array.isArray(session?.slotTokens)) {
        for (const entry of session.slotTokens) {
          if (!Array.isArray(entry) || entry.length !== 2) continue;
          const [slot, token] = entry as [unknown, unknown];
          if (
            typeof slot === 'number' &&
            Number.isInteger(slot) &&
            slot >= 0 &&
            slot < MAX_PLAYERS &&
            typeof token === 'string' &&
            token.length > 0
          ) {
            slotTokensRef.current.set(slot, token);
          }
        }
      }

      const hostPlayer: NetworkPlayer = {
        playerId: myPlayerId,
        peerId: 'host',
        name: hostName.trim() || session?.playerName || 'Host',
        slotIndex: 0,
        colorId: session?.colorId ?? colorId,
        isHost: true,
        isCpu: false,
        isReady: true,
      };

      /*
       * Re-hosts keep guest seats RESERVED so their reconnect tokens stay valid.
       *
       * A reserved seat is deliberately NOT converted into a CPU bot: if a player
       * drops out, the match waits for that human to return rather than letting an
       * AI play on their behalf. Their token stays bound to the slot so the
       * original player - and only the original player - can reclaim it.
       *
       * `peerId` MUST stay a non-empty safe string: `isValidNetworkPlayer` rejects
       * empty ids, so an empty placeholder would make every LOBBY_UPDATE /
       * GAME_START / RECONNECT_ACCEPTED broadcast fail validation and cause
       * `peerManager` to disconnect all guests. Use a stable offline sentinel until
       * the real peer reconnects and overwrites it.
       */
      let restoredPlayers: NetworkPlayer[] = [hostPlayer];
      const savedRoster = Array.isArray(session?.players) ? session.players : [];
      const validSavedRoster = savedRoster.filter(
        (p): p is NetworkPlayer => isValidNetworkPlayer(p),
      );
      if (validSavedRoster.length > 1) {
        restoredPlayers = validSavedRoster.map((p) =>
          p.slotIndex === 0
            ? hostPlayer
            : {
                ...p,
                // Never reuse a stale live peer id from a previous session.
                peerId: p.isCpu ? `cpu-${p.slotIndex}` : `offline-${p.slotIndex}`,
                // Human seats stay human; only genuine lobby bots stay bots.
                isCpu: p.isCpu,
                isReady: p.isCpu,
              },
        );
      }

      commitPlayers(restoredPlayers);
      saveSession({
        roomCode: code,
        playerId: myPlayerId,
        playerName: hostPlayer.name,
        colorId: hostPlayer.colorId,
        slotIndex: 0,
        isHost: true,
        maxPlayers: finalCapacity,
        speed: finalSpeed,
        winRule: finalRule,
        players: restoredPlayers,
        slotTokens: Array.from(slotTokensRef.current.entries()),
        gameState: session?.gameState,
        turnId: turnIdRef.current,
        stateVersion: stateVersionRef.current,
      });
      refreshSavedSession();

      try {
        await peerManager.createRoom(code, hostPlayer.name, hostPlayer.colorId, isRehost);
        setTransportStatus('connected');
        setRoomMembership('joined');
        setIsOnline(true);
        window.location.hash = `room=${code}`;

        if (isRehost && session?.gameState?.isPlaying) {
          const configs: PlayerConfig[] = restoredPlayers.map((p) => ({
            id: p.playerId || `p_${p.slotIndex}`,
            slotIndex: p.slotIndex,
            name: p.name,
            isCpu: p.isCpu,
            colorId: p.colorId,
          }));
          callbacksRef.current.onReconnected?.(
            configs,
            finalSpeed,
            finalRule,
            session.gameState,
          );
        }

        return code;
      } catch (err: any) {
        setIsHost(false);
        setIsOnline(false);
        setRoomMembership('none');
        setTransportStatus('failed');
        setGameStatus('none');

        /* (P0) Do NOT `clearSession()` on a transient signalling failure.
         *
         * The `saveSession` above persists the roster *and every guest's
         * reconnect token*. This catch used to wipe all of it, and the one
         * error that reliably reaches here - `unavailable-id` - is exactly the
         * condition `peerManager.createRoom` already retries twice with a
         * 1200ms backoff. So two players clicking "re-host" inside the same
         * few-second window could permanently destroy every guest's ability to
         * reclaim their reserved seat, on an error path that is explicitly
         * expected and handled.
         *
         * A failed create is not a decision to forget the room: keep the
         * claim so the player can simply retry, and only surface the error. */
        if (isRehost) {
          // Restore the previously-persisted claim rather than the partially
          // rewritten one, so a retry sees exactly what was there before.
          if (session) {
            saveSession({
              roomCode: session.roomCode,
              playerId: session.playerId,
              playerName: session.playerName,
              colorId: session.colorId,
              slotIndex: session.slotIndex,
              isHost: session.isHost,
              maxPlayers: session.maxPlayers,
              speed: session.speed,
              winRule: session.winRule,
              reconnectToken: session.reconnectToken,
              players: session.players,
              slotTokens: session.slotTokens,
              gameState: session.gameState,
              turnId: session.turnId,
              stateVersion: session.stateVersion,
            });
          }
        } else {
          // A brand-new room that never came up has no claim worth keeping.
          clearSession();
        }
        refreshSavedSession();

        if (err?.type === 'unavailable-id') {
          setStatus('error');
          setStatusDetail(
            `Room code ${code} is still held by the network. Please wait a moment and press Resume - your players and seats are kept.`,
          );
        } else {
          setStatus('error');
          setStatusDetail(err?.message || 'Could not start the room. Please try again.');
        }
        throw err;
      }
    },
    [clearRetryTimers, refreshSavedSession],
  );

  /* Reconnect using host-issued reconnect token or re-host as host */
  const reconnectRoom = useCallback(
    async (targetRoomCode?: string) => {
      const session = getSavedSession();
      const code = (targetRoomCode || session?.roomCode || '').toUpperCase().trim();
      if (!code) return;

      if (session?.isHost) {
        return createRoom(
          session.playerName,
          session.colorId,
          session.maxPlayers || maxPlayers,
          session.speed || speed,
          session.winRule || winRule,
          code,
          true,
        );
      } else {
        clearRetryTimers();
        setIsHost(false);
        setRoomCode(code);
        lastSeenStateVersionRef.current = 0;
        setRoomMembership('joining');
        setAuthStatus('authenticating');
        setTransportStatus('reconnecting');

        return peerManager.joinRoom(
          code,
          session?.playerName || 'Player',
          session?.colorId ?? 1,
          true,
          session?.slotIndex ?? 0,
          session?.reconnectToken || '',
        );
      }
    },
    [clearRetryTimers, createRoom, maxPlayers, speed, winRule],
  );

  /* Guest joins room */
  const joinRoom = useCallback(
    async (code: string, guestName: string, colorId = 1) => {
      const cleanCode = code.toUpperCase().trim();
      const session = getSavedSession();

      // If user is already the host of this exact room code, re-host/rejoin as host!
      if (session && session.roomCode === cleanCode && session.isHost) {
        return reconnectRoom(cleanCode);
      }

      clearRetryTimers();
      setIsHost(false);
      setRoomCode(cleanCode);
      lastSeenStateVersionRef.current = 0;
      setRoomMembership('joining');
      setAuthStatus('authenticating');
      setTransportStatus('connecting');

      // If we have an active saved session with a reconnect token for this room, automatically reconnect
      if (session && session.roomCode === cleanCode && session.reconnectToken) {
        try {
          await peerManager.joinRoom(
            cleanCode,
            guestName.trim() || session.playerName || 'Player',
            colorId,
            true,
            session.slotIndex,
            session.reconnectToken,
          );
          window.location.hash = `room=${cleanCode}`;
          return;
        } catch {
          // If reconnect fails, clear stale session and try fresh join
          clearSession();
          refreshSavedSession();
        }
      }

      try {
        await peerManager.joinRoom(cleanCode, guestName.trim() || 'Player', colorId, false);
        window.location.hash = `room=${cleanCode}`;
      } catch (err) {
        setIsOnline(false);
        setRoomMembership('none');
        setAuthStatus('rejected');
        setTransportStatus('failed');
        throw err;
      }
    },
    [clearRetryTimers, reconnectRoom, refreshSavedSession],
  );

  /* Change color */
  const changeColor = useCallback(
    (slotIdx: number, newColorId: number) => {
      const s = stateRef.current;
      const isTaken = s.players.some(
        (p) => p.slotIndex !== slotIdx && p.colorId === newColorId,
      );
      if (isTaken) return;

      if (s.isHost) {
        const updated = commitPlayers(
          playersRef.current.map((p) =>
            p.slotIndex === slotIdx ? { ...p, colorId: newColorId } : p,
          ),
        );
        stateVersionRef.current += 1;
        peerManager.broadcast({
          type: 'LOBBY_UPDATE',
          players: updated,
          speed: s.speed,
          winRule: s.winRule,
          stateVersion: stateVersionRef.current,
          maxPlayers: s.maxPlayers,
        });
      } else {
        const reqId = generateRequestId('color');
        peerManager.sendToPeer('host', {
          type: 'COLOR_CHANGE_REQUEST',
          requestId: reqId,
          slotIndex: slotIdx,
          colorId: newColorId,
        });
      }
    },
    [commitPlayers],
  );

  /*
   * Add/remove a CPU bot in a slot, or kick a connected human (Host only).
   *
   * All work happens synchronously against `playersRef` and the result is pushed
   * in one shot. Doing this inside a `setPlayers` updater was a bug: React may
   * invoke updaters more than once, which would broadcast duplicate
   * LOBBY_UPDATEs and bump `stateVersionRef` twice, desyncing every guest.
   */
  const toggleCpuSlot = useCallback(
    (slotIdx: number) => {
      const s = stateRef.current;
      if (!s.isHost) return;

      const curr = playersRef.current;
      const exists = curr.find((p) => p.slotIndex === slotIdx);
      let updated: NetworkPlayer[];

      if (exists) {
        if (exists.isCpu) {
          updated = curr.filter((p) => p.slotIndex !== slotIdx);
          slotTokensRef.current.delete(slotIdx);
        } else {
          // Kick a human: drop the seat, revoke the token, and drop the transport
          // so the removed guest can no longer send ROLL_REQUEST / receive rosters.
          updated = curr.filter((p) => p.slotIndex !== slotIdx);
          slotTokensRef.current.delete(slotIdx);
          if (exists.peerId) {
            peerManager.closeConnection(exists.peerId, 'Removed from room by host');
          }
        }
      } else {
        const takenColors = new Set(curr.map((p) => p.colorId));
        const botColor = [0, 1, 2, 3].find((c) => !takenColors.has(c)) ?? slotIdx;

        const cpuBot: NetworkPlayer = {
          playerId: `bot_${slotIdx}`,
          peerId: `cpu-${slotIdx}`,
          name: `CPU ${slotIdx}`,
          slotIndex: slotIdx,
          colorId: botColor,
          isHost: false,
          isCpu: true,
          isReady: true,
        };
        updated = [...curr, cpuBot].sort((a, b) => a.slotIndex - b.slotIndex);
      }

      commitPlayers(updated);
      stateVersionRef.current += 1;

      peerManager.broadcast({
        type: 'LOBBY_UPDATE',
        players: updated,
        speed: s.speed,
        winRule: s.winRule,
        stateVersion: stateVersionRef.current,
        maxPlayers: s.maxPlayers,
      });

      if (exists && !exists.isCpu) {
        peerManager.broadcast({
          type: 'PLAYER_DISCONNECTED',
          slotIndex: slotIdx,
          name: stripCpuSuffix(exists.name),
          stateVersion: stateVersionRef.current,
        });
        callbacksRef.current.onPlayerDisconnected?.(
          slotIdx,
          stripCpuSuffix(exists.name),
        );
      }

      const configs: PlayerConfig[] = updated.map((p) => ({
        id: p.playerId || `p_${p.slotIndex}`,
        slotIndex: p.slotIndex,
        name: p.name,
        isCpu: p.isCpu,
        colorId: p.colorId,
      }));
      callbacksRef.current.onPlayersUpdated?.(configs);

      saveSession({
        roomCode: s.roomCode,
        playerId: updated[0]?.playerId || getOrCreatePlayerId(),
        playerName: updated[0]?.name || 'Host',
        colorId: updated[0]?.colorId || 0,
        slotIndex: 0,
        isHost: true,
        maxPlayers: s.maxPlayers,
        speed: s.speed,
        winRule: s.winRule,
        players: updated,
        slotTokens: Array.from(slotTokensRef.current.entries()),
        gameState: callbacksRef.current.getGameStateSnapshot?.(),
        turnId: turnIdRef.current,
        stateVersion: stateVersionRef.current,
      });
      refreshSavedSession();
    },
    [commitPlayers, refreshSavedSession],
  );

  /* Update room rules (Host only) */
  const updateRoomRules = useCallback(
    (newSpeed: GameSpeed, newRule: WinRule) => {
      if (!isHost) return;
      setSpeed(newSpeed);
      setWinRule(newRule);
      stateVersionRef.current += 1;
      peerManager.broadcast({
        type: 'LOBBY_UPDATE',
        players: playersRef.current,
        speed: newSpeed,
        winRule: newRule,
        stateVersion: stateVersionRef.current,
        maxPlayers,
      });
    },
    [isHost, maxPlayers],
  );

  /* Host starts the game */
  const startGame = useCallback(() => {
    if (!isHost) return;
    const roster = playersRef.current;
    if (roster.length < 2) return;

    turnIdRef.current = 1;
    hasRolledForCurrentTurnRef.current = false;
    stateVersionRef.current += 1;
    setGameStatus('playing');
    setIsPaused(false);

    const configs: PlayerConfig[] = roster.map((p) => ({
      id: p.playerId || `p_${p.slotIndex}`,
      slotIndex: p.slotIndex,
      name: p.name,
      isCpu: p.isCpu,
      colorId: p.colorId,
    }));

    const openingBoard: GameStateSnapshot = {
      mode: 'playing',
      pos: configs.map(() => 0),
      turn: 0,
      phase: 'idle',
      rolls: configs.map(() => 0),
      laddersHit: configs.map(() => 0),
      snakesHit: configs.map(() => 0),
      sixesHit: configs.map(() => 0),
      winner: -1,
      isPlaying: true,
    };

    // Ship the authoritative opening board so every guest can re-arm its stored
    // session for this new match (see the GAME_START guest handler).
    peerManager.broadcast({
      type: 'GAME_START',
      players: roster,
      speed,
      winRule,
      stateVersion: stateVersionRef.current,
      turnId: turnIdRef.current,
      gameState: openingBoard,
    });

    saveSession({
      roomCode,
      playerId: roster[0]?.playerId || getOrCreatePlayerId(),
      playerName: roster[0]?.name || 'Host',
      colorId: roster[0]?.colorId || 0,
      slotIndex: 0,
      isHost: true,
      maxPlayers,
      speed,
      winRule,
      players: roster,
      slotTokens: Array.from(slotTokensRef.current.entries()),
      turnId: turnIdRef.current,
      stateVersion: stateVersionRef.current,
      gameState: openingBoard,
    });
    refreshSavedSession();

    callbacksRef.current.onGameStart?.(configs, speed, winRule);
  }, [isHost, maxPlayers, refreshSavedSession, roomCode, speed, winRule]);

  /* Broadcast roll result (Host) or send roll request (Guest) */
  const broadcastRoll = useCallback(
    (player: number, roll: number) => {
      touchSession();
      if (isHost) {
        // Host broadcasts authoritative roll result
        hasRolledForCurrentTurnRef.current = true;
        stateVersionRef.current += 1;
        peerManager.broadcast({
          type: 'ROLL_RESULT',
          player,
          roll,
          turnId: turnIdRef.current,
          stateVersion: stateVersionRef.current,
          timestamp: Date.now(),
        });
      } else {
        // Guest sends roll request to host
        const reqId = generateRequestId('roll');
        peerManager.sendToPeer('host', {
          type: 'ROLL_REQUEST',
          requestId: reqId,
          turnId: turnIdRef.current,
          slotIndex: mySlot,
        });
      }
    },
    [isHost, mySlot],
  );

  /* Broadcast state checkpoint (Host only) */
  const broadcastCheckpoint = useCallback(
    (checkpoint: {
      mode?: CheckpointMode;
      pos: number[];
      turn: number;
      phase: string;
      rolls: number[];
      laddersHit: number[];
      snakesHit: number[];
      sixesHit: number[];
      winner: number;
    }) => {
      if (!isHost) return;
      turnIdRef.current += 1;
      hasRolledForCurrentTurnRef.current = false;
      stateVersionRef.current += 1;

      const checkpointMode: CheckpointMode =
        checkpoint.mode || (checkpoint.winner >= 0 ? 'over' : 'playing');

      if (checkpoint.winner >= 0 || checkpointMode === 'over') {
        markSessionFinished();
        refreshSavedSession();
        setGameStatus('over');
      } else {
        touchSession();
      }

      peerManager.broadcast({
        type: 'SYNC_CHECKPOINT',
        ...checkpoint,
        mode: checkpointMode,
        turnId: turnIdRef.current,
        stateVersion: stateVersionRef.current,
      });

      // Continuously persist active match state into host's session storage
      const s = stateRef.current;
      saveSession({
        roomCode,
        playerId: s.players[0]?.playerId || getOrCreatePlayerId(),
        playerName: s.players[0]?.name || 'Host',
        colorId: s.players[0]?.colorId || 0,
        slotIndex: 0,
        isHost: true,
        maxPlayers,
        speed,
        winRule,
        players: playersRef.current,
        slotTokens: Array.from(slotTokensRef.current.entries()),
        gameState: {
          ...checkpoint,
          mode: checkpointMode,
          isPlaying: checkpoint.winner < 0,
        },
        turnId: turnIdRef.current,
        stateVersion: stateVersionRef.current,
      });
      refreshSavedSession();
    },
    [isHost, maxPlayers, refreshSavedSession, roomCode, speed, winRule],
  );

  /* Broadcast reaction emoji */
  const broadcastEmote = useCallback(
    (emoji: string) => {
      if (!isValidEmoji(emoji)) return;

      const now = Date.now();
      const last = lastEmoteTimeRef.current.get(mySlot) || 0;
      if (now - last < MIN_EMOTE_INTERVAL_MS) {
        return; // Client-side rate-limit throttling
      }
      lastEmoteTimeRef.current.set(mySlot, now);

      const reqId = generateRequestId('emote');
      const emotePacket: Packet = {
        type: 'EMOTE',
        requestId: reqId,
        player: mySlot,
        emoji,
        timestamp: now,
      };

      if (isHost) {
        peerManager.broadcast(emotePacket);
      } else {
        peerManager.sendToPeer('host', emotePacket);
      }
      // Also emit locally
      callbacksRef.current.onEmoteReceived?.(mySlot, emoji);
    },
    [isHost, mySlot],
  );

  /* Leave room and clean up */
  const leaveRoom = useCallback(() => {
    clearRetryTimers();
    peerManager.cleanup();
    // Detach rather than delete: the room still holds this seat, so the reconnect
    // token must survive for the player to be recognised when they come back.
    // `dismissSession()` (the lobby's ✕) is the explicit "forget this room" path.
    detachSession();
    refreshSavedSession();
    setIsOnline(false);
    setIsHost(false);
    setIsPaused(false);
    setRoomCode('');
    commitPlayers([]);
    setTransportStatus('disconnected');
    setAuthStatus('unauthenticated');
    setRoomMembership('none');
    setGameStatus('none');
    setStatus('idle');
    setStatusDetail('');
    setMySlot(0);
    setMaxPlayers(4);
    stateVersionRef.current = 1;
    turnIdRef.current = 1;
    lastSeenStateVersionRef.current = 0;
    slotTokensRef.current.clear();
    processedRequestIdsRef.current.clear();
    lastEmoteTimeRef.current.clear();

    if (window.location.hash.startsWith('#room=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [clearRetryTimers, commitPlayers, refreshSavedSession]);

  const isOnlineMatch =
    roomMembership === 'joined' ||
    gameStatus === 'playing' ||
    gameStatus === 'paused';

  return {
    isOnline,
    isOnlineMatch,
    isHost,
    roomCode,
    mySlot,
    status,
    statusDetail,
    transportStatus,
    authStatus,
    roomMembership,
    gameStatus,
    isPaused,
    players,
    speed,
    winRule,
    maxPlayers,
    ping,
    savedSession,
    createRoom,
    joinRoom,
    reconnectRoom,
    changeColor,
    toggleCpuSlot,
    updateRoomRules,
    startGame,
    broadcastRoll,
    broadcastCheckpoint,
    broadcastEmote,
    leaveRoom,
  };
}
