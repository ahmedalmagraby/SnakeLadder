import Peer, { type DataConnection } from 'peerjs';
import type { AdmissionState, ConnectionStatus, Packet } from './types';
import { PROTOCOL_VERSION } from './types';
import {
  isGuestAllowedPacket,
  isHostAllowedPacket,
  validatePacket,
} from './validation';

const PEER_PREFIX = 'snkladr-';
const PENDING_TIMEOUT_MS = 10000; // 10s to authenticate/join before disconnection
const PING_INTERVAL_MS = 3000;
/* (P1) Wall-clock heartbeat deadline. Must be >= 3x PING_INTERVAL_MS so a couple
 * of dropped pings are survivable, and it is only enforced while the tab is
 * visible - see `startPingMonitor`. */
const HEARTBEAT_DEADLINE_MS = 9000;

/* Generate clean 6-character room code.
 *
 * (P1) Uses a CSPRNG. This used to be `Math.random()`, which is neither
 * unpredictable nor uniformly distributed. The room code is also the PeerJS peer
 * id (`snkladr-<code>`) on a *public* broker, so it is the sole addressing
 * mechanism for the room: a predictable generator lets anyone who has seen a
 * few codes enumerate or pre-squat the rest of the 32^6 space, and
 * `Math.floor(Math.random() * 32)` is measurably biased on top of that.
 *
 * `crypto.getRandomValues` is available in every browser context this app runs
 * in (including plain-http LAN origins), so the fallback exists only for
 * non-browser/test environments and is deliberately noisy rather than quiet. */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len = chars.length;
  const out = new Uint8Array(6);
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(out);
  } else {
    for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
  }

  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[out[i] % len];
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
  /**
   * slotIndex -> peerId of the connection that currently owns that seat.
   * A data-channel `close` can arrive long after the owner reconnected on a new
   * connection; this lets us discard such stale departures instead of knocking a
   * live player out of the roster.
   */
  private slotOwners: Map<number, string> = new Map();
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
    if (state === 'joined' && slotIndex !== undefined) {
      // This connection now owns the seat; any older connection for it is stale.
      this.slotOwners.set(slotIndex, peerId);
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

    // If connection was already joined to a slot, notify host logic that player left.
    // Skip when this connection no longer owns the seat: a guest that already
    // reconnected on a fresh connection must NOT be reported as gone.
    if (this.isHost && mc.slotIndex >= 0 && this.slotOwners.get(mc.slotIndex) === peerId) {
      this.slotOwners.delete(mc.slotIndex);
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
              v: PROTOCOL_VERSION,
            } as Packet);
          } else {
            conn.send({
              type: 'JOIN_REQUEST',
              requestId: reqId,
              roomCode: this.roomCode,
              name: this.myPlayerName,
              colorId: this.myColorId,
              v: PROTOCOL_VERSION,
            } as Packet);
          }
          this.startPingMonitor();
        });

        conn.on('data', (raw: any) => {
          if (this.currentGeneration !== gen) return;
          /* (P1) The guest validates what it receives.
           *
           * This handler used to forward the raw frame straight into the
           * protocol layer, so *none* of the size, shape, enum or
           * prototype-pollution guards applied to a guest: a hostile host (or
           * anything that got itself onto the room's peer id) could push a
           * multi-megabyte JSON blob, a 64 KB player name or a NaN-filled
           * checkpoint into React state and the canvas renderer.
           *
           * (P0 FIX) Structural rejection is fatal, but a malformed *advisory*
           * snapshot is not.
           *
           * The first version of this failed the whole packet on any
           * validation error, which meant a single bad `gameState` field in a
           * JOIN_ACCEPTED tore down the connection and left the guest staring
           * at "Host sent an invalid packet: Invalid gameState snapshot" with
           * no way to join. That is the wrong trade: `gameState` is only a
           * convenience so a mid-match joiner can skip a few seconds of play -
           * the authoritative board arrives on the next `SYNC_CHECKPOINT`
           * regardless. So the snapshot is validated separately and, if it is
           * bad, dropped while the rest of the packet is honoured. The guest
           * joins, and resyncs one checkpoint later.
           *
           * Everything else (size cap, prototype pollution, enums, ranges on
           * fields the engine dereferences) is still fail-closed.
           */
          const val = validatePacket(raw, { lenientGameState: true });
          const droppedGameState = val.droppedGameStateField;
          if (!val.valid || !val.packet) {
            const reason = `Host sent an invalid packet: ${val.error}`;
            this.emitStatus('error', reason);
            this.abortPendingJoin(reason);
            this.cleanup();
            return;
          }
          if (!isHostAllowedPacket(val.packet.type)) {
            // A host has no business sending client-shaped packets.
            const reason = `Host sent a forbidden packet: ${val.packet.type}`;
            this.emitStatus('error', reason);
            this.abortPendingJoin(reason);
            this.cleanup();
            return;
          }

          // The advisory snapshot was dropped by the validator; warn loudly
          // with the offending field, then carry on without it.
          if (droppedGameState) {
            console.warn(
              `[PeerManager] Host sent an unusable gameState snapshot (bad field: ${droppedGameState}); ` +
                'joining without it - the board will resync on the next checkpoint.',
            );
          }

          this.handlePacket(val.packet, hostPeerId);
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

  /* ---------- Teardown ---------- */

  /**
   * (P1) Abort a pending `joinRoom` without tearing down the live transport.
   *
   * The guest's inbound path calls `cleanup()` when the host sends something
   * malformed, and `cleanup()` rejects `pendingJoinReject` if one is still
   * registered. When a player is auto-rejoining, `pendingJoinReject` is still
   * set while the host's accept is in flight, so a bad frame produced an
   * *unhandled* promise rejection in the reconnect helper - a crash-level event
   * in a browser and a spurious test failure, with the actual cause (the bad
   * packet) buried in it.
   *
   * This clears the pending-join state without closing sockets or bumping the
   * generation, so the caller can report the real problem.
   */
  private abortPendingJoin(reason: string) {
    if (this.pendingJoinTimer) {
      clearTimeout(this.pendingJoinTimer);
      this.pendingJoinTimer = null;
    }
    if (this.pendingJoinReject) {
      const rej = this.pendingJoinReject;
      this.pendingJoinResolve = null;
      this.pendingJoinReject = null;
      rej(new Error(reason));
    }
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

    /* (P1) A reconnect legitimately reuses the peer id of the socket it is
       replacing. Previously `Map.set` silently orphaned the previous entry:
       its 10s admission timer kept running, its DataChannel was never closed,
       and `closeConnection(peerId)` could only ever reach the new entry - so
       the old socket stayed half-open for the life of the room. Retire the
       outgoing entry explicitly first. The late `close` event it fires is
       ignored by the generation check below, because `emitPacket` looks the
       peer id up in the map and now finds the *new* connection. */
    const previous = this.connections.get(peerId);
    if (previous && previous.conn !== conn) {
      this.connections.delete(peerId);
      if (previous.pendingTimer) {
        clearTimeout(previous.pendingTimer);
        previous.pendingTimer = null;
      }
      try {
        previous.conn.close();
      } catch {
        // Already gone; nothing to clean up.
      }
    }

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
      /* (P1) The guest branch was unguarded while the host branch was wrapped in
       * try/catch. A DataChannel whose `.open` still reads true while it is
       * `closing` throws `InvalidStateError` from `send()`, and that escaped
       * straight through `broadcastCheckpoint` / `broadcastRoll` / `startGame`
       * into React with no crash boundary. Treat a failed host send the same as
       * a failed guest send: report it and let the normal disconnect path run. */
      try {
        this.hostConn.send(packet);
      } catch {
        this.emitStatus('error', 'Lost connection to host while sending');
        try {
          this.hostConn.close();
        } catch {
          // Already gone.
        }
        this.hostConn = null;
      }
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
      // (P1) Same missing guard as `broadcast` - see the note there.
      try {
        this.hostConn.send(packet);
      } catch {
        this.emitStatus('error', 'Lost connection to host while sending');
        try {
          this.hostConn.close();
        } catch {
          // Already gone.
        }
        this.hostConn = null;
      }
    }
  }

  /* Ping latency monitor
   *
   * (P1) Timer-throttling safe.
   *
   * This used to be a bare 3s `setInterval` with a hard 9s deadline, which is
   * only correct while the tab is foregrounded. Browsers clamp timers in
   * background tabs (Chrome: >=1s normally, >=1min under intensive throttling),
   * so a player who switched tabs would come back to find themselves falsely
   * ejected by the host, or - worse - a guest that had *also* been throttled
   * falsely declaring the host dead and tearing the connection down.
   *
   * Two changes:
   *  1. The deadline is only evaluated when the page is actually visible, so a
   *     throttled tab can never accumulate a false timeout.
   *  2. The deadline is anchored to wall-clock time, so it still means "9 real
   *     seconds" regardless of how many times the interval actually fired.
   */
  private startPingMonitor() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    const gen = this.currentGeneration;
    this.lastHostHeartbeat = Date.now();

    this.pingInterval = (typeof window !== 'undefined' ? window.setInterval : setInterval)(() => {
      if (this.currentGeneration !== gen) return;
      const now = Date.now();

      /* (P1) While the tab is hidden the browser may not have fired this
       * interval for minutes. Declaring anybody dead on that basis is wrong, so
       * suspend the deadline and just re-anchor the clocks on return. */
      if (typeof document !== 'undefined' && document.hidden) {
        this.lastHostHeartbeat = now;
        this.connections.forEach((mc) => {
          mc.lastHeartbeat = now;
        });
        return;
      }

      if (this.isHost) {
        // Collect first: `closeConnection` mutates the map we would otherwise
        // be iterating, and emitting a packet fans out over that same map.
        const dead: string[] = [];
        this.connections.forEach((mc) => {
          if (mc.conn.open && mc.admissionState === 'joined') {
            if (now - mc.lastHeartbeat >= HEARTBEAT_DEADLINE_MS) {
              dead.push(mc.peerId);
              return;
            }
            try {
              mc.conn.send({ type: 'PING', sentAt: now });
            } catch {
              // Socket send error
            }
          }
        });
        dead.forEach((id) => this.closeConnection(id, 'Heartbeat deadline exceeded (missed responses)'));
      } else if (this.hostConn && this.hostConn.open) {
        if (this.lastHostHeartbeat > 0 && now - this.lastHostHeartbeat >= HEARTBEAT_DEADLINE_MS) {
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
    }, PING_INTERVAL_MS);
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

    /* (P1) Tear down *before* clearing the host flag.
     *
     * `conn.close()` fires the `close` handler synchronously, which calls
     * `closeConnection` -> `connections.delete()` (mutating the map we are
     * iterating) -> `emitPacket(PLAYER_DISCONNECTED)`. Because `isHost` was
     * still `true` at that moment, the host emitted a PLAYER_DISCONNECTED for
     * every single joined guest, each of which was fanned out over the same
     * half-destroyed roster and drove a `commitPlayers` + two broadcasts +
     * `saveSession` in the host's packet handler. Leaving a room produced a
     * burst of bogus "player left" churn from a roster that no longer existed.
     *
     * Clearing `isHost` first means those synthetic closes resolve to
     * "not a host" and emit nothing. The map is also snapshotted and emptied up
     * front so nothing can re-enter it mid-iteration. */
    this.isHost = false;

    const doomed = Array.from(this.connections.values());
    this.connections.clear();
    this.slotOwners.clear();

    for (const mc of doomed) {
      if (mc.pendingTimer) {
        clearTimeout(mc.pendingTimer);
        mc.pendingTimer = null;
      }
      try {
        mc.conn.close();
      } catch {
        // Ignore
      }
    }

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
    this.roomCode = '';
    this.currentPing = 0;
    this.lastHostHeartbeat = 0;
  }
}

export const peerManager = new PeerManager();
