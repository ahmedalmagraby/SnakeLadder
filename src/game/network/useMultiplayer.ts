import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSpeed, WinRule } from '../constants';
import type { PlayerConfig } from '../useGame';
import { generateRoomCode, peerManager } from './peerManager';
import {
  clearSession,
  getOrCreatePlayerId,
  getSavedSession,
  saveSession,
  type SavedSession,
} from './sessionStorage';
import {
  MIN_EMOTE_INTERVAL_MS,
  type ConnectionStatus,
  type GameStateSnapshot,
  type NetworkPlayer,
  type Packet,
} from './types';
import { isValidEmoji, stripCpuSuffix } from './validation';

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
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface UseMultiplayerProps {
  onGameStart?: (players: PlayerConfig[], speed: GameSpeed, winRule: WinRule) => void;
  onRemoteRoll?: (player: number, roll: number) => void;
  onSyncCheckpoint?: (checkpoint: {
    pos: number[];
    turn: number;
    phase: string;
    rolls: number[];
    laddersHit: number[];
    snakesHit: number[];
    sixesHit: number[];
    winner: number;
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

  // Protocol state versions and turn IDs
  const stateVersionRef = useRef<number>(1);
  const turnIdRef = useRef<number>(1);
  const lastSeenStateVersionRef = useRef<number>(0);
  const hasRolledForCurrentTurnRef = useRef<boolean>(false);

  // Host-only private state
  const slotTokensRef = useRef<Map<number, string>>(new Map()); // slotIndex -> reconnectToken
  const processedRequestIdsRef = useRef<Set<string>>(new Set());
  const lastEmoteTimeRef = useRef<Map<number, number>>(new Map());

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
  });

  stateRef.current = {
    isHost,
    players,
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
        setStatusDetail('');
      } else if (st === 'disconnected' || st === 'error') {
        // Keep error detail
      }
    });

    return () => {
      unsubStatus();
    };
  }, []);

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
      const s = stateRef.current;
      const peerId = fromPeerId ?? '';

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
            const humanCount = s.players.filter((p) => !p.isCpu).length;
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
            const occupiedSlots = new Set(s.players.map((p) => p.slotIndex));
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
            const takenColors = new Set(s.players.map((p) => p.colorId));
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

            const updatedPlayers = [...s.players, newPlayer].sort(
              (a, b) => a.slotIndex - b.slotIndex,
            );

            stateVersionRef.current += 1;
            setPlayers(updatedPlayers);

            // Send ACCEPTED to the joining guest with their private reconnect token
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
            });

            // Broadcast updated lobby roster ONLY to other joined peers
            peerManager.broadcast({
              type: 'LOBBY_UPDATE',
              players: updatedPlayers,
              speed: s.speed,
              winRule: s.winRule,
              stateVersion: stateVersionRef.current,
            });

            saveSession({
              roomCode: s.roomCode,
              playerId: s.players[0]?.playerId || getOrCreatePlayerId(),
              playerName: s.players[0]?.name || 'Host',
              colorId: s.players[0]?.colorId || 0,
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
            if (!expectedToken || expectedToken !== packet.reconnectToken) {
              // Failed token authentication
              peerManager.sendToPeer(peerId, {
                type: 'RECONNECT_REJECTED',
                requestId: packet.requestId,
                reason: 'Authentication failed: Invalid or expired reconnect token.',
              });
              peerManager.closeConnection(peerId, 'Invalid reconnect token');
              return;
            }

            const targetPlayer = s.players.find((p) => p.slotIndex === packet.slotIndex);
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

            const updated = s.players.map((p) =>
              p.slotIndex === packet.slotIndex ? restored : p,
            );

            stateVersionRef.current += 1;
            setPlayers(updated);

            const configs: PlayerConfig[] = updated.map((p) => ({
              id: p.slotIndex,
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
              gameState: currentGameState,
            });

            peerManager.broadcast({
              type: 'LOBBY_UPDATE',
              players: updated,
              speed: s.speed,
              winRule: s.winRule,
              stateVersion: stateVersionRef.current,
            });

            saveSession({
              roomCode: s.roomCode,
              playerId: s.players[0]?.playerId || getOrCreatePlayerId(),
              playerName: s.players[0]?.name || 'Host',
              colorId: s.players[0]?.colorId || 0,
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
            const isTaken = s.players.some(
              (p) => p.slotIndex !== packet.slotIndex && p.colorId === packet.colorId,
            );
            if (isTaken) return;

            const updated = s.players.map((p) =>
              p.slotIndex === packet.slotIndex ? { ...p, colorId: packet.colorId } : p,
            );
            stateVersionRef.current += 1;
            setPlayers(updated);

            peerManager.broadcast({
              type: 'LOBBY_UPDATE',
              players: updated,
              speed: s.speed,
              winRule: s.winRule,
              stateVersion: stateVersionRef.current,
            });
            break;
          }

          case 'ROLL_REQUEST': {
            // Validate connection is joined
            const admission = peerManager.getAdmissionState(peerId);
            if (admission !== 'joined') {
              peerManager.closeConnection(peerId, 'Unauthenticated ROLL_REQUEST');
              return;
            }

            // Validate turn ID
            if (packet.turnId !== turnIdRef.current) {
              // Stale or future turn request
              return;
            }

            // Check if roll already generated for current turn
            if (hasRolledForCurrentTurnRef.current) {
              // Reject duplicate roll
              return;
            }

            // Check if current turn actually belongs to this player's slot
            const snapshot = callbacksRef.current.getGameStateSnapshot?.();
            const currentTurn = snapshot ? snapshot.turn : s.mySlot;
            if (packet.slotIndex !== currentTurn) {
              // Out-of-turn request
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
              const dcPlayer = s.players.find((p) => p.slotIndex === dcSlot);
              if (dcPlayer && !dcPlayer.isCpu) {
                const cleanName = stripCpuSuffix(dcPlayer.name);
                // Convert to CPU bot so game can continue
                const converted = s.players.map((p) =>
                  p.slotIndex === dcSlot
                    ? { ...p, isCpu: true, name: `${cleanName} (CPU)` }
                    : p,
                );
                stateVersionRef.current += 1;
                setPlayers(converted);

                peerManager.broadcast({
                  type: 'LOBBY_UPDATE',
                  players: converted,
                  speed: s.speed,
                  winRule: s.winRule,
                  stateVersion: stateVersionRef.current,
                });

                const configs: PlayerConfig[] = converted.map((p) => ({
                  id: p.slotIndex,
                  name: p.name,
                  isCpu: p.isCpu,
                  colorId: p.colorId,
                }));
                callbacksRef.current.onPlayersUpdated?.(configs);
                callbacksRef.current.onPlayerDisconnected?.(dcPlayer.slotIndex, cleanName);

                saveSession({
                  roomCode: s.roomCode,
                  playerId: s.players[0]?.playerId || getOrCreatePlayerId(),
                  playerName: s.players[0]?.name || 'Host',
                  colorId: s.players[0]?.colorId || 0,
                  slotIndex: 0,
                  isHost: true,
                  maxPlayers: s.maxPlayers,
                  speed: s.speed,
                  winRule: s.winRule,
                  players: converted,
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
            setPlayers(packet.players);
            turnIdRef.current = packet.turnId;
            setStatus('connected');
            setIsOnline(true);
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
            });
            refreshSavedSession();
            break;
          }

          case 'RECONNECT_ACCEPTED': {
            setMySlot(packet.slotIndex);
            setRoomCode(packet.roomCode);
            setSpeed(packet.speed);
            setWinRule(packet.winRule);
            setPlayers(packet.players);
            turnIdRef.current = packet.turnId;
            setStatus('connected');
            setIsOnline(true);
            setStatusDetail('Reconnected to match!');

            const me = packet.players.find((x) => x.slotIndex === packet.slotIndex);
            saveSession({
              roomCode: packet.roomCode,
              playerId: me?.playerId || getOrCreatePlayerId(),
              reconnectToken: packet.reconnectToken,
              playerName: me ? stripCpuSuffix(me.name) : 'Player',
              colorId: me?.colorId ?? packet.slotIndex,
              slotIndex: packet.slotIndex,
              isHost: false,
            });
            refreshSavedSession();

            const configs: PlayerConfig[] = packet.players.map((x) => ({
              id: x.slotIndex,
              name: x.isCpu ? `${stripCpuSuffix(x.name)} (CPU)` : stripCpuSuffix(x.name),
              isCpu: x.isCpu,
              colorId: x.colorId,
            }));

            callbacksRef.current.onPlayersUpdated?.(configs);
            callbacksRef.current.onReconnected?.(
              configs,
              packet.speed,
              packet.winRule,
              packet.gameState,
            );
            break;
          }

          case 'JOIN_REJECTED':
          case 'RECONNECT_REJECTED': {
            clearSession();
            refreshSavedSession();
            setStatus('error');
            setStatusDetail(packet.reason);
            break;
          }

          case 'LOBBY_UPDATE': {
            setPlayers(packet.players);
            setSpeed(packet.speed);
            setWinRule(packet.winRule);

            const configs: PlayerConfig[] = packet.players.map((p) => ({
              id: p.slotIndex,
              name: p.isCpu ? `${stripCpuSuffix(p.name)} (CPU)` : stripCpuSuffix(p.name),
              isCpu: p.isCpu,
              colorId: p.colorId,
            }));
            callbacksRef.current.onPlayersUpdated?.(configs);
            break;
          }

          case 'GAME_START': {
            setPlayers(packet.players);
            setSpeed(packet.speed);
            setWinRule(packet.winRule);
            turnIdRef.current = packet.turnId;

            const configs: PlayerConfig[] = packet.players.map((p) => ({
              id: p.slotIndex,
              name: p.name,
              isCpu: p.isCpu,
              colorId: p.colorId,
            }));
            callbacksRef.current.onGameStart?.(configs, packet.speed, packet.winRule);
            break;
          }

          case 'ROLL_RESULT': {
            turnIdRef.current = packet.turnId;
            callbacksRef.current.onRemoteRoll?.(packet.player, packet.roll);
            break;
          }

          case 'SYNC_CHECKPOINT': {
            turnIdRef.current = packet.turnId;
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

      stateVersionRef.current = session?.stateVersion || 1;
      turnIdRef.current = session?.turnId || 1;
      hasRolledForCurrentTurnRef.current = false;
      processedRequestIdsRef.current.clear();

      if (session?.slotTokens && session.slotTokens.length > 0) {
        slotTokensRef.current = new Map(session.slotTokens);
      } else {
        slotTokensRef.current.clear();
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

      let restoredPlayers: NetworkPlayer[] = [hostPlayer];
      if (session?.players && session.players.length > 1) {
        restoredPlayers = session.players.map((p) =>
          p.slotIndex === 0
            ? hostPlayer
            : {
                ...p,
                isCpu: true,
                peerId: '',
              },
        );
      }

      setPlayers(restoredPlayers);
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
        window.location.hash = `room=${code}`;

        if (isRehost && session?.gameState?.isPlaying) {
          const configs: PlayerConfig[] = restoredPlayers.map((p) => ({
            id: p.slotIndex,
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
      } catch (err) {
        setIsHost(false);
        clearSession();
        refreshSavedSession();
        throw err;
      }
    },
    [refreshSavedSession],
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
        setIsHost(false);
        setRoomCode(code);
        lastSeenStateVersionRef.current = 0;

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
    [createRoom, maxPlayers, speed, winRule],
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

      setIsHost(false);
      setRoomCode(cleanCode);
      lastSeenStateVersionRef.current = 0;

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
        throw err;
      }
    },
    [reconnectRoom, refreshSavedSession],
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
        const updated = s.players.map((p) =>
          p.slotIndex === slotIdx ? { ...p, colorId: newColorId } : p,
        );
        stateVersionRef.current += 1;
        setPlayers(updated);
        peerManager.broadcast({
          type: 'LOBBY_UPDATE',
          players: updated,
          speed: s.speed,
          winRule: s.winRule,
          stateVersion: stateVersionRef.current,
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
    [],
  );

  /* Toggle a slot to CPU bot (Host only) */
  const toggleCpuSlot = useCallback(
    (slotIdx: number) => {
      if (!isHost) return;
      setPlayers((curr) => {
        const exists = curr.find((p) => p.slotIndex === slotIdx);
        let updated: NetworkPlayer[];
        if (exists) {
          if (exists.isCpu) {
            updated = curr.filter((p) => p.slotIndex !== slotIdx);
            slotTokensRef.current.delete(slotIdx);
          } else {
            return curr;
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

        stateVersionRef.current += 1;
        peerManager.broadcast({
          type: 'LOBBY_UPDATE',
          players: updated,
          speed,
          winRule,
          stateVersion: stateVersionRef.current,
        });

        return updated;
      });
    },
    [isHost, speed, winRule],
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
        players,
        speed: newSpeed,
        winRule: newRule,
        stateVersion: stateVersionRef.current,
      });
    },
    [isHost, players],
  );

  /* Host starts the game */
  const startGame = useCallback(() => {
    if (!isHost) return;
    if (players.length < 2) return;

    turnIdRef.current = 1;
    hasRolledForCurrentTurnRef.current = false;
    stateVersionRef.current += 1;

    peerManager.broadcast({
      type: 'GAME_START',
      players,
      speed,
      winRule,
      stateVersion: stateVersionRef.current,
      turnId: turnIdRef.current,
    });

    const configs: PlayerConfig[] = players.map((p) => ({
      id: p.slotIndex,
      name: p.name,
      isCpu: p.isCpu,
      colorId: p.colorId,
    }));

    saveSession({
      roomCode,
      playerId: players[0]?.playerId || getOrCreatePlayerId(),
      playerName: players[0]?.name || 'Host',
      colorId: players[0]?.colorId || 0,
      slotIndex: 0,
      isHost: true,
      maxPlayers,
      speed,
      winRule,
      players,
      slotTokens: Array.from(slotTokensRef.current.entries()),
      turnId: turnIdRef.current,
      stateVersion: stateVersionRef.current,
      gameState: {
        pos: configs.map(() => 0),
        turn: 0,
        phase: 'idle',
        rolls: configs.map(() => 0),
        laddersHit: configs.map(() => 0),
        snakesHit: configs.map(() => 0),
        sixesHit: configs.map(() => 0),
        winner: -1,
        isPlaying: true,
      },
    });
    refreshSavedSession();

    callbacksRef.current.onGameStart?.(configs, speed, winRule);
  }, [isHost, maxPlayers, players, refreshSavedSession, roomCode, speed, winRule]);

  /* Broadcast roll result (Host) or send roll request (Guest) */
  const broadcastRoll = useCallback(
    (player: number, roll: number) => {
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

      peerManager.broadcast({
        type: 'SYNC_CHECKPOINT',
        ...checkpoint,
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
        players,
        slotTokens: Array.from(slotTokensRef.current.entries()),
        gameState: {
          ...checkpoint,
          isPlaying: checkpoint.winner < 0,
        },
        turnId: turnIdRef.current,
        stateVersion: stateVersionRef.current,
      });
      refreshSavedSession();
    },
    [isHost, maxPlayers, players, refreshSavedSession, roomCode, speed, winRule],
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
    peerManager.cleanup();
    clearSession();
    refreshSavedSession();
    setIsOnline(false);
    setIsHost(false);
    setRoomCode('');
    setPlayers([]);
    setStatus('idle');
    setStatusDetail('');
    stateVersionRef.current = 1;
    turnIdRef.current = 1;
    lastSeenStateVersionRef.current = 0;
    slotTokensRef.current.clear();
    processedRequestIdsRef.current.clear();
    lastEmoteTimeRef.current.clear();

    if (window.location.hash.startsWith('#room=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [refreshSavedSession]);

  return {
    isOnline,
    isHost,
    roomCode,
    mySlot,
    status,
    statusDetail,
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
