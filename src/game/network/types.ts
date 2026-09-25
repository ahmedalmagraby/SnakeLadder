import type { GameSpeed, WinRule } from '../constants';

export type AdmissionState = 'pending' | 'authenticated' | 'joined' | 'closed';

export const MAX_PACKET_BYTES = 16384;
export const MAX_STRING_LEN = 128;
export const MAX_PLAYER_NAME_LEN = 24;
export const MAX_ROOM_CODE_LEN = 6;
export const MAX_REASON_LEN = 128;
export const MAX_TOKEN_LEN = 64;
export const MAX_REQUEST_ID_LEN = 64;
export const MAX_PLAYERS = 4;
export const ALLOWED_EMOJIS = ['🐍', '🪜', '🎲', '👑', '😱', '😂', '🔥', '🎯'] as const;
export type AllowedEmoji = typeof ALLOWED_EMOJIS[number];
export const MIN_EMOTE_INTERVAL_MS = 1000;

export interface NetworkPlayer {
  playerId: string;
  peerId: string;
  name: string;
  slotIndex: number;
  colorId: number;
  isHost: boolean;
  isCpu: boolean;
  isReady: boolean;
  ping?: number;
}

export type CheckpointMode = 'idle' | 'playing' | 'over';

export interface GameStateSnapshot {
  mode: CheckpointMode;
  pos: number[];
  turn: number;
  phase: string;
  rolls: number[];
  laddersHit: number[];
  snakesHit: number[];
  sixesHit: number[];
  winner: number;
  isPlaying?: boolean;
}

export type ConnectionStatus =
  | 'idle'
  | 'creating'
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type TransportStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export type AuthStatus =
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'rejected';

export type RoomMembership =
  | 'none'
  | 'joining'
  | 'joined'
  | 'left';

export type GameLifecycleStatus =
  | 'none'
  | 'lobby'
  | 'playing'
  | 'paused'
  | 'over'
  | 'abandoned';

export interface NetworkLifecycleState {
  transportStatus: TransportStatus;
  authStatus: AuthStatus;
  roomMembership: RoomMembership;
  gameStatus: GameLifecycleStatus;
  statusDetail: string;
  isOnline: boolean;
}

/* ---------- Packet Messages ---------- */

export type Packet =
  | {
      type: 'JOIN_REQUEST';
      requestId: string;
      roomCode: string;
      name: string;
      colorId: number;
    }
  | {
      type: 'JOIN_ACCEPTED';
      requestId: string;
      slotIndex: number;
      reconnectToken: string;
      roomCode: string;
      speed: GameSpeed;
      winRule: WinRule;
      players: NetworkPlayer[];
      stateVersion: number;
      turnId: number;
      maxPlayers: number;
      gameState?: GameStateSnapshot;
    }
  | {
      type: 'JOIN_REJECTED';
      requestId: string;
      reason: string;
    }
  | {
      type: 'RECONNECT_REQUEST';
      requestId: string;
      roomCode: string;
      slotIndex: number;
      reconnectToken: string;
    }
  | {
      type: 'RECONNECT_ACCEPTED';
      requestId: string;
      slotIndex: number;
      reconnectToken: string;
      roomCode: string;
      speed: GameSpeed;
      winRule: WinRule;
      players: NetworkPlayer[];
      stateVersion: number;
      turnId: number;
      maxPlayers: number;
      gameState?: GameStateSnapshot;
    }
  | {
      type: 'RECONNECT_REJECTED';
      requestId: string;
      reason: string;
    }
  | {
      type: 'COLOR_CHANGE_REQUEST';
      requestId: string;
      slotIndex: number;
      colorId: number;
    }
  | {
      type: 'LOBBY_UPDATE';
      players: NetworkPlayer[];
      speed: GameSpeed;
      winRule: WinRule;
      stateVersion: number;
      maxPlayers: number;
    }
  | {
      type: 'GAME_START';
      players: NetworkPlayer[];
      speed: GameSpeed;
      winRule: WinRule;
      stateVersion: number;
      turnId: number;
    }
  | {
      type: 'ROLL_REQUEST';
      requestId: string;
      turnId: number;
      slotIndex: number;
    }
  | {
      type: 'ROLL_RESULT';
      player: number;
      roll: number;
      turnId: number;
      stateVersion: number;
      timestamp: number;
    }
  | {
      type: 'SYNC_CHECKPOINT';
      mode: CheckpointMode;
      pos: number[];
      turn: number;
      phase: string;
      rolls: number[];
      laddersHit: number[];
      snakesHit: number[];
      sixesHit: number[];
      winner: number;
      stateVersion: number;
      turnId: number;
    }
  | {
      type: 'EMOTE';
      requestId: string;
      player: number;
      emoji: string;
      timestamp: number;
    }
  | {
      type: 'PLAYER_DISCONNECTED';
      slotIndex: number;
      name: string;
      stateVersion: number;
    }
  | {
      type: 'PING';
      sentAt: number;
    }
  | {
      type: 'PONG';
      sentAt: number;
    };

export type PacketType = Packet['type'];
