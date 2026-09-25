import Peer, { type DataConnection } from 'peerjs';
import type { AdmissionState, ConnectionStatus, Packet } from './types';
import {
  isGuestAllowedPacket,
  validatePacket,
} from './validation';

const PEER_PREFIX = 'snkladr-';
const PENDING_TIMEOUT_MS = 10000; // 10s to authenticate/join before disconnection

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

export interface ManagedConnection {
  conn: DataConnection;
  peerId: string;
  admissionState: AdmissionState;
  slotIndex: number;
  createdAt: number;
  lastHeartbeat: number;
  pendingTimer?: ReturnType<typeof setTimeout> | null;
}

export class PeerManager {
  private peer: Peer | null = null;
  private connections: Map<string, ManagedConnection> = new Map();
  private hostConn: DataConnection | null = null; // Used by guest
  private isHost = false;
  private roomCode = '';
  private mySlotIndex = 0;
  private myPlayerName = '';
  private myColorId = 0;

  private currentGeneration = 0;
  private pendingJoinResolve: (() => void) | null = null;
  private pendingJoinReject: ((err: Error) => void) | null = null;
  private pendingJoinTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHostHeartbeat = 0;

  private onPacketListeners: Set<PacketHandler> = new Set();
  private onStatusListeners: Set<StatusHandler> = new Set();

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  public currentPing = 0;

  constructor() {
    // Empty constructor
  }

  getGeneration(): number {
    return this.currentGeneration;
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

  /* ---------- Connection Admission Management (Host) ---------- */

  getAdmissionState(peerId: string): AdmissionState | undefined {
    return this.connections.get(peerId)?.admissionState;
  }

  setAdmissionState(peerId: string, state: AdmissionState, slotIndex?: number) {
    const mc = this.connections.get(peerId);
    if (!mc) return;

    mc.admissionState = state;
    if (slotIndex !== undefined) {
      mc.slotIndex = slotIndex;
    }

    if (state === 'authenticated' || state === 'joined') {
      if (mc.pendingTimer) {
        clearTimeout(mc.pendingTimer);
        mc.pendingTimer = null;
      }
    }

    if (state === 'closed') {
      this.closeConnection(peerId, 'Admission state transitioned to closed');
    }
  }

  closeConnection(peerId: string, reason?: string) {
    const mc = this.connections.get(peerId);
    if (!mc || mc.admissionState === 'closed') return;

    if (reason) {
      console.warn(`[PeerManager] Closed connection ${peerId}: ${reason}`);
    }

    if (mc.pendingTimer) {
      clearTimeout(mc.pendingTimer);
      mc.pendingTimer = null;
    }

    mc.admissionState = 'closed';
    this.connections.delete(peerId);

    try {
      mc.conn.close();
    } catch {
      // Ignore
    }

    // If connection was already joined to a slot, notify host logic that player left
    if (this.isHost && mc.slotIndex >= 0) {
      this.emitPacket(
        {
          type: 'PLAYER_DISCONNECTED',
          slotIndex: mc.slotIndex,
          name: peerId,
          stateVersion: 0,
        },
        peerId,
      );
    }
  }

  getConnections(): ManagedConnection[] {
    return Array.from(this.connections.values());
  }

  getJoinedConnections(): ManagedConnection[] {
    return Array.from(this.connections.values()).filter(
      (c) => c.admissionState === 'joined' && c.conn.open,
    );
  }

  /* ---------- HOST: Create Room ---------- */
  async createRoom(
    roomCode: string,
    hostName: string,
    colorId: number,
    isRehost = false,
  ): Promise<string> {
    this.cleanup();
    this.currentGeneration++;
    const gen = this.currentGeneration;
    this.isHost = true;
    this.roomCode = roomCode.toUpperCase();
    this.mySlotIndex = 0;
    this.myPlayerName = hostName;
    this.myColorId = colorId;
    this.lastHostHeartbeat = 0;
    this.emitStatus(
      'creating',
      isRehost ? `Re-hosting room ${this.roomCode}...` : 'Setting up room on peer network...',
    );

    const setupPeer = (retryCount = 0): Promise<string> => {
      return new Promise((resolve, reject) => {
        if (this.currentGeneration !== gen) {
          reject(new Error('Room creation aborted by new operation'));
          return;
        }

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
          if (this.currentGeneration !== gen) return;
          this.emitStatus('connected');
          this.startPingMonitor();
          resolve(this.roomCode);
        });

        peer.on('connection', (conn) => {
          if (this.currentGeneration !== gen) {
            try {
              conn.close();
            } catch {
              // Ignore
            }
            return;
          }
          this.handleIncomingConnection(conn);
        });

        peer.on('error', (err: any) => {
          if (this.currentGeneration !== gen) return;
          if (err.type === 'unavailable-id') {
            if (isRehost && retryCount < 2) {
              this.emitStatus(
                'reconnecting',
                `Releasing prior connection for room ${this.roomCode}... (attempt ${retryCount + 1})`,
              );
              try {
                peer.destroy();
              } catch {
                // Ignore
              }
              setTimeout(() => {
                if (this.currentGeneration !== gen) return;
                setupPeer(retryCount + 1).then(resolve).catch(reject);
              }, 1200);
              return;
            }
            this.emitStatus('error', `Room code ${this.roomCode} is already active.`);
          } else {
            this.emitStatus('error', err.message || 'Connection error');
          }
          reject(err);
        });

        peer.on('disconnected', () => {
          if (this.currentGeneration !== gen) return;
          this.emitStatus('reconnecting', 'Attempting to reconnect...');
          peer.reconnect();
        });

        peer.on('close', () => {
          if (this.currentGeneration !== gen) return;
          this.emitStatus('disconnected', 'Room closed');
          this.cleanup();
        });
      });
    };

