import Peer, { type DataConnection } from 'peerjs';
import type { AdmissionState, ConnectionStatus, Packet } from './types';
import { PROTOCOL_VERSION } from './types';
import {
  isGuestAllowedPacket,
  isHostAllowedPacket,
  validatePacket,
} from './validation';

const PEER_PREFIX = 'snkladr-';
const PENDING_TIMEOUT_MS = 15000; // 15s to authenticate/join before disconnection
const DEFAULT_JOIN_TIMEOUT_MS = 15000; // 15s to allow cellular ICE + TURN relay fallback
const DEFAULT_RECONNECT_TIMEOUT_MS = 6000; // 6s per reconnect attempt so all 4 retries fit inside the 20s grace window
const PING_INTERVAL_MS = 3000;
/* (P1) Wall-clock heartbeat deadline. Must be >= 3x PING_INTERVAL_MS so a couple
 * of dropped pings are survivable, and it is only enforced while the tab is
 * visible - see `startPingMonitor`. */
const HEARTBEAT_DEADLINE_MS = 9000;
const CUSTOM_TURN_STORAGE_KEY = 'snkladr_turn_config';
const ICE_CANDIDATE_POOL_SIZE = 4;
const WS_RELAY_CONN_ID = 'snkladr_ws_relay';
const WS_RELAY_SDP_MID = 'snkladr-pkt';
const WS_RELAY_FALLBACK_MS = 2500;
const WS_RELAY_SYN_RETRY_MS = 500;
const WS_RELAY_MAX_SYN_RETRIES = 6;

const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

type WsRelayEnvelope =
  | { t: 'SYN'; sid: string }
  | { t: 'ACK'; sid: string }
  | { t: 'DATA'; sid: string; d: unknown }
  | { t: 'CLOSE'; sid: string };

/**
 * Virtual DataConnection backed by the PeerJS signaling WebSocket (`peer.socket`).
 *
 * When a player is on 5G/4G Mobile Data (Symmetric CGNAT) or behind a strict
 * firewall and direct WebRTC UDP hole-punching cannot open a DataChannel within
 * `WS_RELAY_FALLBACK_MS`, `PeerManager` seamlessly falls back to this WebSocket
 * relay channel over `wss://0.peerjs.com:443`.
 */
export class WsRelayConnection {
  public readonly peer: string;
  public readonly sessionId: string;
  public open = false;
  public readonly isWsRelay = true;

  private localPeer: Peer;
  private callbacks: Record<string, ((...args: any[]) => void)[]> = {};
  private closed = false;
  private synTimer: ReturnType<typeof setInterval> | null = null;

  constructor(remotePeerId: string, localPeer: Peer, sessionId: string, initiallyOpen = false) {
    this.peer = remotePeerId;
    this.localPeer = localPeer;
    this.sessionId = sessionId;
    this.open = initiallyOpen;
  }

  on(event: string, cb: (...args: any[]) => void) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
    return this;
  }

  private emit(event: string, ...args: any[]) {
    const list = this.callbacks[event];
    if (!list) return;
    for (const cb of [...list]) {
      cb(...args);
    }
  }

  sendRawEnvelope(envelope: WsRelayEnvelope) {
    const sock = (this.localPeer as any)?.socket;
    if (!sock || typeof sock.send !== 'function') return;
    try {
      sock.send({
        type: 'CANDIDATE',
        dst: this.peer,
        payload: {
          connectionId: WS_RELAY_CONN_ID,
          type: 'data',
          candidate: {
            candidate: JSON.stringify(envelope),
            sdpMid: WS_RELAY_SDP_MID,
            sdpMLineIndex: 0,
          },
        },
      });
    } catch {
      // Ignore socket send error
    }
  }

  startHandshake() {
    if (this.closed || this.open) return;
    let attempts = 0;
    this.sendRawEnvelope({ t: 'SYN', sid: this.sessionId });
    this.synTimer = setInterval(() => {
      if (this.closed || this.open || attempts >= WS_RELAY_MAX_SYN_RETRIES) {
        if (this.synTimer) {
          clearInterval(this.synTimer);
          this.synTimer = null;
        }
        return;
      }
      attempts += 1;
      this.sendRawEnvelope({ t: 'SYN', sid: this.sessionId });
    }, WS_RELAY_SYN_RETRY_MS);
  }

  _handleAck() {
    if (this.closed) return;
    if (this.synTimer) {
      clearInterval(this.synTimer);
      this.synTimer = null;
    }
    if (!this.open) {
      this.open = true;
      this.emit('open');
    }
  }

  _handleData(data: unknown) {
    if (this.closed || !this.open) return;
    this.emit('data', data);
  }

  _handleRemoteClose() {
    this.close(true);
  }

  send(data: any) {
    if (this.closed || !this.open) {
      throw new Error('WsRelayConnection is not open');
    }
    this.sendRawEnvelope({ t: 'DATA', sid: this.sessionId, d: data });
  }

  close(remoteInitiated = false) {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    if (this.synTimer) {
      clearInterval(this.synTimer);
      this.synTimer = null;
    }
    if (!remoteInitiated) {
      this.sendRawEnvelope({ t: 'CLOSE', sid: this.sessionId });
    }
    this.emit('close');
  }
}

