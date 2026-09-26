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

/**
 * (P0) Wire protocol version.
 *
 * Bump this whenever a packet's shape or semantics change in a way an older
 * peer could silently misread. It is checked once, at admission
 * (`JOIN_REQUEST` / `RECONNECT_REQUEST`), so a mismatched client is told
 * plainly instead of failing later as an inscrutable desync.
 *
 * v1 = the original unversioned protocol (accepted when `v` is absent, so a
 * cached old tab still gets a clear rejection rather than a silent hang).
 */
export const PROTOCOL_VERSION = 2;

/** Why the host refused to serve an authoritative roll. */
export type RollRejectReason =
  | 'not-your-turn'
  | 'not-awaiting-roll'
  | 'already-rolled'
  | 'stale-turn'
  | 'rate-limited'
  | 'match-not-playing';

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
      /** (P0) Protocol version. `1` is implied when absent. */
      v?: number;
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
      v: number;
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
      /** (P0) Protocol version. `1` is implied when absent. */
      v?: number;
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
      v: number;
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
      /** Authoritative opening board, so guests can re-arm their stored session. */
      gameState?: GameStateSnapshot;
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
      /**
       * (P0) The host's authoritative "no" for a ROLL_REQUEST.
       *
       * Previously every rejection path was a bare `return` with no reply, so
       * a guest that had latched `awaitingRemoteRoll` before sending waited
       * forever and its roll button was permanently dead. Every rejection now
       * answers, and the guest additionally self-heals on a local timeout.
       */
      type: 'ROLL_REJECTED';
      requestId: string;
      reason: RollRejectReason;
      /** The host's current turn id, so the guest can resync immediately. */
      turnId: number;
      stateVersion: number;
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
