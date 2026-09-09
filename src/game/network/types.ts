import type { GameSpeed, WinRule } from '../constants';

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

export type ConnectionStatus =
  | 'idle'
  | 'creating'
  | 'joining'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

/* ---------- Packet Messages ---------- */

export type Packet =
  | {
      type: 'JOIN_REQUEST';
      playerId: string;
      name: string;
      colorId: number;
    }
  | {
      type: 'JOIN_ACCEPTED';
      slotIndex: number;
      roomCode: string;
      speed: GameSpeed;
      winRule: WinRule;
      players: NetworkPlayer[];
    }
  | {
      type: 'JOIN_REJECTED';
      reason: string;
    }
  | {
      type: 'RECONNECT_REQUEST';
      roomCode: string;
      playerId: string;
      name: string;
    }
  | {
      type: 'RECONNECT_ACCEPTED';
      slotIndex: number;
      roomCode: string;
      speed: GameSpeed;
      winRule: WinRule;
      players: NetworkPlayer[];
      gameState?: {
        pos: number[];
        turn: number;
        phase: string;
        rolls: number[];
        laddersHit: number[];
        snakesHit: number[];
        sixesHit: number[];
        winner: number;
        isPlaying: boolean;
      };
    }
  | {
      type: 'RECONNECT_REJECTED';
      reason: string;
    }
  | {
      type: 'CHANGE_COLOR';
      slotIndex: number;
      colorId: number;
    }
  | {
      type: 'LOBBY_UPDATE';
      players: NetworkPlayer[];
      speed: GameSpeed;
      winRule: WinRule;
    }
  | {
      type: 'GAME_START';
      players: NetworkPlayer[];
      speed: GameSpeed;
      winRule: WinRule;
    }
  | {
      type: 'DICE_ROLL';
      player: number;
      roll: number;
      timestamp: number;
    }
  | {
      type: 'SYNC_CHECKPOINT';
      pos: number[];
      turn: number;
      phase: string;
      rolls: number[];
      laddersHit: number[];
      snakesHit: number[];
      sixesHit: number[];
      winner: number;
    }
  | {
      type: 'EMOTE';
      player: number;
      emoji: string;
      timestamp: number;
    }
  | {
      type: 'PLAYER_DISCONNECTED';
      slotIndex: number;
      name: string;
    }
  | {
      type: 'PING';
      sentAt: number;
    }
  | {
      type: 'PONG';
      sentAt: number;
    };