function isValidIceServerEntry(entry: unknown): entry is RTCIceServer {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Record<string, unknown>;
  const urls = candidate.urls;
  const validUrls =
    (typeof urls === 'string' && urls.trim().length > 0) ||
    (Array.isArray(urls) &&
      urls.length > 0 &&
      urls.every((u) => typeof u === 'string' && u.trim().length > 0));
  if (!validUrls) return false;
  if (candidate.username !== undefined && typeof candidate.username !== 'string') return false;
  if (candidate.credential !== undefined && typeof candidate.credential !== 'string') return false;
  return true;
}

/**
 * Returns the WebRTC ICE server list (STUN + TURN over UDP, TCP, and TLS 443)
 * so peers behind mobile carrier CGNAT / Symmetric NAT can connect via relay
 * when direct STUN hole-punching is blocked.
 */
export function getIceServers(): RTCIceServer[] {
  const customServers: RTCIceServer[] = [];

  try {
    const env = (import.meta as any)?.env;
    if (env?.VITE_TURN_URLS && typeof env.VITE_TURN_URLS === 'string') {
      const urls = env.VITE_TURN_URLS.split(',')
        .map((u: string) => u.trim())
        .filter(Boolean);
      if (urls.length > 0) {
        customServers.push({
          urls,
          username: typeof env.VITE_TURN_USERNAME === 'string' ? env.VITE_TURN_USERNAME : undefined,
          credential:
            typeof env.VITE_TURN_CREDENTIAL === 'string' ? env.VITE_TURN_CREDENTIAL : undefined,
        });
      }
    }
  } catch {
    // Ignore env read errors
  }

  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const raw = localStorage.getItem(CUSTOM_TURN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          if (isValidIceServerEntry(item)) {
            const sanitized: RTCIceServer = { urls: item.urls };
            if (item.username !== undefined) sanitized.username = item.username;
            if (item.credential !== undefined) sanitized.credential = item.credential;
            customServers.push(sanitized);
          }
        }
      }
    }
  } catch {
    // Ignore malformed localStorage TURN config
  }

  return [...DEFAULT_STUN_SERVERS, ...customServers];
}

