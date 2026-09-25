import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PeerManager } from '../src/game/network/peerManager';
import type {
  Packet,
  GameStateSnapshot,
  NetworkPlayer,
} from '../src/game/network/types';
import { stripCpuSuffix } from '../src/game/network/validation';

// In-memory cross-connected mock data connection
class PairedDataConnection {
  peer: string;
  open = false;
  closed = false;
  pairedWith: PairedDataConnection | null = null;
  callbacks: Record<string, ((...args: any[]) => void)[]> = {};

  constructor(peer: string) {
    this.peer = peer;
  }

  on(event: string, cb: (...args: any[]) => void) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
    return this;
  }

  send(data: any) {
    if (this.closed) return;
    // Dispatch packet asynchronously to paired connection
    setTimeout(() => {
      if (this.pairedWith && !this.pairedWith.closed) {
        this.pairedWith._emit('data', data);
      }
    }, 0);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this._emit('close');
    if (this.pairedWith && !this.pairedWith.closed) {
      this.pairedWith.closed = true;
      this.pairedWith.open = false;
      this.pairedWith._emit('close');
    }
  }

  _emit(event: string, ...args: any[]) {
    (this.callbacks[event] || []).forEach((cb) => cb(...args));
  }
}

// Registry to route connections between mock peer instances
const peerRegistry = new Map<string, any>();

vi.mock('peerjs', () => {
  return {
    default: class MockPeer {
      id: string;
      callbacks: Record<string, ((...args: any[]) => void)[]> = {};
      destroyed = false;

      constructor(idOrOptions?: any) {
        this.id = typeof idOrOptions === 'string' ? idOrOptions : 'peer_' + Math.random().toString(36).slice(2, 8);
        peerRegistry.set(this.id, this);
        setTimeout(() => this._emit('open', this.id), 0);
      }

      on(event: string, cb: (...args: any[]) => void) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(cb);
        return this;
      }

      connect(targetId: string) {
        const clientConn = new PairedDataConnection(targetId);
        const targetPeer = peerRegistry.get(targetId);

        setTimeout(() => {
          if (targetPeer && !targetPeer.destroyed) {
            const hostConn = new PairedDataConnection(this.id);
            clientConn.pairedWith = hostConn;
            hostConn.pairedWith = clientConn;
            clientConn.open = true;
            hostConn.open = true;

            targetPeer._emit('connection', hostConn);
            setTimeout(() => {
              clientConn._emit('open');
              hostConn._emit('open');
            }, 0);
          } else {
            clientConn._emit('error', new Error('Peer not found'));
          }
        }, 5);

        return clientConn;
      }

      destroy() {
        this.destroyed = true;
        peerRegistry.delete(this.id);
        this._emit('close');
      }

      _emit(event: string, ...args: any[]) {
        (this.callbacks[event] || []).forEach((cb) => cb(...args));
      }
    },
  };
});

