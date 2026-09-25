import {
  ALLOWED_EMOJIS,
  MAX_PACKET_BYTES,
  MAX_PLAYER_NAME_LEN,
  MAX_PLAYERS,
  MAX_REASON_LEN,
  MAX_REQUEST_ID_LEN,
  MAX_ROOM_CODE_LEN,
  MAX_STRING_LEN,
  MAX_TOKEN_LEN,
  type AllowedEmoji,
  type GameStateSnapshot,
  type NetworkPlayer,
  type Packet,
  type PacketType,
  type CheckpointMode,
} from './types';
import type { GameSpeed, WinRule } from '../constants';

const VALID_SPEEDS = new Set<string>(['normal', 'fast', 'turbo']);
const VALID_WIN_RULES = new Set<string>(['exact', 'bounce']);
const VALID_CHECKPOINT_MODES = new Set<string>(['idle', 'playing', 'over']);
const VALID_PHASES = new Set<string>([
  'idle',
  'rolling',
  'moving',
  'sliding',
  'settling',
  'waiting',
  'over',
]);

export function isValidCheckpointMode(val: unknown): val is CheckpointMode {
  return typeof val === 'string' && VALID_CHECKPOINT_MODES.has(val);
}

const ALLOWED_EMOJI_SET = new Set<string>(ALLOWED_EMOJIS);

export const GUEST_PERMITTED_PACKETS = new Set<PacketType>([
  'JOIN_REQUEST',
  'RECONNECT_REQUEST',
  'COLOR_CHANGE_REQUEST',
  'ROLL_REQUEST',
  'EMOTE',
  'PING',
  'PONG',
]);

export const HOST_ONLY_PACKETS = new Set<PacketType>([
  'JOIN_ACCEPTED',
  'JOIN_REJECTED',
  'RECONNECT_ACCEPTED',
  'RECONNECT_REJECTED',
  'LOBBY_UPDATE',
  'GAME_START',
  'ROLL_RESULT',
  'SYNC_CHECKPOINT',
  'PLAYER_DISCONNECTED',
]);

export function isGuestAllowedPacket(type: string): boolean {
  return GUEST_PERMITTED_PACKETS.has(type as PacketType);
}

export function isHostOnlyPacket(type: string): boolean {
  return HOST_ONLY_PACKETS.has(type as PacketType);
}

export function isFiniteInteger(val: unknown, min?: number, max?: number): val is number {
  if (typeof val !== 'number') return false;
  if (!Number.isFinite(val) || !Number.isInteger(val)) return false;
  if (min !== undefined && val < min) return false;
  if (max !== undefined && val > max) return false;
  return true;
}

export function isSafeString(val: unknown, minLen = 1, maxLen = MAX_STRING_LEN): val is string {
  if (typeof val !== 'string') return false;
  if (val.length < minLen || val.length > maxLen) return false;
  // Disallow control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(val)) return false;
  return true;
}

export function isValidRoomCode(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim().toUpperCase();
  return trimmed.length === MAX_ROOM_CODE_LEN && /^[A-Z0-9]{6}$/.test(trimmed);
}

export function stripCpuSuffix(name: string): string {
  if (!name) return '';
  return name.replace(/\s*\(CPU\)/gi, '').trim();
}

export function isValidPlayerName(val: unknown): val is string {
  if (!isSafeString(val, 1, MAX_PLAYER_NAME_LEN)) return false;
  return val.trim().length > 0;
}

export function isValidRequestId(val: unknown): val is string {
  if (!isSafeString(val, 1, MAX_REQUEST_ID_LEN)) return false;
  return /^[a-zA-Z0-9_.:-]+$/.test(val);
}

export function isValidReconnectToken(val: unknown): val is string {
  if (!isSafeString(val, 16, MAX_TOKEN_LEN)) return false;
  return /^[a-zA-Z0-9_-]+$/.test(val);
}

