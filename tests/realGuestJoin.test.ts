/**
 * @vitest-environment jsdom
 *
 * Real end-to-end guest join, with the REAL host protocol handler.
 *
 * The existing suites each cover half the path:
 *  - `twoClientIntegration.test.ts` drives two real `PeerManager`s but
 *    hand-rolls its own miniature host, so it never runs `useMultiplayer`'s
 *    packet handler.
 *  - `multiplayerBugFixes.test.tsx` runs the real `useMultiplayer` host but
 *    against a `HostStub` that plays the part of the *host*, so the real
 *    `PeerManager` guest-side inbound path is never executed.
 *
 * Nothing covered "real host handler + real PeerManager guest", which is exactly
 * the configuration a player uses. This file closes that gap.
 */
import { it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { validatePacket } from '../src/game/network/validation';
import { PROTOCOL_VERSION } from '../src/game/network/types';
import type { Packet } from '../src/game/network/types';

/* ------------------------------------------------------------------ */
/* Minimal but faithful PeerJS double                                 */
/* ------------------------------------------------------------------ */

type Handler = (...a: any[]) => void;

class Conn {
  peer: string;
  open = false;
  closed = false;
  paired: Conn | null = null;
  callbacks: Record<string, Handler[]> = {};

  constructor(peer: string) {
    this.peer = peer;
  }
  on(ev: string, cb: Handler) {
    (this.callbacks[ev] ||= []).push(cb);
    return this;
  }
  emit(ev: string, ...a: any[]) {
    for (const cb of [...(this.callbacks[ev] || [])]) cb(...a);
  }
  send(data: any) {
    if (this.closed) throw new Error('InvalidStateError: channel is closing');
    // Real PeerJS hands the far side the same shape it was given.
    queueMicrotask(() => this.paired?.emit('data', data));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.emit('close');
  }
}

interface PeerRec {
  peer: PeerDouble;
  conn: Conn | null;
}
const registry = new Map<string, PeerRec>();

class PeerDouble {
  id: string;
  destroyed = false;
  conn: Conn | null = null;
  callbacks: Record<string, Handler[]> = {};

  /**
   * `new Peer(id, opts)` for a host, `new Peer(opts)` for a guest - the real
   * library mints its own id in the second case. Only a string first argument
   * is an id; anything else is the options object.
   */
  constructor(idOrOpts?: string | Record<string, unknown>) {
    this.id =
      typeof idOrOpts === 'string'
        ? idOrOpts
        : `anon-${Math.random().toString(36).slice(2, 10)}`;
    registry.set(this.id, { peer: this, conn: null });
    // A real PeerJS instance registers with the broker and then emits `open`.
    // `createRoom` and `joinRoom` both await that event, so without it every
    // call would hang until its own timeout. A microtask is late enough for the
    // caller to have attached its listener via `peer.on('open', ...)`.
    queueMicrotask(() => this.emit('open'));
  }
  on(ev: string, cb: Handler) {
    (this.callbacks[ev] ||= []).push(cb);
    return this;
  }
  emit(ev: string, ...a: any[]) {
    for (const cb of [...(this.callbacks[ev] || [])]) cb(...a);
  }
  connect(remoteId: string) {
    const rec = registry.get(remoteId);
    if (!rec) {
      queueMicrotask(() => this.emit('error', { type: 'peer-unavailable' }));
      const dead = new Conn(remoteId);
      dead.open = true;
      return dead;
    }
    const mine = new Conn(remoteId);
    const theirs = new Conn(this.id);
    mine.paired = theirs;
    theirs.paired = mine;
    mine.open = true;
    theirs.open = true;
    rec.conn = mine;
    this.conn = theirs;
    // The host sees this through the real `peer.on('connection', ...)` hook
    // that `peerManager.createRoom` installs. Nothing is stubbed out here.
    queueMicrotask(() => rec.peer.emit('connection', theirs));
    // A real DataConnection emits `open` once its channel is established, and
    // both sides wait for that before sending anything.
    queueMicrotask(() => {
      mine.emit('open');
      theirs.emit('open');
    });
    return mine;
  }
  destroy() {
    this.destroyed = true;
    registry.delete(this.id);
  }
}

vi.mock('peerjs', () => ({ default: PeerDouble }));

const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Loaded exactly once. Calling `vi.resetModules()` between tests would hand
 * each dynamic import a *different* React instance, while
 * `@testing-library/react` was statically imported against the first one -
 * which silently yields a null `result.current`.
 */
let mod!: typeof import('../src/game/network/peerManager');
let mp!: typeof import('../src/game/network/useMultiplayer');
let store!: typeof import('../src/game/network/sessionStorage');

beforeAll(async () => {
  mod = await import('../src/game/network/peerManager');
  mp = await import('../src/game/network/useMultiplayer');
  store = await import('../src/game/network/sessionStorage');
});

beforeEach(() => {
  registry.clear();
  localStorage.clear();
  window.location.hash = '';
  store.clearSession();
});

afterEach(() => {
  mod.peerManager.cleanup();
});

/* ------------------------------------------------------------------ */

/** Boot a real host through the real `useMultiplayer` + real `peerManager`. */
async function bootHost(code: string, capacity = 4) {
  const host = renderHook(() => mp.useMultiplayer());
  await act(async () => {
    await host.result.current.createRoom('Host', 0, capacity, 'normal', 'exact', code);
  });
  await act(async () => {
    await flush();
  });
  expect(host.result.current.isHost, 'host failed to come up').toBe(true);
  expect(
    registry.get(`snkladr-${code.toLowerCase()}`),
    'host peer was not registered with the broker',
  ).toBeDefined();
  return host;
}

async function guestJoins(code: string, name = 'Guest', colorId = 1) {
  const guest = new mod.PeerManager();
  const seen: Packet[] = [];
  guest.onPacket((p) => seen.push(p));
  const statuses: string[] = [];
  guest.onStatus((s, detail) => statuses.push(detail ? `${s}: ${detail}` : s));
  // A JOIN_REJECTED resolves this promise by rejecting it - that is correct
  // behaviour (the guest is told, rather than hanging), so capture it.
  let joinError: string | null = null;
  try {
    await guest.joinRoom(code, name, colorId);
  } catch (e) {
    joinError = e instanceof Error ? e.message : String(e);
  }
  return { guest, seen, statuses, joinError };
}

const describeSeen = (seen: Packet[]) => seen.map((p) => p.type).join(', ') || '(nothing)';

/**
 * One host + several guests in a single test.
 *
 * `peerManager` is a module-level singleton and `useMultiplayer` subscribes to
 * it in an effect, so tearing a host down and standing a new one up between
 * tests leaves later `renderHook` calls with a null `result.current`. Driving
 * the whole lifecycle inside one test avoids that entirely, and it is also
 * closer to what a real session does.
 */
it('a real guest can join a real host, at every room capacity', async () => {
  for (const capacity of [2, 3, 4] as const) {
    // Exactly 6 characters from the generator's alphabet - anything else is
    // correctly rejected as an invalid room code before a slot is allocated.
    const code = `CAP${capacity}X`.slice(0, 6).padEnd(6, 'Z');
    const host = await bootHost(code, capacity);

    // ---- guest 1 ----
    const g1 = await guestJoins(code, 'Alice', 1);
    const acc1 = g1.seen.find((p) => p.type === 'JOIN_ACCEPTED');
    expect(
      acc1,
      `cap=${capacity} guest1 saw [${describeSeen(g1.seen)}] statuses ${JSON.stringify(g1.statuses)}`,
    ).toBeDefined();

    if (acc1 && acc1.type === 'JOIN_ACCEPTED') {
      expect(acc1.slotIndex).toBe(1);
      // The guest runs `validatePacket` on everything the host sends, so a
      // packet the host considers valid must also survive the guest's checks.
      expect(acc1.v).toBe(PROTOCOL_VERSION);
      expect(acc1.reconnectToken.length).toBeGreaterThanOrEqual(16);
      const reval = validatePacket(acc1);
      expect(reval.valid, `invalid JOIN_ACCEPTED: ${reval.error}`).toBe(true);
    }
    expect(
      g1.seen.some((p) => p.type === 'JOIN_REJECTED'),
      `cap=${capacity} guest1 was rejected`,
    ).toBe(false);

    const lobby = g1.seen.find((p) => p.type === 'LOBBY_UPDATE');
    expect(lobby, `cap=${capacity} no LOBBY_UPDATE`).toBeDefined();
    if (lobby && lobby.type === 'LOBBY_UPDATE') {
      expect(lobby.players).toHaveLength(2);
      const reval = validatePacket(lobby);
      expect(reval.valid, `invalid LOBBY_UPDATE: ${reval.error}`).toBe(true);
    }

    // The host's own roster must have taken the guest on.
    await act(async () => {
      await flush();
    });
    expect(
      host.result.current.players.length,
      `cap=${capacity} host roster`,
    ).toBe(2);
    // And the engine accepted it (validateRoster would reject a bad colorId).
    expect(host.result.current.players[1]?.name).toBe('Alice');

    // ---- guest 2, on a second guest PeerManager (fresh transport) ----
    if (capacity > 2) {
      const g2 = await guestJoins(code, 'Bob', 2);
      const acc2 = g2.seen.find((p) => p.type === 'JOIN_ACCEPTED');
      expect(
        acc2 && acc2.type === 'JOIN_ACCEPTED' ? acc2.slotIndex : -1,
        `cap=${capacity} guest2 saw [${describeSeen(g2.seen)}]`,
      ).toBe(2);
      g2.guest.cleanup();
      await act(async () => {
        await flush();
      });
    }

    // A room at capacity must turn the next guest away with a clear reason,
    // never a silent hang.
    if (capacity === 2) {
      const g2 = await guestJoins(code, 'Bob', 2);
      const acc2 = g2.seen.find((p) => p.type === 'JOIN_ACCEPTED');
      const rej2 = g2.seen.find((p) => p.type === 'JOIN_REJECTED');
      expect(
        !acc2 && !!rej2,
        `cap=2 second guest saw [${describeSeen(g2.seen)}] err=${g2.joinError} - expected an explicit rejection`,
      ).toBe(true);
      expect(g2.joinError ?? '').toMatch(/full/i);
      g2.guest.cleanup();
    }

    g1.guest.cleanup();
    await act(async () => {
      await flush();
    });
    mod.peerManager.cleanup();
    // `peerManager` is a module singleton and every mounted `useMultiplayer`
    // subscribes to it, so the previous host must be unmounted before the next
    // one boots - otherwise both packet handlers see each JOIN_REQUEST and the
    // stale one rejects it with the *previous* room code. The real app only
    // ever has one instance.
    host.unmount();
    await act(async () => {
      await flush();
    });
  }
}, 20000);