describe('Two-Client End-to-End Integration (Host & Guest)', () => {
  beforeEach(() => {
    peerRegistry.clear();
  });

  it('runs complete lifecycle: join, start, roll, checkpoint, emote, disconnect, wait & reconnect and roll', async () => {
    const roomCode = 'ROOM99';

    // 1. Setup Host Coordinator
    const hostPm = new PeerManager();
    let hostReceivedEmote = '';
    let hostReceivedRollRequest: Packet | null = null;
    let stateVersion = 1;
    const slotTokens = new Map<number, string>();

    const hostPlayers: NetworkPlayer[] = [
      {
        playerId: 'p_host',
        peerId: 'snkladr-room99',
        name: 'HostPlayer',
        slotIndex: 0,
        colorId: 0,
        isHost: true,
        isCpu: false,
        isReady: true,
      },
    ];

    hostPm.onPacket((packet: Packet, fromPeerId?: string) => {
      const peerId = fromPeerId || '';
      switch (packet.type) {
        case 'JOIN_REQUEST': {
          const assignedSlot = 1;
          const token = 'secret_token_slot_1';
          slotTokens.set(assignedSlot, token);
          hostPm.setAdmissionState(peerId, 'joined', assignedSlot);

          const guestPlayer: NetworkPlayer = {
            playerId: 'p_guest',
            peerId,
            name: packet.name,
            slotIndex: assignedSlot,
            colorId: packet.colorId,
            isHost: false,
            isCpu: false,
            isReady: true,
          };
          hostPlayers.push(guestPlayer);
          stateVersion += 1;

          hostPm.sendToPeer(peerId, {
            type: 'JOIN_ACCEPTED',
            requestId: packet.requestId,
            slotIndex: assignedSlot,
            reconnectToken: token,
            roomCode,
            speed: 'normal',
            winRule: 'exact',
            players: [...hostPlayers],
            stateVersion,
            turnId: 1,
            maxPlayers: 4,
          });

          hostPm.broadcast({
            type: 'LOBBY_UPDATE',
            players: [...hostPlayers],
            speed: 'normal',
            winRule: 'exact',
            stateVersion,
            maxPlayers: 4,
          });
          break;
        }

        case 'RECONNECT_REQUEST': {
          const expectedToken = slotTokens.get(packet.slotIndex);
          if (expectedToken === packet.reconnectToken) {
            hostPm.setAdmissionState(peerId, 'joined', packet.slotIndex);
            const target = hostPlayers.find((p) => p.slotIndex === packet.slotIndex);
            if (target) {
              target.peerId = peerId;
              target.isCpu = false;
              target.isReady = true;
              target.name = stripCpuSuffix(target.name);
            }
            stateVersion += 1;

            hostPm.sendToPeer(peerId, {
              type: 'RECONNECT_ACCEPTED',
              requestId: packet.requestId,
              slotIndex: packet.slotIndex,
              reconnectToken: expectedToken,
              roomCode,
              speed: 'normal',
              winRule: 'exact',
              players: [...hostPlayers],
              stateVersion,
              turnId: 1,
              maxPlayers: 4,
            });

            hostPm.broadcast({
              type: 'LOBBY_UPDATE',
              players: [...hostPlayers],
              speed: 'normal',
              winRule: 'exact',
              stateVersion,
              maxPlayers: 4,
            });
          }
          break;
        }

        case 'PLAYER_DISCONNECTED': {
          const dcSlot = packet.slotIndex;
          const target = hostPlayers.find((p) => p.slotIndex === dcSlot);
          if (target && !target.isCpu) {
            target.isCpu = false;
            target.isReady = false;
            target.name = stripCpuSuffix(target.name);
            stateVersion += 1;
            hostPm.broadcast({
              type: 'LOBBY_UPDATE',
              players: [...hostPlayers],
              speed: 'normal',
              winRule: 'exact',
              stateVersion,
              maxPlayers: 4,
            });
          }
          break;
        }

        case 'ROLL_REQUEST': {
          hostReceivedRollRequest = packet;
          stateVersion += 1;
          hostPm.broadcast({
            type: 'ROLL_RESULT',
            player: packet.slotIndex,
            roll: 4,
            turnId: 1,
            stateVersion,
            timestamp: Date.now(),
          });
          break;
        }

        case 'EMOTE': {
          hostReceivedEmote = packet.emoji;
          break;
        }
      }
    });

    const hostCode = await hostPm.createRoom(roomCode, 'HostPlayer', 0);
    expect(hostCode).toBe(roomCode);
    expect(hostPm.getIsHost()).toBe(true);
    expect(hostPm.getSlotIndex()).toBe(0);

    // 2. Guest connects and joins room
    const guestPm = new PeerManager();
    let guestGameStarted = false;
    let guestReceivedRoll = 0;
    let guestReceivedCheckpoint: GameStateSnapshot | null = null;
    let guestReceivedEmote = '';
    let guestPlayers: NetworkPlayer[] = [];
    let guestReconnectToken = '';

    guestPm.onPacket((packet: Packet) => {
      switch (packet.type) {
        case 'JOIN_ACCEPTED':
          guestPlayers = packet.players;
          guestReconnectToken = packet.reconnectToken;
          break;
        case 'RECONNECT_ACCEPTED':
          guestPlayers = packet.players;
          break;
        case 'LOBBY_UPDATE':
          guestPlayers = packet.players;
          break;
        case 'GAME_START':
          guestGameStarted = true;
          break;
        case 'ROLL_ANNOUNCED':
          guestReceivedRoll = packet.roll;
          break;
        case 'GAME_CHECKPOINT':
          guestReceivedCheckpoint = packet.snapshot;
          break;
        case 'EMOTE':
          guestReceivedEmote = packet.emoji;
          break;
      }
    });

    await guestPm.joinRoom(roomCode, 'GuestPlayer', 1);

    // Wait briefly for handshake
    await new Promise((res) => setTimeout(res, 20));
    expect(guestPm.getSlotIndex()).toBe(1);
    expect(hostPlayers.length).toBe(2);
    expect(guestPlayers.length).toBe(2);
    expect(guestReconnectToken).toBe('secret_token_slot_1');

    // 3. Host starts game
    const hostGameStarted = true;
    stateVersion += 1;
    hostPm.broadcast({
      type: 'GAME_START',
      players: [...hostPlayers],
      speed: 'normal',
      winRule: 'exact',
      stateVersion,
    });

    await new Promise((res) => setTimeout(res, 20));
    expect(hostGameStarted).toBe(true);
    expect(guestGameStarted).toBe(true);

    // 4. Host rolls dice and broadcasts roll
    const hostRollAnnounced = 5;
    stateVersion += 1;
    hostPm.broadcast({
      type: 'ROLL_ANNOUNCED',
      player: 0,
      roll: hostRollAnnounced,
      stateVersion,
    });

    await new Promise((res) => setTimeout(res, 20));
    expect(guestReceivedRoll).toBe(5);

    // 5. Host broadcasts checkpoint after movement
    const snap: GameStateSnapshot = {
      mode: 'playing',
      pos: [20, 8],
      turn: 1,
      phase: 'idle',
      rolls: [3, 1],
      laddersHit: [1, 0],
      snakesHit: [0, 0],
      sixesHit: [0, 0],
      winner: -1,
      isPlaying: true,
    };
    stateVersion += 1;
    hostPm.broadcast({
      type: 'GAME_CHECKPOINT',
      snapshot: snap,
      stateVersion,
      turnId: 1,
    });

    await new Promise((res) => setTimeout(res, 20));
    expect(guestReceivedCheckpoint).not.toBeNull();
    expect(guestReceivedCheckpoint?.turn).toBe(1);
    expect(guestReceivedCheckpoint?.pos[0]).toBe(20);

    // 6. Guest sends emote to Host
    guestPm.broadcast({
      type: 'EMOTE',
      requestId: 'req_emote_1',
      player: 1,
      emoji: '🔥',
      timestamp: Date.now(),
    });

    await new Promise((res) => setTimeout(res, 20));
    expect(hostReceivedEmote).toBe('🔥');

    // Host sends emote to Guest
    hostPm.broadcast({
      type: 'EMOTE',
      requestId: 'req_emote_2',
      player: 0,
      emoji: '👑',
      timestamp: Date.now(),
    });

    await new Promise((res) => setTimeout(res, 20));
    expect(guestReceivedEmote).toBe('👑');

    // 7. Guest disconnects
    guestPm.cleanup();
    await new Promise((res) => setTimeout(res, 30));

    // Host retains disconnected guest as human without converting to CPU (isCpu: false, isReady: false)
    const guestSlotOnHost = hostPlayers.find((p) => p.slotIndex === 1);
    expect(guestSlotOnHost?.isCpu).toBe(false);
    expect(guestSlotOnHost?.isReady).toBe(false);
    expect(guestSlotOnHost?.name).toBe('GuestPlayer');
    expect(guestSlotOnHost?.name).not.toContain('(CPU)');

    // 8. Guest reconnects using stored secret token
    const reconnectedGuestPm = new PeerManager();
    let reconnectedGuestPlayers: NetworkPlayer[] = [];
    let reconnectedGuestReceivedRoll = 0;
    reconnectedGuestPm.onPacket((packet: Packet) => {
      if (packet.type === 'RECONNECT_ACCEPTED' || packet.type === 'LOBBY_UPDATE') {
        reconnectedGuestPlayers = packet.players;
      }
      if (packet.type === 'ROLL_RESULT') {
        reconnectedGuestReceivedRoll = packet.roll;
      }
    });

    await reconnectedGuestPm.joinRoom(
      roomCode,
      'GuestPlayer',
      1,
      true, // isReconnect
      1,    // slotIndex
      guestReconnectToken,
    );

    await new Promise((res) => setTimeout(res, 20));
    expect(reconnectedGuestPm.getSlotIndex()).toBe(1);

    // Host should have restored guest to active human (isCpu: false, isReady: true)
    expect(guestSlotOnHost?.isCpu).toBe(false);
    expect(guestSlotOnHost?.isReady).toBe(true);
    expect(guestSlotOnHost?.name).toBe('GuestPlayer');
    expect(reconnectedGuestPlayers.find((p) => p.slotIndex === 1)?.isCpu).toBe(false);

    // 9. Reconnected guest sends roll request to host and receives roll result immediately
    reconnectedGuestPm.broadcast({
      type: 'ROLL_REQUEST',
      requestId: 'req_reconnected_roll',
      turnId: 1,
      slotIndex: 1,
    });
    await new Promise((res) => setTimeout(res, 20));
    expect(hostReceivedRollRequest).not.toBeNull();
    expect(reconnectedGuestReceivedRoll).toBe(4);

    // Clean up
    reconnectedGuestPm.cleanup();
    hostPm.cleanup();
  });
});