export function isValidIpv4(ip: string): boolean {
  if (!isSafeString(ip, 7, 15)) return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    if (n < 0 || n > 255) return false;
    if (p.length > 1 && p.startsWith('0')) return false; // Reject leading zeroes like 01.02.03.04
  }
  return true;
}

export function isValidIpv6(ip: string): boolean {
  if (!isSafeString(ip, 2, 45)) return false;
  const trimmed = ip.trim();
  // Basic IPv6 check allowing colons and hex digits
  return /^[0-9a-fA-F:]+$/.test(trimmed) && trimmed.includes(':') && !trimmed.includes(':::');
}

export function isValidHostname(host: string): boolean {
  if (!isSafeString(host, 1, 253)) return false;
  const trimmed = host.trim().toLowerCase();
  if (trimmed === 'localhost') return true;
  // RFC 1123 hostname validation
  const labels = trimmed.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) return false;
  }
  return true;
}

export function isValidPort(port: number): boolean {
  return isFiniteInteger(port, 1, 65535);
}

export function isValidLanAddress(addr: string): boolean {
  if (!isSafeString(addr, 1, 253)) return false;
  const trimmed = addr.trim();
  // Check if port is attached e.g. 192.168.1.15:5173 or myhost:8080
  if (trimmed.includes(':') && !trimmed.includes('::')) {
    const colonIdx = trimmed.lastIndexOf(':');
    const hostPart = trimmed.slice(0, colonIdx);
    const portPart = trimmed.slice(colonIdx + 1);
    const portNum = Number(portPart);
    if (!isValidPort(portNum)) return false;
    return isValidIpv4(hostPart) || isValidHostname(hostPart);
  }
  return isValidIpv4(trimmed) || isValidIpv6(trimmed) || isValidHostname(trimmed);
}