    return setupPeer();
  }

  /* ---------- GUEST: Join Room ---------- */
  async joinRoom(
    roomCode: string,
    guestName: string,
    colorId: number,
    isReconnect = false,
    reconnectSlotIndex = 0,
    reconnectToken = '',
    timeoutMs = 10000,
  ): Promise<void> {
    this.cleanup();
    this.currentGeneration++;
    const gen = this.currentGeneration;
    this.isHost = false;
    this.roomCode = roomCode.toUpperCase().trim();
    this.myPlayerName = guestName;
    this.myColorId = colorId;
    this.lastHostHeartbeat = 0;
    this.emitStatus(
      isReconnect ? 'reconnecting' : 'joining',
      isReconnect ? `Reconnecting to room ${this.roomCode}...` : `Connecting to room ${this.roomCode}...`,
    );

    return new Promise((resolve, reject) => {
      this.pendingJoinResolve = resolve;
      this.pendingJoinReject = reject;

      this.pendingJoinTimer = setTimeout(() => {
        if (this.currentGeneration !== gen) return;
        const rej = this.pendingJoinReject;
        this.pendingJoinResolve = null;
        this.pendingJoinReject = null;
        this.pendingJoinTimer = null;
        this.emitStatus('error', 'Join request timed out. Please try again.');
        this.cleanup();
        rej?.(new Error('Join request timed out'));
      }, timeoutMs);

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
        if (this.currentGeneration !== gen) return;
        const hostPeerId = `${PEER_PREFIX}${this.roomCode.toLowerCase()}`;
        const conn = peer.connect(hostPeerId, { reliable: true });
        this.hostConn = conn;

        conn.on('open', () => {
          if (this.currentGeneration !== gen) return;
          this.emitStatus('joining', 'Authenticating with host...');
          const reqId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

          if (isReconnect) {
            conn.send({
              type: 'RECONNECT_REQUEST',
              requestId: reqId,
              roomCode: this.roomCode,
              slotIndex: reconnectSlotIndex,
              reconnectToken,
            } as Packet);
          } else {
            conn.send({
              type: 'JOIN_REQUEST',
              requestId: reqId,
              roomCode: this.roomCode,
              name: this.myPlayerName,
              colorId: this.myColorId,
            } as Packet);
          }
          this.startPingMonitor();
        });

        conn.on('data', (raw: any) => {
          if (this.currentGeneration !== gen) return;
          this.handlePacket(raw, hostPeerId);
        });

        conn.on('close', () => {
          if (this.currentGeneration !== gen) return;
          this.emitStatus('disconnected', 'Disconnected from host');
          if (this.pendingJoinReject) {
            if (this.pendingJoinTimer) {
              clearTimeout(this.pendingJoinTimer);
              this.pendingJoinTimer = null;
            }
            const rej = this.pendingJoinReject;
            this.pendingJoinResolve = null;
            this.pendingJoinReject = null;
            rej(new Error('Connection closed before admission'));
          }
          this.cleanup();
        });

        conn.on('error', (err) => {
          if (this.currentGeneration !== gen) return;
          this.emitStatus('error', err.message || 'Connection error to host');
          if (this.pendingJoinReject) {
            if (this.pendingJoinTimer) {
              clearTimeout(this.pendingJoinTimer);
              this.pendingJoinTimer = null;
            }
            const rej = this.pendingJoinReject;
            this.pendingJoinResolve = null;
            this.pendingJoinReject = null;
            rej(err);
          }
        });
      });

      peer.on('error', (err: any) => {
        if (this.currentGeneration !== gen) return;
        const msg =
          err.type === 'peer-unavailable'
            ? `Room ${this.roomCode} was not found. Check code.`
            : err.message || 'Network error';
        this.emitStatus('error', msg);
        if (this.pendingJoinReject) {
          if (this.pendingJoinTimer) {
            clearTimeout(this.pendingJoinTimer);
            this.pendingJoinTimer = null;
          }
          const rej = this.pendingJoinReject;
          this.pendingJoinResolve = null;
          this.pendingJoinReject = null;
          rej(err);
        }
      });
    });
  }

  /* ---------- Incoming Connection Handlers ---------- */

  private handleIncomingConnection(conn: DataConnection) {
    const gen = this.currentGeneration;
    const peerId = conn.peer;

    // Reject if too many connections (limit to 12 total pending/active to avoid socket exhaustion)
    if (this.connections.size >= 12) {
      try {
        conn.close();
      } catch {
        // Ignore
      }
      return;
    }

    const timer = setTimeout(() => {
      if (this.currentGeneration !== gen) return;
      const mc = this.connections.get(peerId);
      if (mc && mc.admissionState === 'pending') {
        this.closeConnection(peerId, 'Timed out in pending admission state');
      }
    }, PENDING_TIMEOUT_MS);

    const managedConn: ManagedConnection = {
      conn,
      peerId,
      admissionState: 'pending',
      slotIndex: -1,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
      pendingTimer: timer,
    };

    this.connections.set(peerId, managedConn);

    conn.on('open', () => {
      if (this.currentGeneration !== gen) return;
      // Socket opened
    });

    conn.on('data', (raw: any) => {
      if (this.currentGeneration !== gen) return;

      // 1. Validate payload structure & schema
      const val = validatePacket(raw);
      if (!val.valid || !val.packet) {
        // Invalid or malformed packet: close connection immediately
        this.closeConnection(peerId, `Invalid packet: ${val.error}`);
        return;
      }

      const packet = val.packet;

      if (this.isHost) {
        // 2. Enforce host/guest packet permissions: Guests may only send permitted packets
        if (!isGuestAllowedPacket(packet.type)) {
          this.closeConnection(peerId, `Forbidden packet type from guest: ${packet.type}`);
          return;
        }

        const currentMC = this.connections.get(peerId);
        if (!currentMC) return;

        // 3. Admission state gating:
        if (currentMC.admissionState === 'pending') {
          // In pending state, ONLY JOIN_REQUEST, RECONNECT_REQUEST, and PING are accepted
          if (
            packet.type !== 'JOIN_REQUEST' &&
            packet.type !== 'RECONNECT_REQUEST' &&
            packet.type !== 'PING' &&
            packet.type !== 'PONG'
          ) {
            this.closeConnection(peerId, `Packet ${packet.type} not allowed in pending state`);
            return;
          }
        } else if (currentMC.admissionState === 'joined') {
          // Cannot re-request join if already joined
          if (packet.type === 'JOIN_REQUEST' || packet.type === 'RECONNECT_REQUEST') {
            return;
          }

          // Slot-bound packet validation: verify sender is using their assigned slot
          if (
            packet.type === 'COLOR_CHANGE_REQUEST' &&
            packet.slotIndex !== currentMC.slotIndex
          ) {
            this.closeConnection(peerId, 'Impersonation: COLOR_CHANGE_REQUEST slot mismatch');
            return;
          }

          if (
            packet.type === 'ROLL_REQUEST' &&
            packet.slotIndex !== currentMC.slotIndex
          ) {
            this.closeConnection(peerId, 'Impersonation: ROLL_REQUEST slot mismatch');
            return;
          }

          if (
            packet.type === 'EMOTE' &&
            packet.player !== currentMC.slotIndex
          ) {
            this.closeConnection(peerId, 'Impersonation: EMOTE slot mismatch');
            return;
          }
        } else if (currentMC.admissionState === 'closed') {
          return;
        }
      }

      this.handlePacket(packet, peerId);
    });

    conn.on('close', () => {
      if (this.currentGeneration !== gen) return;
      this.closeConnection(peerId, 'Peer closed connection');
    });

    conn.on('error', () => {
      if (this.currentGeneration !== gen) return;
      this.closeConnection(peerId, 'Peer connection error');
    });
  }

  private handlePacket(packet: Packet, fromPeerId?: string) {
    // Record heartbeat activity
    if (this.isHost) {
      if (fromPeerId) {
        const mc = this.connections.get(fromPeerId);
        if (mc) mc.lastHeartbeat = Date.now();
      }
    } else {
      this.lastHostHeartbeat = Date.now();
    }

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
      this.emitStatus('connected');
      if (this.pendingJoinResolve) {
        if (this.pendingJoinTimer) {
          clearTimeout(this.pendingJoinTimer);
          this.pendingJoinTimer = null;
        }
        const res = this.pendingJoinResolve;
        this.pendingJoinResolve = null;
        this.pendingJoinReject = null;
        res();
      }
    }

    if (packet.type === 'JOIN_REJECTED' || packet.type === 'RECONNECT_REJECTED') {
      this.emitStatus('error', packet.reason);
      if (this.pendingJoinReject) {
        if (this.pendingJoinTimer) {
          clearTimeout(this.pendingJoinTimer);
          this.pendingJoinTimer = null;
        }
        const rej = this.pendingJoinReject;
        this.pendingJoinResolve = null;
        this.pendingJoinReject = null;
        rej(new Error(packet.reason));
      }
      if (!this.isHost && this.hostConn) {
        try {
          this.hostConn.close();
        } catch {
          // Ignore
        }
        this.hostConn = null;
      }
    }

    this.emitPacket(packet, fromPeerId);
  }

  /* ---------- Send / Broadcast Packets ---------- */

  /**
   * Broadcasts packet strictly to authenticated, joined connections.
   * Never broadcasts to unauthenticated or pending connections.
   */
  broadcast(packet: Packet) {
    if (this.isHost) {
      this.connections.forEach((mc) => {
        if (mc.admissionState === 'joined' && mc.conn.open) {
          try {
            mc.conn.send(packet);
          } catch {
            // Socket send error
          }
        }
      });
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(packet);
    }
  }

  /**
   * Send packet to a specific peer
   */
  sendToPeer(peerId: string, packet: Packet) {
    if (this.isHost) {
      const mc = this.connections.get(peerId);
      if (mc && mc.conn.open) {
        try {
          mc.conn.send(packet);
        } catch {
          // Socket send error
        }
      }
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(packet);
    }
  }

  /* Ping latency monitor */
  private startPingMonitor() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    const gen = this.currentGeneration;
    this.lastHostHeartbeat = Date.now();

    this.pingInterval = (typeof window !== 'undefined' ? window.setInterval : setInterval)(() => {
      if (this.currentGeneration !== gen) return;
      const now = Date.now();

      if (this.isHost) {
        this.connections.forEach((mc) => {
          if (mc.conn.open && mc.admissionState === 'joined') {
            // Heartbeat deadline check: 9 seconds (3 missed pings)
            if (now - mc.lastHeartbeat >= 9000) {
              this.closeConnection(mc.peerId, 'Heartbeat deadline exceeded (missed responses)');
              return;
            }
            try {
              mc.conn.send({ type: 'PING', sentAt: now });
            } catch {
              // Socket send error
            }
          }
        });
      } else if (this.hostConn && this.hostConn.open) {
        // Heartbeat deadline check for guest: 9 seconds from host
        if (this.lastHostHeartbeat > 0 && now - this.lastHostHeartbeat >= 9000) {
          console.warn('[PeerManager] Host heartbeat deadline exceeded (missed responses)');
          this.emitStatus('disconnected', 'Host heartbeat timed out');
          try {
            this.hostConn.close();
          } catch {
            // Ignore
          }
          this.hostConn = null;
          return;
        }
        try {
          this.hostConn.send({ type: 'PING', sentAt: now });
        } catch {
          // Socket send error
        }
      }
    }, 3000);
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
    this.currentGeneration++;
    if (this.pendingJoinTimer) {
      clearTimeout(this.pendingJoinTimer);
      this.pendingJoinTimer = null;
    }
    if (this.pendingJoinReject) {
      const rej = this.pendingJoinReject;
      this.pendingJoinResolve = null;
      this.pendingJoinReject = null;
      rej(new Error('Connection cleaned up'));
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.connections.forEach((mc) => {
      if (mc.pendingTimer) clearTimeout(mc.pendingTimer);
      try {
        mc.conn.close();
      } catch {
        // Ignore
      }
    });
    this.connections.clear();
    if (this.hostConn) {
      try {
        this.hostConn.close();
      } catch {
        // Ignore
      }
      this.hostConn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        // Ignore
      }
      this.peer = null;
    }
    this.isHost = false;
    this.roomCode = '';
    this.currentPing = 0;
    this.lastHostHeartbeat = 0;
  }
}

export const peerManager = new PeerManager();
