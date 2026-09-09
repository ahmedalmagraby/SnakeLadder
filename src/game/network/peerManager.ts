import Peer, { type DataConnection } from 'peerjs';
import type { ConnectionStatus, Packet } from './types';

const PEER_PREFIX = 'snkladr-';

/* Generate clean 6-character room code */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export type PacketHandler = (packet: Packet, fromPeerId?: string) => void;
export type StatusHandler = (status: ConnectionStatus, detail?: string) => void;

export class PeerManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConn: DataConnection | null = null; // Used by guest
  private isHost = false;
  private roomCode = '';
  private mySlotIndex = 0;
  private myPlayerName = '';
  private myColorId = 0;

  private onPacketListeners: Set<PacketHandler> = new Set();
  private onStatusListeners: Set<StatusHandler> = new Set();

  private pingInterval: number | null = null;
  private lastPingSent = 0;
  public currentPing = 0;

  constructor() {
    // Empty constructor
  }

  /* Subscribe to packets */
  onPacket(fn: PacketHandler) {
    this.onPacketListeners.add(fn);
    return () => this.onPacketListeners.delete(fn);
  }

  /* Subscribe to status changes */
  onStatus(fn: StatusHandler) {
    this.onStatusListeners.add(fn);
    return () => this.onStatusListeners.delete(fn);
  }

  private emitStatus(status: ConnectionStatus, detail?: string) {
    this.onStatusListeners.forEach((fn) => fn(status, detail));
  }

  private emitPacket(packet: Packet, fromPeerId?: string) {
    this.onPacketListeners.forEach((fn) => fn(packet, fromPeerId));
  }

  /* ---------- HOST: Create Room ---------- */
  async createRoom(
    roomCode: string,
    hostName: string,
    colorId: number,
  ): Promise<string> {
    this.cleanup();
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase();
    this.mySlotIndex = 0;
    this.myPlayerName = hostName;
    this.myColorId = colorId;
    this.emitStatus('creating', 'Setting up room on peer network...');

    return new Promise((resolve, reject) => {
      const peerId = `${PEER_PREFIX}${this.roomCode.toLowerCase()}`;
      const peer = new Peer(peerId, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      this.peer = peer;

      peer.on('open', () => {
        this.emitStatus('connected');
        this.startPingMonitor();
        resolve(this.roomCode);
      });

      peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn);
      });

      peer.on('error', (err: any) => {
        if (err.type === 'unavailable-id') {
          this.emitStatus('error', `Room code ${this.roomCode} is already active.`);
        } else {
          this.emitStatus('error', err.message || 'Connection error');
        }
        reject(err);
      });

      peer.on('disconnected', () => {
        this.emitStatus('reconnecting', 'Attempting to reconnect...');
        peer.reconnect();
      });

      peer.on('close', () => {
        this.emitStatus('disconnected', 'Room closed');
        this.cleanup();
      });
    });
  }

  /* ---------- GUEST: Join Room ---------- */
  async joinRoom(
    roomCode: string,
    guestName: string,
    colorId: number,
    playerId: string,
    isReconnect = false,
  ): Promise<void> {
    this.cleanup();
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    this.myPlayerName = guestName;
    this.myColorId = colorId;
    this.emitStatus(
      isReconnect ? 'reconnecting' : 'joining',
      isReconnect ? `Reconnecting to room ${this.roomCode}...` : `Connecting to room ${this.roomCode}...`,
    );

    return new Promise((resolve, reject) => {
      const peer = new Peer({
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      });

      this.peer = peer;

      peer.on('open', () => {
        const hostPeerId = `${PEER_PREFIX}${this.roomCode.toLowerCase()}`;
        const conn = peer.connect(hostPeerId, { reliable: true });
        this.hostConn = conn;

        conn.on('open', () => {
          this.emitStatus('connected');
          // Request to join or reconnect
          if (isReconnect) {
            conn.send({
              type: 'RECONNECT_REQUEST',
              roomCode: this.roomCode,
              playerId,
              name: this.myPlayerName,
            } as Packet);
          } else {
            conn.send({
              type: 'JOIN_REQUEST',
              playerId,
              name: this.myPlayerName,
              colorId: this.myColorId,
            } as Packet);
          }
          this.startPingMonitor();
          resolve();
        });

        conn.on('data', (raw: any) => {
          this.handlePacket(raw as Packet, hostPeerId);
        });

        conn.on('close', () => {
          this.emitStatus('disconnected', 'Disconnected from host');
          this.cleanup();
        });

        conn.on('error', (err) => {
          this.emitStatus('error', err.message || 'Connection error to host');
          reject(err);
        });
      });

      peer.on('error', (err: any) => {
        if (err.type === 'peer-unavailable') {
          this.emitStatus('error', `Room ${this.roomCode} was not found. Check code.`);
        } else {
          this.emitStatus('error', err.message || 'Network error');
        }
        reject(err);
      });
    });
  }

  /* ---------- Connection Handlers ---------- */

  private handleIncomingConnection(conn: DataConnection) {
    const peerId = conn.peer;
    this.connections.set(peerId, conn);

    conn.on('open', () => {
      // Connection established
    });

    conn.on('data', (raw: any) => {
      const packet = raw as Packet;
      // Host relays game packets to all other connected peers (star network topology)
      if (this.isHost && (packet.type === 'DICE_ROLL' || packet.type === 'EMOTE')) {
        this.connections.forEach((otherConn, otherPeerId) => {
          if (otherPeerId !== peerId && otherConn.open) {
            otherConn.send(packet);
          }
        });
      }
      this.handlePacket(packet, peerId);
    });

    conn.on('close', () => {
      this.connections.delete(peerId);
      this.emitPacket({
        type: 'PLAYER_DISCONNECTED',
        slotIndex: -1,
        name: peerId,
      }, peerId);
    });

    conn.on('error', () => {
      this.connections.delete(peerId);
    });
  }

  private handlePacket(packet: Packet, fromPeerId?: string) {
    if (packet.type === 'PING') {
      // Reply with PONG immediately
      this.sendToPeer(fromPeerId ?? '', { type: 'PONG', sentAt: packet.sentAt });
      return;
    }

    if (packet.type === 'PONG') {
      const rtt = Date.now() - packet.sentAt;
      this.currentPing = Math.round(rtt / 2);
      return;
    }

    if (packet.type === 'JOIN_ACCEPTED' || packet.type === 'RECONNECT_ACCEPTED') {
      this.mySlotIndex = packet.slotIndex;
    }

    this.emitPacket(packet, fromPeerId);
  }

  /* ---------- Send / Broadcast Packets ---------- */

  broadcast(packet: Packet) {
    if (this.isHost) {
      // Send to all connected guests
      this.connections.forEach((conn) => {
        if (conn.open) conn.send(packet);
      });
    } else if (this.hostConn && this.hostConn.open) {
      // Guest sends to host
      this.hostConn.send(packet);
    }
  }

  sendToPeer(peerId: string, packet: Packet) {
    if (this.isHost) {
      const conn = this.connections.get(peerId);
      if (conn && conn.open) conn.send(packet);
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(packet);
    }
  }

  /* Ping latency monitor */
  private startPingMonitor() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = window.setInterval(() => {
      this.lastPingSent = Date.now();
      if (this.isHost) {
        this.connections.forEach((conn) => {
          if (conn.open) conn.send({ type: 'PING', sentAt: this.lastPingSent });
        });
      } else if (this.hostConn && this.hostConn.open) {
        this.hostConn.send({ type: 'PING', sentAt: this.lastPingSent });
      }
    }, 4000);
  }

  /* Getters */
  getRoomCode() {
    return this.roomCode;
  }

  getSlotIndex() {
    return this.mySlotIndex;
  }

  getIsHost() {
    return this.isHost;
  }

  /* Cleanup */
  cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    if (this.hostConn) {
      this.hostConn.close();
      this.hostConn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.isHost = false;
    this.roomCode = '';
    this.currentPing = 0;
  }
}

export const peerManager = new PeerManager();