export function buildPeerConfig(): RTCConfiguration {
  return {
    iceServers: getIceServers(),
    iceCandidatePoolSize: ICE_CANDIDATE_POOL_SIZE,
  };
}

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
  private wsFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHostHeartbeat = 0;

  private onPacketListeners: Set<PacketHandler> = new Set();
  private onStatusListeners: Set<StatusHandler> = new Set();

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private visibilityListener: (() => void) | null = null;
  private onlineListener: (() => void) | null = null;
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
      // This connection now owns the seat; retire any older connection that held it.
      const prevOwner = this.slotOwners.get(slotIndex);
      this.slotOwners.set(slotIndex, peerId);
      if (prevOwner && prevOwner !== peerId) {
        this.closeConnection(prevOwner, 'Replaced by reconnected peer on same slot');
      }
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
          config: buildPeerConfig(),
        });

        this.peer = peer;
        this.installWsRelayInterceptor(peer, gen);
        this.attachLifecycleListeners();
        let hasOpened = false;

        peer.on('open', () => {
          if (this.currentGeneration !== gen) return;
          hasOpened = true;
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
          const existing = this.connections.get(conn.peer);
          if (existing && ((existing.conn as any).isWsRelay || existing.admissionState === 'joined')) {
            return;
          }
          this.handleIncomingConnection(conn);
        });

        peer.on('error', (err: any) => {
          if (this.currentGeneration !== gen) return;
          // Non-fatal per-guest errors (such as a departed guest expiring on the
          // signaling broker or a guest's WebRTC ICE failing after falling back
          // to WsRelayConnection) must NEVER mark the host's room as errored/offline.
          if (err?.type === 'peer-unavailable' || err?.type === 'webrtc') {
            return;
          }
          if (hasOpened) {
            // Once the room is live, transient signaling errors are handled by reconnect()
            const p = peer as any;
            if (!p.destroyed && p.disconnected && typeof peer.reconnect === 'function') {
              this.emitStatus('reconnecting', 'Attempting to reconnect...');
              try {
                peer.reconnect();
              } catch {
                // Ignore
              }
            }
            return;
          }
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
    timeoutMs?: number,
  ): Promise<void> {
    const effectiveTimeoutMs =
      timeoutMs ?? (isReconnect ? DEFAULT_RECONNECT_TIMEOUT_MS : DEFAULT_JOIN_TIMEOUT_MS);
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
      }, effectiveTimeoutMs);

      const peer = new Peer({
        config: buildPeerConfig(),
      });

      this.peer = peer;
      this.installWsRelayInterceptor(peer, gen);
      this.attachLifecycleListeners();

      peer.on('open', () => {
        if (this.currentGeneration !== gen) return;
        const hostPeerId = `${PEER_PREFIX}${this.roomCode.toLowerCase()}`;
        const conn = peer.connect(hostPeerId, { reliable: true });
        this.hostConn = conn;

        const clearWsFallback = () => {
          if (this.wsFallbackTimer) {
            clearTimeout(this.wsFallbackTimer);
            this.wsFallbackTimer = null;
          }
        };

        const startWsRelayFallback = () => {
          clearWsFallback();
          if (this.currentGeneration !== gen) return;
          if (!this.peer || this.hostConn !== conn || conn.open) return;
          const sock = (this.peer as any).socket;
          if (!sock || typeof sock.send !== 'function') return;

          const sid = 'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
          const relayConn = new WsRelayConnection(hostPeerId, this.peer, sid, false);
          this.hostConn = relayConn as unknown as DataConnection;

          try {
            conn.close();
          } catch {
            // Ignore
          }

          this.bindGuestConnection(
            relayConn as unknown as DataConnection,
            hostPeerId,
            gen,
            isReconnect,
            reconnectSlotIndex,
            reconnectToken,
            clearWsFallback,
          );
          relayConn.startHandshake();
        };

        if ((peer as any).socket && typeof (peer as any).socket.send === 'function') {
          this.wsFallbackTimer = setTimeout(startWsRelayFallback, WS_RELAY_FALLBACK_MS);
          conn.on('iceStateChanged' as any, (state: string) => {
            if (state === 'failed' || state === 'disconnected') {
              startWsRelayFallback();
            }
          });
        }

        this.bindGuestConnection(
          conn,
          hostPeerId,
          gen,
          isReconnect,
          reconnectSlotIndex,
          reconnectToken,
          clearWsFallback,
        );
      });

      peer.on('disconnected', () => {
        if (this.currentGeneration !== gen) return;
        const p = peer as any;
        if (!p.destroyed && typeof peer.reconnect === 'function') {
          try {
            peer.reconnect();
          } catch {
            // Ignore reconnect errors while network settles
          }
        }
      });

      peer.on('error', (err: any) => {
        if (this.currentGeneration !== gen) return;
        // Ignore non-fatal WebRTC negotiation errors when WS relay fallback is available or active
        if (err?.type === 'webrtc') {
          return;
        }
        if (this.hostConn && this.hostConn.open && err?.type !== 'peer-unavailable') {
          const p = peer as any;
          if (!p.destroyed && p.disconnected && typeof peer.reconnect === 'function') {
            try {
              peer.reconnect();
            } catch {
              // Ignore
            }
          }
          return;
        }
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

  private bindGuestConnection(
    conn: DataConnection,
    hostPeerId: string,
    gen: number,
    isReconnect: boolean,
    reconnectSlotIndex: number,
    reconnectToken: string,
    onOpenCallback?: () => void,
  ) {
    conn.on('open', () => {
      if (this.currentGeneration !== gen || this.hostConn !== conn) return;
      onOpenCallback?.();
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
      if (this.currentGeneration !== gen || this.hostConn !== conn) return;
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
        const reason = `Host sent a forbidden packet: ${val.packet.type}`;
        this.emitStatus('error', reason);
        this.abortPendingJoin(reason);
        this.cleanup();
        return;
      }

      if (droppedGameState) {
        console.warn(
          `[PeerManager] Host sent an unusable gameState snapshot (bad field: ${droppedGameState}); ` +
            'joining without it - the board will resync on the next checkpoint.',
        );
      }

      this.handlePacket(val.packet, hostPeerId);
    });

    conn.on('close', () => {
      if (this.currentGeneration !== gen || this.hostConn !== conn) return;
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
      if (this.currentGeneration !== gen || this.hostConn !== conn) return;
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
  }

  private installWsRelayInterceptor(peer: Peer, gen: number) {
    const rawPeer = peer as any;
    if (typeof rawPeer._handleMessage !== 'function') return;
    if (rawPeer.__snkladrRelayInstalled) return;
    rawPeer.__snkladrRelayInstalled = true;

    const origHandleMessage = rawPeer._handleMessage.bind(peer);
    rawPeer._handleMessage = (message: any) => {
      if (this.currentGeneration !== gen) return;
      if (
        message?.type === 'CANDIDATE' &&
        message?.payload?.connectionId === WS_RELAY_CONN_ID
      ) {
        this.handleWsRelayMessage(message, gen);
        return;
      }
      if (message?.type === 'LEAVE' && typeof message?.src === 'string') {
        if (this.isHost && this.connections.has(message.src)) {
          this.closeConnection(message.src, 'Remote peer left signaling server');
        } else if (!this.isHost && this.hostConn?.peer === message.src && (this.hostConn as any).isWsRelay) {
          (this.hostConn as unknown as WsRelayConnection)._handleRemoteClose();
        }
      }
      if (message?.type === 'EXPIRE' && typeof message?.src === 'string' && this.isHost) {
        // A departed guest peer expired on the signaling broker: close that guest's
        // connection and suppress PeerJS's default handler so it does not emit a
        // bogus 'peer-unavailable' error on the host peer.
        if (this.connections.has(message.src)) {
          this.closeConnection(message.src, 'Remote peer expired on signaling server');
        }
        return;
      }
      return origHandleMessage(message);
    };
  }

  private handleWsRelayMessage(message: any, gen: number) {
    if (this.currentGeneration !== gen || !this.peer) return;
    const fromPeerId = message?.src;
    const rawCandidate = message?.payload?.candidate?.candidate;
    if (typeof fromPeerId !== 'string' || typeof rawCandidate !== 'string') return;

    let env: WsRelayEnvelope;
    try {
      env = JSON.parse(rawCandidate) as WsRelayEnvelope;
    } catch {
      return;
    }
    if (!env || typeof env !== 'object' || typeof env.sid !== 'string') return;

    if (this.isHost) {
      if (env.t === 'SYN') {
        const existing = this.connections.get(fromPeerId)?.conn as unknown as WsRelayConnection | undefined;
        if (existing && existing.isWsRelay && existing.sessionId === env.sid) {
          existing.sendRawEnvelope({ t: 'ACK', sid: env.sid });
          return;
        }
        const relayConn = new WsRelayConnection(fromPeerId, this.peer, env.sid, true);
        this.handleIncomingConnection(relayConn as unknown as DataConnection);
        relayConn.sendRawEnvelope({ t: 'ACK', sid: env.sid });
        return;
      }

      const active = this.connections.get(fromPeerId)?.conn as unknown as WsRelayConnection | undefined;
      if (!active || !active.isWsRelay || active.sessionId !== env.sid) return;

      if (env.t === 'DATA') {
        active._handleData(env.d);
      } else if (env.t === 'CLOSE') {
        active._handleRemoteClose();
      }
    } else {
      const active = this.hostConn as unknown as WsRelayConnection | null;
      if (!active || !active.isWsRelay || active.peer !== fromPeerId || active.sessionId !== env.sid) {
        return;
      }
      if (env.t === 'ACK') {
        active._handleAck();
      } else if (env.t === 'DATA') {
        active._handleData(env.d);
      } else if (env.t === 'CLOSE') {
        active._handleRemoteClose();
      }
    }
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
      if (mc && mc.conn === conn && mc.admissionState === 'pending') {
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
       its 15s admission timer kept running, its DataChannel was never closed,
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
      if (this.connections.get(peerId)?.conn !== conn) return;

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
      if (this.connections.get(peerId)?.conn !== conn) return;
      this.closeConnection(peerId, 'Peer closed connection');
    });

    conn.on('error', () => {
      if (this.currentGeneration !== gen) return;
      if (this.connections.get(peerId)?.conn !== conn) return;
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
  private reanchorHeartbeats(now = Date.now()) {
    this.lastHostHeartbeat = now;
    this.connections.forEach((mc) => {
      mc.lastHeartbeat = now;
    });
  }

  private attachLifecycleListeners() {
    this.detachLifecycleListeners();

    const handleResumeOrOnline = () => {
      const now = Date.now();
      this.reanchorHeartbeats(now);

      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      const p = this.peer as any;
      if (p && p.disconnected && !p.destroyed && typeof p.reconnect === 'function') {
        try {
          p.reconnect();
        } catch {
          // Ignore reconnect errors while network settles
        }
      }

      // Immediately transmit a PING to open peers upon returning to the foreground
      // so the remote side's 9s heartbeat deadline does not expire before our next 3s tick.
      if (this.isHost) {
        this.connections.forEach((mc) => {
          if (mc.conn.open && mc.admissionState === 'joined') {
            try {
              mc.conn.send({ type: 'PING', sentAt: now });
            } catch {
              // Ignore socket send error
            }
          }
        });
      } else if (this.hostConn && this.hostConn.open) {
        try {
          this.hostConn.send({ type: 'PING', sentAt: now });
        } catch {
          // Ignore socket send error
        }
      }
    };

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.visibilityListener = handleResumeOrOnline;
      document.addEventListener('visibilitychange', this.visibilityListener);
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.onlineListener = handleResumeOrOnline;
      window.addEventListener('online', this.onlineListener);
    }
  }

  private detachLifecycleListeners() {
    if (
      this.visibilityListener &&
      typeof document !== 'undefined' &&
      typeof document.removeEventListener === 'function'
    ) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
    this.visibilityListener = null;

    if (
      this.onlineListener &&
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('online', this.onlineListener);
    }
    this.onlineListener = null;
  }

  private startPingMonitor() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    const gen = this.currentGeneration;
    this.reanchorHeartbeats(Date.now());

    this.pingInterval = (typeof window !== 'undefined' ? window.setInterval : setInterval)(() => {
      if (this.currentGeneration !== gen) return;
      const now = Date.now();

      /* (P1) While the tab is hidden the browser may not have fired this
       * interval for minutes. Declaring anybody dead on that basis is wrong, so
       * suspend the deadline and just re-anchor the clocks on return. */
      if (typeof document !== 'undefined' && document.hidden) {
        this.reanchorHeartbeats(now);
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
    if (this.wsFallbackTimer) {
      clearTimeout(this.wsFallbackTimer);
      this.wsFallbackTimer = null;
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
    this.detachLifecycleListeners();

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
