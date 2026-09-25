import { describe, it, expect } from 'vitest';
import {
  gameReducer,
  initialGameState,
  slotToIndex,
  indexToSlot,
  getPlayerBySlot,
  validateRoster,
  type PlayerConfig,
} from '../src/game/gameReducer';
import {
  isValidRosterSlots,
  validatePacket,
} from '../src/game/network/validation';
import type {
  NetworkPlayer,
  JoinAcceptedPacket,
  ReconnectAcceptedPacket,
  LobbyUpdatePacket,
} from '../src/game/network/types';

describe('Roster Identity & Sparse Slot Tests', () => {
  describe('1. Roster Validation & Identity Helpers', () => {
    it('validates a correct dense roster', () => {
      const players: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 1, name: 'Guest', isCpu: false, colorId: 1 },
      ];
      expect(validateRoster(players, 4).valid).toBe(true);
    });

    it('validates a correct sparse roster [0, 2, 3]', () => {
      const players: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p2', slotIndex: 2, name: 'Guest 2', isCpu: false, colorId: 2 },
        { id: 'p3', slotIndex: 3, name: 'Guest 3', isCpu: false, colorId: 3 },
      ];
      expect(validateRoster(players, 4).valid).toBe(true);
    });

    it('rejects duplicate slotIndex in roster', () => {
      const duplicate: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 0, name: 'Imposter', isCpu: false, colorId: 1 },
      ];
      const result = validateRoster(duplicate, 4);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Duplicate slotIndex/);
    });

    it('rejects slotIndex out of range [0, maxPlayers - 1]', () => {
      const outOfBounds: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p4', slotIndex: 4, name: 'Guest', isCpu: false, colorId: 1 },
      ];
      const result = validateRoster(outOfBounds, 4);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/out of range/);
    });

    it('rejects empty or single player rosters', () => {
      expect(validateRoster([], 4).valid).toBe(false);
      expect(
        validateRoster(
          [{ id: 'p0', slotIndex: 0, name: 'Solo', isCpu: false, colorId: 0 }],
          4,
        ).valid,
      ).toBe(false);
    });

    it('isValidRosterSlots checks unique slots and bounds', () => {
      const netPlayers: NetworkPlayer[] = [
        {
          playerId: 'p0',
          peerId: 'host',
          name: 'Host',
          slotIndex: 0,
          colorId: 0,
          isHost: true,
          isCpu: false,
          isReady: true,
        },
        {
          playerId: 'p2',
          peerId: 'peer2',
          name: 'P2',
          slotIndex: 2,
          colorId: 2,
          isHost: false,
          isCpu: false,
          isReady: true,
        },
      ];
      expect(isValidRosterSlots(netPlayers, 4)).toBe(true);

      const dupNet: NetworkPlayer[] = [
        { ...netPlayers[0] },
        { ...netPlayers[1], slotIndex: 0 },
      ];
      expect(isValidRosterSlots(dupNet, 4)).toBe(false);

      const oobNet: NetworkPlayer[] = [
        { ...netPlayers[0] },
        { ...netPlayers[1], slotIndex: 5 },
      ];
      expect(isValidRosterSlots(oobNet, 4)).toBe(false);
    });

    it('slotToIndex, indexToSlot, and getPlayerBySlot map correctly', () => {
      const players: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'P0', isCpu: false, colorId: 0 },
        { id: 'p2', slotIndex: 2, name: 'P2', isCpu: false, colorId: 2 },
        { id: 'p3', slotIndex: 3, name: 'P3', isCpu: false, colorId: 3 },
      ];

      expect(slotToIndex(0, players)).toBe(0);
      expect(slotToIndex(2, players)).toBe(1);
      expect(slotToIndex(3, players)).toBe(2);
      expect(slotToIndex(1, players)).toBe(-1); // Slot 1 is not in roster

      expect(indexToSlot(0, players)).toBe(0);
      expect(indexToSlot(1, players)).toBe(2);
      expect(indexToSlot(2, players)).toBe(3);
      expect(indexToSlot(5, players)).toBe(-1);

      expect(getPlayerBySlot(2, players)?.name).toBe('P2');
      expect(getPlayerBySlot(1, players)).toBeUndefined();
    });
  });

  describe('2. Sparse Slots [0, 2, 3] in Active Match', () => {
    const sparsePlayers: PlayerConfig[] = [
      { id: 'p0', slotIndex: 0, name: 'P0', isCpu: false, colorId: 0 },
      { id: 'p2', slotIndex: 2, name: 'P2', isCpu: false, colorId: 2 },
      { id: 'p3', slotIndex: 3, name: 'P3', isCpu: false, colorId: 3 },
    ];

    it('initializes game state matching sparse roster length (3 players)', () => {
      const state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: sparsePlayers,
      });

      expect(state.players.length).toBe(3);
      expect(state.pos.length).toBe(3);
      expect(state.rolls.length).toBe(3);
      expect(state.turn).toBe(0); // Roster index 0 corresponds to slotIndex 0
      expect(state.players[state.turn].slotIndex).toBe(0);
    });

    it('rotates turns through dense roster indexes corresponding to sparse slots', () => {
      let state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: sparsePlayers,
      });

      // Turn 0: P0 (slot 0)
      expect(state.turn).toBe(0);
      expect(state.players[state.turn].slotIndex).toBe(0);

      // Switch turn to 1: P2 (slot 2)
      state = gameReducer(state, { type: 'SWITCH_TURN', fromPlayer: 0 });
      expect(state.turn).toBe(1);
      expect(state.players[state.turn].slotIndex).toBe(2);

      // Switch turn to 2: P3 (slot 3)
      state = gameReducer(state, { type: 'SWITCH_TURN', fromPlayer: 1 });
      expect(state.turn).toBe(2);
      expect(state.players[state.turn].slotIndex).toBe(3);

      // Switch turn wraps back to 0: P0 (slot 0)
      state = gameReducer(state, { type: 'SWITCH_TURN', fromPlayer: 2 });
      expect(state.turn).toBe(0);
      expect(state.players[state.turn].slotIndex).toBe(0);
    });

    it('records stats and positions aligned with roster index for sparse slots', () => {
      let state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: sparsePlayers,
      });

      // Player 2 (roster index 1) rolls and moves
      state = gameReducer(state, { type: 'SWITCH_TURN', fromPlayer: 0 });
      expect(state.turn).toBe(1);

      state = gameReducer(state, { type: 'START_ROLL', player: 1, roll: 4 });
      const tx = state.txId;
      state = gameReducer(state, {
        type: 'ROLL_LANDED',
        txId: tx,
        expectedPhase: 'rolling',
        player: 1,
        roll: 4,
      });
      state = gameReducer(state, {
        type: 'START_MOVE',
        txId: tx,
        player: 1,
        steps: [{ x: 10, y: 10 }],
        target: 4,
        roll: 4,
      });
      state = gameReducer(state, {
        type: 'FINISH_MOVE',
        txId: tx,
        player: 1,
        target: 4,
      });

      expect(state.pos[1]).toBe(4);
      expect(state.pos[0]).toBe(0);
      expect(state.pos[2]).toBe(0);
      expect(state.rolls[1]).toBe(1);
      expect(state.rolls[0]).toBe(0);
    });

    it('sets winner correctly on sparse roster and aligns stats', () => {
      let state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: sparsePlayers,
      });

      // Player at slot 2 (roster index 1) reaches 100
      state = gameReducer(state, { type: 'SWITCH_TURN', fromPlayer: 0 });
      state = gameReducer(state, { type: 'GAME_OVER', winner: 1 });

      expect(state.mode).toBe('over');
      expect(state.winner).toBe(1);
      expect(state.players[state.winner].slotIndex).toBe(2);
      expect(state.players[state.winner].name).toBe('P2');
    });
  });

  describe('3. Removing a Middle CPU', () => {
    it('removes middle CPU and safely shifts turns and aligned arrays', () => {
      const initialRoster: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 1, name: 'CPU 1', isCpu: true, colorId: 1 },
        { id: 'p2', slotIndex: 2, name: 'CPU 2', isCpu: true, colorId: 2 },
      ];

      let state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: initialRoster,
      });

      // Set some positions
      state = {
        ...state,
        pos: [10, 20, 30],
        rolls: [2, 3, 4],
        turn: 2, // Active turn is on CPU 2 (slot 2)
      };

      // Remove middle CPU (slot 1)
      state = gameReducer(state, { type: 'REMOVE_PLAYER', slotIndex: 1 });

      expect(state.players.length).toBe(2);
      expect(state.players[0].slotIndex).toBe(0);
      expect(state.players[1].slotIndex).toBe(2);

      // Positions and rolls for slot 0 and slot 2 are preserved
      expect(state.pos).toEqual([10, 30]);
      expect(state.rolls).toEqual([2, 4]);

      // Turn on slot 2 (previously index 2) shifts to index 1
      expect(state.turn).toBe(1);
      expect(state.players[state.turn].slotIndex).toBe(2);
    });
  });

  describe('4. CPU Takeover & Player Reconnect', () => {
    it('applies CPU takeover on disconnected player slot without resetting progress', () => {
      const roster: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 1, name: 'Guest', isCpu: false, colorId: 1 },
      ];

      let state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: roster,
      });
      state = {
        ...state,
        pos: [25, 42],
        rolls: [5, 6],
      };

      // Guest disconnects -> CPU Takeover at slot 1
      state = gameReducer(state, { type: 'CPU_TAKEOVER', slotIndex: 1 });

      expect(state.players[1].isCpu).toBe(true);
      expect(state.players[1].name).toBe('Guest (CPU)');
      expect(state.pos).toEqual([25, 42]);
      expect(state.rolls).toEqual([5, 6]);
    });

    it('applies player reconnect, reverting CPU status and stripping (CPU)', () => {
      const rosterWithCpu: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 1, name: 'Guest (CPU)', isCpu: true, colorId: 1 },
      ];

      let state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: rosterWithCpu,
      });
      state = {
        ...state,
        pos: [25, 42],
        rolls: [5, 6],
      };

      // Player reconnects at slot 1
      state = gameReducer(state, { type: 'PLAYER_RECONNECT', slotIndex: 1 });

      expect(state.players[1].isCpu).toBe(false);
      expect(state.players[1].name).toBe('Guest');
      expect(state.pos).toEqual([25, 42]);
      expect(state.rolls).toEqual([5, 6]);
    });
  });

  describe('5. Late Join & Complete Game Snapshot', () => {
    it('accepts late joiner via UPDATE_ROSTER, initializing them at 0 while preserving existing players', () => {
      const originalRoster: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 1, name: 'Guest 1', isCpu: false, colorId: 1 },
      ];

      let state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: originalRoster,
      });
      state = {
        ...state,
        pos: [50, 60],
        rolls: [8, 9],
        turn: 1,
      };

      // Late joiner joins at slot 2
      const expandedRoster: PlayerConfig[] = [
        ...originalRoster,
        { id: 'p2', slotIndex: 2, name: 'Late Joiner', isCpu: false, colorId: 2 },
      ];

      state = gameReducer(state, {
        type: 'UPDATE_ROSTER',
        players: expandedRoster,
      });

      expect(state.players.length).toBe(3);
      expect(state.pos).toEqual([50, 60, 0]); // Late joiner starts at 0
      expect(state.rolls).toEqual([8, 9, 0]);
      expect(state.turn).toBe(1); // Active turn on Guest 1 is preserved
      expect(state.players[state.turn].slotIndex).toBe(1);
    });

    it('rejects late join roster update if validation fails', () => {
      const roster: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 1, name: 'Guest', isCpu: false, colorId: 1 },
      ];

      const state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: roster,
      });

      // Invalid roster (duplicate slot)
      const invalidRoster: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 0, name: 'Duplicate', isCpu: false, colorId: 1 },
      ];

      const nextState = gameReducer(state, {
        type: 'UPDATE_ROSTER',
        players: invalidRoster,
      });

      // State rejected and unchanged
      expect(nextState).toBe(state);
    });
  });

  describe('6. Slot Removal During Active Match', () => {
    it('safely handles active player being removed', () => {
      const roster: PlayerConfig[] = [
        { id: 'p0', slotIndex: 0, name: 'Host', isCpu: false, colorId: 0 },
        { id: 'p1', slotIndex: 1, name: 'Guest 1', isCpu: false, colorId: 1 },
        { id: 'p2', slotIndex: 2, name: 'Guest 2', isCpu: false, colorId: 2 },
      ];

      let state = gameReducer(initialGameState(), {
        type: 'START_GAME',
        players: roster,
      });
      state = {
        ...state,
        pos: [10, 20, 30],
        turn: 1, // Currently Guest 1's turn
        phase: 'moving',
      };

      // Guest 1 quits and is removed
      state = gameReducer(state, { type: 'REMOVE_PLAYER', slotIndex: 1 });

      expect(state.players.length).toBe(2);
      expect(state.players[0].slotIndex).toBe(0);
      expect(state.players[1].slotIndex).toBe(2);
      expect(state.pos).toEqual([10, 30]);

      // Phase reset to idle since active player left mid-move
      expect(state.phase).toBe('idle');
      // Turn safely advances to the remaining player at that position index
      expect(state.turn).toBe(1);
    });
  });

  describe('7. Network Packet Validation: maxPlayers & Roster Slots', () => {
    const validPlayers: NetworkPlayer[] = [
      {
        playerId: 'p0',
        peerId: 'host',
        name: 'Host',
        slotIndex: 0,
        colorId: 0,
        isHost: true,
        isCpu: false,
        isReady: true,
      },
      {
        playerId: 'p2',
        peerId: 'peer2',
        name: 'P2',
        slotIndex: 2,
        colorId: 2,
        isHost: false,
        isCpu: false,
        isReady: true,
      },
    ];

    it('validates JOIN_ACCEPTED with maxPlayers and optional gameState', () => {
      const validJoin: JoinAcceptedPacket = {
        type: 'JOIN_ACCEPTED',
        requestId: 'req1',
        slotIndex: 2,
        reconnectToken: 'reconnect_token_123456789',
        roomCode: 'ABCDEF',
        speed: 'normal',
        winRule: 'exact',
        players: validPlayers,
        stateVersion: 1,
        turnId: 1,
        maxPlayers: 4,
      };
      expect(validatePacket(validJoin).valid).toBe(true);

      const invalidJoinNoMax = { ...validJoin, maxPlayers: undefined };
      expect(validatePacket(invalidJoinNoMax).valid).toBe(false);

      const invalidJoinOobMax = { ...validJoin, maxPlayers: 1 };
      expect(validatePacket(invalidJoinOobMax).valid).toBe(false);
    });

    it('validates RECONNECT_ACCEPTED with maxPlayers', () => {
      const validReconnect: ReconnectAcceptedPacket = {
        type: 'RECONNECT_ACCEPTED',
        requestId: 'req2',
        slotIndex: 2,
        reconnectToken: 'reconnect_token_123456789',
        roomCode: 'ABCDEF',
        speed: 'fast',
        winRule: 'bounce',
        players: validPlayers,
        stateVersion: 2,
        turnId: 3,
        maxPlayers: 4,
      };
      expect(validatePacket(validReconnect).valid).toBe(true);

      const invalidReconnect = { ...validReconnect, maxPlayers: 5 };
      expect(validatePacket(invalidReconnect).valid).toBe(false);
    });

    it('validates LOBBY_UPDATE with maxPlayers and unique sparse roster slots', () => {
      const validLobby: LobbyUpdatePacket = {
        type: 'LOBBY_UPDATE',
        players: validPlayers,
        speed: 'turbo',
        winRule: 'exact',
        stateVersion: 3,
        maxPlayers: 4,
      };
      expect(validatePacket(validLobby).valid).toBe(true);

      const invalidLobbyNoMax = { ...validLobby, maxPlayers: undefined };
      expect(validatePacket(invalidLobbyNoMax).valid).toBe(false);

      const invalidLobbyDupSlots: LobbyUpdatePacket = {
        ...validLobby,
        players: [
          validPlayers[0],
          { ...validPlayers[1], slotIndex: 0 }, // Duplicate slot 0
        ],
      };
      expect(validatePacket(invalidLobbyDupSlots).valid).toBe(false);
    });
  });
});
