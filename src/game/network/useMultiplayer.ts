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
import type { ConnectionStatus, NetworkPlayer, Packet } from './types';

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
  onReconnected?: (
    players: PlayerConfig[],
    speed: GameSpeed,
    winRule: WinRule,
    gameState?: any,
  ) => void;
  getGameStateSnapshot?: () => any;
}

export function useMultiplayer({
  onGameStart,
  onRemoteRoll,
  onSyncCheckpoint,
  onEmoteReceived,
  onPlayerDisconnected,
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

  // Keep references to state and callbacks for packet handlers
  const stateRef = useRef({
    isHost: false,
    players: [] as NetworkPlayer[],
    maxPlayers: 4,
    speed: 'normal' as GameSpeed,
    winRule: 'exact' as WinRule,
    mySlot: 0,
  });

  const callbacksRef = useRef({
    onGameStart,
    onRemoteRoll,
    onSyncCheckpoint,
    onEmoteReceived,
    onPlayerDisconnected,
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
  };

  callbacksRef.current = {
    onGameStart,
    onRemoteRoll,
    onSyncCheckpoint,
    onEmoteReceived,
    onPlayerDisconnected,
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

      switch (packet.type) {
        case 'JOIN_REQUEST': {
          if (!s.isHost) return;

          // Check if this player was already in room and is rejoining
          const existingSlot = s.players.find(
            (p) =>
              p.playerId === packet.playerId ||
              (p.isCpu && p.name.replace(' (CPU)', '') === packet.name),
          );

          if (existingSlot) {
            const restoredPlayer: NetworkPlayer = {
              ...existingSlot,
              peerId: fromPeerId ?? '',
              playerId: packet.playerId,
              name: packet.name || existingSlot.name.replace(' (CPU)', ''),
              isCpu: false,
              isReady: true,
            };

            const updatedPlayers = s.players.map((p) =>
              p.slotIndex === existingSlot.slotIndex ? restoredPlayer : p,
            );

            setPlayers(updatedPlayers);
            const currentGameState = callbacksRef.current.getGameStateSnapshot?.();

            peerManager.sendToPeer(fromPeerId ?? '', {
              type: 'RECONNECT_ACCEPTED',
              slotIndex: existingSlot.slotIndex,
              roomCode: peerManager.getRoomCode(),
              speed: s.speed,
              winRule: s.winRule,
              players: updatedPlayers,
              gameState: currentGameState,
            });

            peerManager.broadcast({
              type: 'LOBBY_UPDATE',
              players: updatedPlayers,
              speed: s.speed,
              winRule: s.winRule,
            });
            break;
          }

          // Check if room is full
          const humanCount = s.players.filter((p) => !p.isCpu).length;
          if (humanCount >= s.maxPlayers) {
            peerManager.sendToPeer(fromPeerId ?? '', {
              type: 'JOIN_REJECTED',
              reason: 'Room is already full.',
            });
            return;
          }

          // Assign next open slot
          const occupiedSlots = new Set(s.players.map((p) => p.slotIndex));
          let assignedSlot = -1;
          for (let i = 0; i < s.maxPlayers; i++) {
            if (!occupiedSlots.has(i)) {
              assignedSlot = i;
              break;
            }
          }

          if (assignedSlot === -1) {
            peerManager.sendToPeer(fromPeerId ?? '', {
              type: 'JOIN_REJECTED',
              reason: 'No available slots.',
            });
            return;
          }

          // Ensure strictly UNIQUE color!
          const takenColors = new Set(s.players.map((p) => p.colorId));
          let finalColorId = packet.colorId;
          if (takenColors.has(finalColorId) || finalColorId < 0 || finalColorId > 3) {
            finalColorId = [0, 1, 2, 3].find((c) => !takenColors.has(c)) ?? assignedSlot;
          }

          const newPlayer: NetworkPlayer = {
            playerId: packet.playerId,
            peerId: fromPeerId ?? '',
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

          setPlayers(updatedPlayers);

          // Tell the joining guest they are accepted
          peerManager.sendToPeer(fromPeerId ?? '', {
            type: 'JOIN_ACCEPTED',
            slotIndex: assignedSlot,
            roomCode: peerManager.getRoomCode(),
            speed: s.speed,
            winRule: s.winRule,
            players: updatedPlayers,
          });

          // Broadcast updated lobby roster to all other peers
          peerManager.broadcast({
            type: 'LOBBY_UPDATE',
            players: updatedPlayers,
            speed: s.speed,
            winRule: s.winRule,
          });
          break;
        }

        case 'RECONNECT_REQUEST': {
          if (!s.isHost) return;

          const match = s.players.find(
            (p) =>
              p.playerId === packet.playerId ||
              (p.isCpu && p.name.replace(' (CPU)', '') === packet.name),
          );

          if (!match) {
            peerManager.sendToPeer(fromPeerId ?? '', {
              type: 'RECONNECT_REJECTED',
              reason: 'No matching player slot found to rejoin.',
            });
            return;
          }

          const restored: NetworkPlayer = {
            ...match,
            peerId: fromPeerId ?? '',
            playerId: packet.playerId,
            name: packet.name || match.name.replace(' (CPU)', ''),
            isCpu: false,
            isReady: true,
          };

          const updated = s.players.map((p) =>
            p.slotIndex === match.slotIndex ? restored : p,
          );

          setPlayers(updated);
          const currentGameState = callbacksRef.current.getGameStateSnapshot?.();

          peerManager.sendToPeer(fromPeerId ?? '', {
            type: 'RECONNECT_ACCEPTED',
            slotIndex: match.slotIndex,
            roomCode: peerManager.getRoomCode(),
            speed: s.speed,
            winRule: s.winRule,
            players: updated,
            gameState: currentGameState,
          });

          peerManager.broadcast({
            type: 'LOBBY_UPDATE',
            players: updated,
            speed: s.speed,
            winRule: s.winRule,
          });
          break;
        }

        case 'JOIN_ACCEPTED': {
          setMySlot(packet.slotIndex);
          setRoomCode(packet.roomCode);
          setSpeed(packet.speed);
          setWinRule(packet.winRule);
          setPlayers(packet.players);
          setStatus('connected');
          setIsOnline(true);
          setStatusDetail('Joined room successfully!');

          const p = packet.players.find((x) => x.slotIndex === packet.slotIndex);
          saveSession({
            roomCode: packet.roomCode,
            playerId: getOrCreatePlayerId(),
            playerName: p?.name || 'Player',
            colorId: p?.colorId ?? packet.slotIndex,
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
          setStatus('connected');
          setIsOnline(true);
          setStatusDetail('Reconnected to match!');

          const p = packet.players.find((x) => x.slotIndex === packet.slotIndex);
          saveSession({
            roomCode: packet.roomCode,
            playerId: getOrCreatePlayerId(),
            playerName: p?.name || 'Player',
            colorId: p?.colorId ?? packet.slotIndex,
            slotIndex: packet.slotIndex,
            isHost: false,
          });
          refreshSavedSession();

          const configs: PlayerConfig[] = packet.players.map((x) => ({
            id: x.slotIndex,
            name: x.name,
            isCpu: x.isCpu,
            colorId: x.colorId,
          }));

          callbacksRef.current.onReconnected?.(
            configs,
            packet.speed,
            packet.winRule,
            packet.gameState,
          );
          break;
        }

        case 'RECONNECT_REJECTED': {
          clearSession();
          refreshSavedSession();
          setStatus('error');
          setStatusDetail(packet.reason);
          break;
        }

        case 'JOIN_REJECTED': {
          setStatus('error');
          setStatusDetail(packet.reason);
          break;
        }

        case 'CHANGE_COLOR': {
          if (!s.isHost) return;
          const isTaken = s.players.some(
            (p) => p.slotIndex !== packet.slotIndex && p.colorId === packet.colorId,
          );
          if (isTaken) return;

          const updated = s.players.map((p) =>
            p.slotIndex === packet.slotIndex ? { ...p, colorId: packet.colorId } : p,
          );
          setPlayers(updated);
          peerManager.broadcast({
            type: 'LOBBY_UPDATE',
            players: updated,
            speed: s.speed,
            winRule: s.winRule,
          });
          break;
        }

        case 'LOBBY_UPDATE': {
          setPlayers(packet.players);
          setSpeed(packet.speed);
          setWinRule(packet.winRule);
          break;
        }

        case 'GAME_START': {
          setPlayers(packet.players);
          setSpeed(packet.speed);
          setWinRule(packet.winRule);
          const configs: PlayerConfig[] = packet.players.map((p) => ({
            id: p.slotIndex,
            name: p.name,
            isCpu: p.isCpu,
            colorId: p.colorId,
          }));
          callbacksRef.current.onGameStart?.(configs, packet.speed, packet.winRule);
          break;
        }

        case 'DICE_ROLL': {
          callbacksRef.current.onRemoteRoll?.(packet.player, packet.roll);
          break;
        }

        case 'SYNC_CHECKPOINT': {
          callbacksRef.current.onSyncCheckpoint?.(packet);
          break;
        }

        case 'EMOTE': {
          callbacksRef.current.onEmoteReceived?.(packet.player, packet.emoji);
          break;
        }

        case 'PLAYER_DISCONNECTED': {
          const dcSlot = packet.slotIndex;
          if (s.isHost) {
            // Find disconnected player by peerId or slot
            const dcPlayer = s.players.find(
              (p) => p.peerId === fromPeerId || p.slotIndex === dcSlot,
            );
            if (dcPlayer) {
              // Convert to CPU bot so game keeps going
              const converted = s.players.map((p) =>
                p.slotIndex === dcPlayer.slotIndex
                  ? { ...p, isCpu: true, name: `${p.name.replace(' (CPU)', '')} (CPU)` }
                  : p,
              );
              setPlayers(converted);
              peerManager.broadcast({
                type: 'LOBBY_UPDATE',
                players: converted,
                speed: s.speed,
                winRule: s.winRule,
              });
              callbacksRef.current.onPlayerDisconnected?.(dcPlayer.slotIndex, dcPlayer.name);
            }
          }
          break;
        }
      }
    });

    return () => {
      unsubPacket();
    };
  }, [refreshSavedSession]);

  /* Host creates room */
  const createRoom = useCallback(
    async (
      hostName: string,
      colorId = 0,
      capacity = 4,
      initialSpeed: GameSpeed = 'normal',
      initialRule: WinRule = 'exact',
    ) => {
      const code = generateRoomCode();
      const myPlayerId = getOrCreatePlayerId();
      setIsHost(true);
      setRoomCode(code);
      setMySlot(0);
      setMaxPlayers(capacity);
      setSpeed(initialSpeed);
      setWinRule(initialRule);

      const hostPlayer: NetworkPlayer = {
        playerId: myPlayerId,
        peerId: 'host',
        name: hostName.trim() || 'Host',
        slotIndex: 0,
        colorId,
        isHost: true,
        isCpu: false,
        isReady: true,
      };

      setPlayers([hostPlayer]);
      saveSession({
        roomCode: code,
        playerId: myPlayerId,
        playerName: hostPlayer.name,
        colorId,
        slotIndex: 0,
        isHost: true,
      });
      refreshSavedSession();

      try {
        await peerManager.createRoom(code, hostPlayer.name, colorId);
        window.location.hash = `room=${code}`;
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

  /* Guest joins or reconnects to room */
  const joinRoom = useCallback(
    async (code: string, guestName: string, colorId = 1, isReconnect = false) => {
      const cleanCode = code.toUpperCase().trim();
      setIsHost(false);
      setRoomCode(cleanCode);
      const myPlayerId = getOrCreatePlayerId();

      try {
        await peerManager.joinRoom(
          cleanCode,
          guestName.trim() || 'Player',
          colorId,
          myPlayerId,
          isReconnect,
        );
        window.location.hash = `room=${cleanCode}`;
      } catch (err) {
        throw err;
      }
    },
    [],
  );

  /* Reconnect using saved session */
  const reconnectRoom = useCallback(
    async (targetRoomCode?: string) => {
      const session = getSavedSession();
      const code = (targetRoomCode || session?.roomCode || '').toUpperCase().trim();
      if (!code) return;

      if (session?.isHost) {
        return createRoom(session.playerName, session.colorId, maxPlayers, speed, winRule);
      } else {
        return joinRoom(
          code,
          session?.playerName || 'Player',
          session?.colorId ?? 1,
          true,
        );
      }
    },
    [createRoom, joinRoom, maxPlayers, speed, winRule],
  );

  /* Change color of a player */
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
        setPlayers(updated);
        peerManager.broadcast({
          type: 'LOBBY_UPDATE',
          players: updated,
          speed: s.speed,
          winRule: s.winRule,
        });
      } else {
        peerManager.sendToPeer('host', {
          type: 'CHANGE_COLOR',
          slotIndex: slotIdx,
          colorId: newColorId,
        } as Packet);
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
          // If was CPU, remove slot. If was human, don't remove.
          if (exists.isCpu) {
            updated = curr.filter((p) => p.slotIndex !== slotIdx);
          } else {
            return curr;
          }
        } else {
          // Ensure bot gets unique color
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

        peerManager.broadcast({
          type: 'LOBBY_UPDATE',
          players: updated,
          speed,
          winRule,
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
      peerManager.broadcast({
        type: 'LOBBY_UPDATE',
        players,
        speed: newSpeed,
        winRule: newRule,
      });
    },
    [isHost, players],
  );

  /* Host starts the game */
  const startGame = useCallback(() => {
    if (!isHost) return;
    if (players.length < 2) return;

    peerManager.broadcast({
      type: 'GAME_START',
      players,
      speed,
      winRule,
    });

    const configs: PlayerConfig[] = players.map((p) => ({
      id: p.slotIndex,
      name: p.name,
      isCpu: p.isCpu,
      colorId: p.colorId,
    }));

    callbacksRef.current.onGameStart?.(configs, speed, winRule);
  }, [isHost, players, speed, winRule]);

  /* Broadcast dice roll */
  const broadcastRoll = useCallback(
    (player: number, roll: number) => {
      peerManager.broadcast({
        type: 'DICE_ROLL',
        player,
        roll,
        timestamp: Date.now(),
      });
    },
    [],
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
      peerManager.broadcast({
        type: 'SYNC_CHECKPOINT',
        ...checkpoint,
      });
    },
    [isHost],
  );

  /* Broadcast reaction emoji */
  const broadcastEmote = useCallback(
    (emoji: string) => {
      peerManager.broadcast({
        type: 'EMOTE',
        player: mySlot,
        emoji,
        timestamp: Date.now(),
      });
      // Also emit locally
      callbacksRef.current.onEmoteReceived?.(mySlot, emoji);
    },
    [mySlot],
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