export function isValidUrl(urlStr: string): boolean {
  if (!isSafeString(urlStr, 1, 2048)) return false;
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

export function isValidSlotIndex(val: unknown): val is number {
  return isFiniteInteger(val, 0, MAX_PLAYERS - 1);
}

export function isValidColorId(val: unknown): val is number {
  return isFiniteInteger(val, 0, 3);
}

export function isValidRoll(val: unknown): val is number {
  return isFiniteInteger(val, 1, 6);
}

export function isValidGameSpeed(val: unknown): val is GameSpeed {
  return typeof val === 'string' && VALID_SPEEDS.has(val);
}

export function isValidWinRule(val: unknown): val is WinRule {
  return typeof val === 'string' && VALID_WIN_RULES.has(val);
}

export function isValidPhase(val: unknown): boolean {
  return typeof val === 'string' && VALID_PHASES.has(val);
}

export function isValidEmoji(val: unknown): val is AllowedEmoji {
  return typeof val === 'string' && ALLOWED_EMOJI_SET.has(val);
}

export function hasDangerousKeys(obj: object): boolean {
  if (!obj || typeof obj !== 'object') return false;
  return (
    Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
    Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
    Object.prototype.hasOwnProperty.call(obj, 'prototype')
  );
}

export function isValidNetworkPlayer(p: unknown): p is NetworkPlayer {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  if (hasDangerousKeys(p)) return false;
  const player = p as Record<string, unknown>;

  if (!isSafeString(player.playerId, 1, 64)) return false;
  if (!isSafeString(player.peerId, 1, 64)) return false;
  if (!isValidPlayerName(player.name)) return false;
  if (!isValidSlotIndex(player.slotIndex)) return false;
  if (!isValidColorId(player.colorId)) return false;
  if (typeof player.isHost !== 'boolean') return false;
  if (typeof player.isCpu !== 'boolean') return false;
  if (typeof player.isReady !== 'boolean') return false;
  if (player.ping !== undefined && !isFiniteInteger(player.ping, 0, 10000)) return false;

  return true;
}

export function isValidRosterSlots(players: NetworkPlayer[], maxPlayers: number): boolean {
  if (!Array.isArray(players) || players.length === 0 || players.length > maxPlayers) return false;
  const seen = new Set<number>();
  for (const player of players) {
    if (typeof player.slotIndex !== 'number' || !Number.isInteger(player.slotIndex)) return false;
    if (player.slotIndex < 0 || player.slotIndex >= maxPlayers) return false;
    if (seen.has(player.slotIndex)) return false;
    seen.add(player.slotIndex);
  }
  return true;
}

export function isValidGameStateSnapshot(s: unknown): s is GameStateSnapshot {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
  if (hasDangerousKeys(s)) return false;
  const snap = s as Record<string, unknown>;

  if (!isValidCheckpointMode(snap.mode)) return false;

  if (!Array.isArray(snap.pos) || snap.pos.length > MAX_PLAYERS) return false;
  if (!snap.pos.every((x) => isFiniteInteger(x, 0, 100))) return false;

  if (!isFiniteInteger(snap.turn, 0, MAX_PLAYERS - 1)) return false;
  if (!isValidPhase(snap.phase)) return false;

  if (!Array.isArray(snap.rolls) || snap.rolls.length > MAX_PLAYERS) return false;
  if (!snap.rolls.every((x) => isFiniteInteger(x, 0, 10000))) return false;

  if (!Array.isArray(snap.laddersHit) || snap.laddersHit.length > MAX_PLAYERS) return false;
  if (!snap.laddersHit.every((x) => isFiniteInteger(x, 0, 10000))) return false;

  if (!Array.isArray(snap.snakesHit) || snap.snakesHit.length > MAX_PLAYERS) return false;
  if (!snap.snakesHit.every((x) => isFiniteInteger(x, 0, 10000))) return false;

  if (!Array.isArray(snap.sixesHit) || snap.sixesHit.length > MAX_PLAYERS) return false;
  if (!snap.sixesHit.every((x) => isFiniteInteger(x, 0, 10000))) return false;

  if (!isFiniteInteger(snap.winner, -1, MAX_PLAYERS - 1)) return false;
  if (snap.isPlaying !== undefined && typeof snap.isPlaying !== 'boolean') return false;

  return true;
}

export interface ValidationResult {
  valid: boolean;
  packet?: Packet;
  error?: string;
}

/**
 * Validates any incoming packet against the protocol specification.
 * Checks raw size, structure, types, ranges, enums, and prototype poisoning.
 */
export function validatePacket(raw: unknown): ValidationResult {
  if (raw === null || raw === undefined) {
    return { valid: false, error: 'Packet is null or undefined' };
  }

  // Check serialized size limit if stringified or object
  try {
    const serialized = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (serialized.length > MAX_PACKET_BYTES) {
      return { valid: false, error: `Packet exceeds max byte size ${MAX_PACKET_BYTES}` };
    }
  } catch {
    return { valid: false, error: 'Packet cannot be serialized' };
  }

  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { valid: false, error: 'Malformed JSON payload' };
    }
  }

  if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) {
    return { valid: false, error: 'Packet must be a non-null object' };
  }

  if (hasDangerousKeys(obj)) {
    return { valid: false, error: 'Packet contains forbidden prototype properties' };
  }

  const p = obj as Record<string, unknown>;
  if (typeof p.type !== 'string') {
    return { valid: false, error: 'Missing or invalid packet type' };
  }

  switch (p.type) {
    case 'JOIN_REQUEST': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid or missing requestId' };
      }
      if (!isValidRoomCode(p.roomCode)) {
        return { valid: false, error: 'Invalid roomCode' };
      }
      if (!isValidPlayerName(p.name)) {
        return { valid: false, error: 'Invalid playerName' };
      }
      if (!isValidColorId(p.colorId)) {
        return { valid: false, error: 'Invalid colorId' };
      }
      return {
        valid: true,
        packet: {
          type: 'JOIN_REQUEST',
          requestId: p.requestId,
          roomCode: (p.roomCode as string).trim().toUpperCase(),
          name: (p.name as string).trim(),
          colorId: p.colorId,
        },
      };
    }

    case 'JOIN_ACCEPTED': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid requestId' };
      }
      if (!isValidSlotIndex(p.slotIndex)) {
        return { valid: false, error: 'Invalid slotIndex' };
      }
      if (!isValidReconnectToken(p.reconnectToken)) {
        return { valid: false, error: 'Invalid reconnectToken' };
      }
      if (!isValidRoomCode(p.roomCode)) {
        return { valid: false, error: 'Invalid roomCode' };
      }
      if (!isValidGameSpeed(p.speed)) {
        return { valid: false, error: 'Invalid speed' };
      }
      if (!isValidWinRule(p.winRule)) {
        return { valid: false, error: 'Invalid winRule' };
      }
      if (!isFiniteInteger(p.maxPlayers, 2, MAX_PLAYERS)) {
        return { valid: false, error: 'Invalid maxPlayers' };
      }
      if (!Array.isArray(p.players) || p.players.length === 0 || p.players.length > (p.maxPlayers as number)) {
        return { valid: false, error: 'Invalid players list' };
      }
      if (!p.players.every(isValidNetworkPlayer)) {
        return { valid: false, error: 'Invalid player record in players list' };
      }
      if (!isValidRosterSlots(p.players as NetworkPlayer[], p.maxPlayers as number)) {
        return { valid: false, error: 'Duplicate or out-of-range slotIndex in players list' };
      }
      if (!isFiniteInteger(p.stateVersion, 1)) {
        return { valid: false, error: 'Invalid stateVersion' };
      }
      if (!isFiniteInteger(p.turnId, 1)) {
        return { valid: false, error: 'Invalid turnId' };
      }
      if (p.gameState !== undefined && !isValidGameStateSnapshot(p.gameState)) {
        return { valid: false, error: 'Invalid gameState snapshot' };
      }
      return {
        valid: true,
        packet: {
          type: 'JOIN_ACCEPTED',
          requestId: p.requestId,
          slotIndex: p.slotIndex,
          reconnectToken: p.reconnectToken,
          roomCode: (p.roomCode as string).trim().toUpperCase(),
          speed: p.speed,
          winRule: p.winRule,
          players: p.players,
          stateVersion: p.stateVersion,
          turnId: p.turnId,
          maxPlayers: p.maxPlayers as number,
          gameState: p.gameState as GameStateSnapshot | undefined,
        },
      };
    }

    case 'JOIN_REJECTED': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid requestId' };
      }
      if (!isSafeString(p.reason, 1, MAX_REASON_LEN)) {
        return { valid: false, error: 'Invalid rejection reason' };
      }
      return {
        valid: true,
        packet: {
          type: 'JOIN_REJECTED',
          requestId: p.requestId,
          reason: (p.reason as string).trim(),
        },
      };
    }

    case 'RECONNECT_REQUEST': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid requestId' };
      }
      if (!isValidRoomCode(p.roomCode)) {
        return { valid: false, error: 'Invalid roomCode' };
      }
      if (!isValidSlotIndex(p.slotIndex)) {
        return { valid: false, error: 'Invalid slotIndex' };
      }
      if (!isValidReconnectToken(p.reconnectToken)) {
        return { valid: false, error: 'Invalid reconnectToken' };
      }
      return {
        valid: true,
        packet: {
          type: 'RECONNECT_REQUEST',
          requestId: p.requestId,
          roomCode: (p.roomCode as string).trim().toUpperCase(),
          slotIndex: p.slotIndex,
          reconnectToken: p.reconnectToken,
        },
      };
    }

    case 'RECONNECT_ACCEPTED': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid requestId' };
      }
      if (!isValidSlotIndex(p.slotIndex)) {
        return { valid: false, error: 'Invalid slotIndex' };
      }
      if (!isValidReconnectToken(p.reconnectToken)) {
        return { valid: false, error: 'Invalid reconnectToken' };
      }
      if (!isValidRoomCode(p.roomCode)) {
        return { valid: false, error: 'Invalid roomCode' };
      }
      if (!isValidGameSpeed(p.speed)) {
        return { valid: false, error: 'Invalid speed' };
      }
      if (!isValidWinRule(p.winRule)) {
        return { valid: false, error: 'Invalid winRule' };
      }
      if (!isFiniteInteger(p.maxPlayers, 2, MAX_PLAYERS)) {
        return { valid: false, error: 'Invalid maxPlayers' };
      }
      if (!Array.isArray(p.players) || p.players.length === 0 || p.players.length > (p.maxPlayers as number)) {
        return { valid: false, error: 'Invalid players array' };
      }
      if (!p.players.every(isValidNetworkPlayer)) {
        return { valid: false, error: 'Invalid player record' };
      }
      if (!isValidRosterSlots(p.players as NetworkPlayer[], p.maxPlayers as number)) {
        return { valid: false, error: 'Duplicate or out-of-range slotIndex in players list' };
      }
      if (!isFiniteInteger(p.stateVersion, 1)) {
        return { valid: false, error: 'Invalid stateVersion' };
      }
      if (!isFiniteInteger(p.turnId, 1)) {
        return { valid: false, error: 'Invalid turnId' };
      }
      if (p.gameState !== undefined && !isValidGameStateSnapshot(p.gameState)) {
        return { valid: false, error: 'Invalid gameState snapshot' };
      }
      return {
        valid: true,
        packet: {
          type: 'RECONNECT_ACCEPTED',
          requestId: p.requestId,
          slotIndex: p.slotIndex,
          reconnectToken: p.reconnectToken,
          roomCode: (p.roomCode as string).trim().toUpperCase(),
          speed: p.speed,
          winRule: p.winRule,
          players: p.players,
          stateVersion: p.stateVersion,
          turnId: p.turnId,
          maxPlayers: p.maxPlayers as number,
          gameState: p.gameState as GameStateSnapshot | undefined,
        },
      };
    }

    case 'RECONNECT_REJECTED': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid requestId' };
      }
      if (!isSafeString(p.reason, 1, MAX_REASON_LEN)) {
        return { valid: false, error: 'Invalid rejection reason' };
      }
      return {
        valid: true,
        packet: {
          type: 'RECONNECT_REJECTED',
          requestId: p.requestId,
          reason: (p.reason as string).trim(),
        },
      };
    }

    case 'COLOR_CHANGE_REQUEST': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid requestId' };
      }
      if (!isValidSlotIndex(p.slotIndex)) {
        return { valid: false, error: 'Invalid slotIndex' };
      }
      if (!isValidColorId(p.colorId)) {
        return { valid: false, error: 'Invalid colorId' };
      }
      return {
        valid: true,
        packet: {
          type: 'COLOR_CHANGE_REQUEST',
          requestId: p.requestId,
          slotIndex: p.slotIndex,
          colorId: p.colorId,
        },
      };
    }

    case 'LOBBY_UPDATE': {
      if (!isFiniteInteger(p.maxPlayers, 2, MAX_PLAYERS)) {
        return { valid: false, error: 'Invalid maxPlayers in LOBBY_UPDATE' };
      }
      if (!Array.isArray(p.players) || p.players.length === 0 || p.players.length > (p.maxPlayers as number)) {
        return { valid: false, error: 'Invalid players array in LOBBY_UPDATE' };
      }
      if (!p.players.every(isValidNetworkPlayer)) {
        return { valid: false, error: 'Invalid player in LOBBY_UPDATE' };
      }
      if (!isValidRosterSlots(p.players as NetworkPlayer[], p.maxPlayers as number)) {
        return { valid: false, error: 'Duplicate or out-of-range slotIndex in players list' };
      }
      if (!isValidGameSpeed(p.speed)) {
        return { valid: false, error: 'Invalid speed' };
      }
      if (!isValidWinRule(p.winRule)) {
        return { valid: false, error: 'Invalid winRule' };
      }
      if (!isFiniteInteger(p.stateVersion, 1)) {
        return { valid: false, error: 'Invalid stateVersion' };
      }
      return {
        valid: true,
        packet: {
          type: 'LOBBY_UPDATE',
          players: p.players,
          speed: p.speed,
          winRule: p.winRule,
          stateVersion: p.stateVersion,
          maxPlayers: p.maxPlayers as number,
        },
      };
    }

    case 'GAME_START': {
      if (!Array.isArray(p.players) || p.players.length < 2 || p.players.length > MAX_PLAYERS) {
        return { valid: false, error: 'Invalid players count for GAME_START' };
      }
      if (!p.players.every(isValidNetworkPlayer)) {
        return { valid: false, error: 'Invalid player in GAME_START' };
      }
      if (!isValidRosterSlots(p.players as NetworkPlayer[], MAX_PLAYERS)) {
        return { valid: false, error: 'Duplicate or out-of-range slotIndex in GAME_START players list' };
      }
      if (!isValidGameSpeed(p.speed)) {
        return { valid: false, error: 'Invalid speed' };
      }
      if (!isValidWinRule(p.winRule)) {
        return { valid: false, error: 'Invalid winRule' };
      }
      if (!isFiniteInteger(p.stateVersion, 1)) {
        return { valid: false, error: 'Invalid stateVersion' };
      }
      if (!isFiniteInteger(p.turnId, 1)) {
        return { valid: false, error: 'Invalid turnId' };
      }
      return {
        valid: true,
        packet: {
          type: 'GAME_START',
          players: p.players,
          speed: p.speed,
          winRule: p.winRule,
          stateVersion: p.stateVersion,
          turnId: p.turnId,
        },
      };
    }

    case 'ROLL_REQUEST': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid requestId' };
      }
      if (!isFiniteInteger(p.turnId, 1)) {
        return { valid: false, error: 'Invalid turnId' };
      }
      if (!isValidSlotIndex(p.slotIndex)) {
        return { valid: false, error: 'Invalid slotIndex' };
      }
      return {
        valid: true,
        packet: {
          type: 'ROLL_REQUEST',
          requestId: p.requestId,
          turnId: p.turnId,
          slotIndex: p.slotIndex,
        },
      };
    }

    case 'ROLL_RESULT': {
      if (!isValidSlotIndex(p.player)) {
        return { valid: false, error: 'Invalid player slot for ROLL_RESULT' };
      }
      if (!isValidRoll(p.roll)) {
        return { valid: false, error: 'Invalid roll value' };
      }
      if (!isFiniteInteger(p.turnId, 1)) {
        return { valid: false, error: 'Invalid turnId' };
      }
      if (!isFiniteInteger(p.stateVersion, 1)) {
        return { valid: false, error: 'Invalid stateVersion' };
      }
      if (!isFiniteInteger(p.timestamp, 1)) {
        return { valid: false, error: 'Invalid timestamp' };
      }
      return {
        valid: true,
        packet: {
          type: 'ROLL_RESULT',
          player: p.player,
          roll: p.roll,
          turnId: p.turnId,
          stateVersion: p.stateVersion,
          timestamp: p.timestamp,
        },
      };
    }

    case 'SYNC_CHECKPOINT': {
      if (!isValidCheckpointMode(p.mode)) {
        return { valid: false, error: 'Invalid mode in SYNC_CHECKPOINT' };
      }
      if (!Array.isArray(p.pos) || p.pos.length > MAX_PLAYERS) {
        return { valid: false, error: 'Invalid pos in SYNC_CHECKPOINT' };
      }
      if (!p.pos.every((x) => isFiniteInteger(x, 0, 100))) {
        return { valid: false, error: 'Invalid positions in SYNC_CHECKPOINT' };
      }
      if (!isValidSlotIndex(p.turn)) {
        return { valid: false, error: 'Invalid turn in SYNC_CHECKPOINT' };
      }
      if (!isValidPhase(p.phase)) {
        return { valid: false, error: 'Invalid phase in SYNC_CHECKPOINT' };
      }
      if (!Array.isArray(p.rolls) || !p.rolls.every((x) => isFiniteInteger(x, 0, 10000))) {
        return { valid: false, error: 'Invalid rolls in SYNC_CHECKPOINT' };
      }
      if (!Array.isArray(p.laddersHit) || !p.laddersHit.every((x) => isFiniteInteger(x, 0, 10000))) {
        return { valid: false, error: 'Invalid laddersHit' };
      }
      if (!Array.isArray(p.snakesHit) || !p.snakesHit.every((x) => isFiniteInteger(x, 0, 10000))) {
        return { valid: false, error: 'Invalid snakesHit' };
      }
      if (!Array.isArray(p.sixesHit) || !p.sixesHit.every((x) => isFiniteInteger(x, 0, 10000))) {
        return { valid: false, error: 'Invalid sixesHit' };
      }
      if (!isFiniteInteger(p.winner, -1, MAX_PLAYERS - 1)) {
        return { valid: false, error: 'Invalid winner in SYNC_CHECKPOINT' };
      }
      if (!isFiniteInteger(p.stateVersion, 1)) {
        return { valid: false, error: 'Invalid stateVersion in SYNC_CHECKPOINT' };
      }
      if (!isFiniteInteger(p.turnId, 1)) {
        return { valid: false, error: 'Invalid turnId in SYNC_CHECKPOINT' };
      }
      return {
        valid: true,
        packet: {
          type: 'SYNC_CHECKPOINT',
          mode: p.mode,
          pos: p.pos as number[],
          turn: p.turn as number,
          phase: p.phase as string,
          rolls: p.rolls as number[],
          laddersHit: p.laddersHit as number[],
          snakesHit: p.snakesHit as number[],
          sixesHit: p.sixesHit as number[],
          winner: p.winner as number,
          stateVersion: p.stateVersion as number,
          turnId: p.turnId as number,
        },
      };
    }

    case 'EMOTE': {
      if (!isValidRequestId(p.requestId)) {
        return { valid: false, error: 'Invalid requestId' };
      }
      if (!isValidSlotIndex(p.player)) {
        return { valid: false, error: 'Invalid player slot' };
      }
      if (!isValidEmoji(p.emoji)) {
        return { valid: false, error: 'Invalid or disallowed emoji' };
      }
      if (!isFiniteInteger(p.timestamp, 1)) {
        return { valid: false, error: 'Invalid timestamp' };
      }
      return {
        valid: true,
        packet: {
          type: 'EMOTE',
          requestId: p.requestId,
          player: p.player,
          emoji: p.emoji,
          timestamp: p.timestamp,
        },
      };
    }

    case 'PLAYER_DISCONNECTED': {
      if (!isFiniteInteger(p.slotIndex, -1, MAX_PLAYERS - 1)) {
        return { valid: false, error: 'Invalid slotIndex in PLAYER_DISCONNECTED' };
      }
      if (!isSafeString(p.name, 1, 64)) {
        return { valid: false, error: 'Invalid name in PLAYER_DISCONNECTED' };
      }
      if (!isFiniteInteger(p.stateVersion, 1)) {
        return { valid: false, error: 'Invalid stateVersion in PLAYER_DISCONNECTED' };
      }
      return {
        valid: true,
        packet: {
          type: 'PLAYER_DISCONNECTED',
          slotIndex: p.slotIndex as number,
          name: p.name as string,
          stateVersion: p.stateVersion as number,
        },
      };
    }

    case 'PING': {
      if (!isFiniteInteger(p.sentAt, 1)) {
        return { valid: false, error: 'Invalid sentAt timestamp' };
      }
      return {
        valid: true,
        packet: {
          type: 'PING',
          sentAt: p.sentAt,
        },
      };
    }

    case 'PONG': {
      if (!isFiniteInteger(p.sentAt, 1)) {
        return { valid: false, error: 'Invalid sentAt timestamp' };
      }
      return {
        valid: true,
        packet: {
          type: 'PONG',
          sentAt: p.sentAt,
        },
      };
    }

    default:
      return { valid: false, error: `Unknown packet type: ${String(p.type)}` };
  }
}
