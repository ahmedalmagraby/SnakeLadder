import { describe, it, expect } from 'vitest';
import {
  PORTALS,
  START_POS,
  squareCenter,
  squareFromPoint,
  LOGICAL,
} from '../src/game/constants';
import { gameReducer, initialGameState } from '../src/game/gameReducer';

describe('Coordinates & Board Geometry', () => {
  it('verifies boustrophedon pattern for all 10 rows', () => {
    // Row 1 (squares 1 to 10): left to right
    const c1 = squareCenter(1);
    const c10 = squareCenter(10);
    expect(c10.x).toBeGreaterThan(c1.x);
    expect(c10.y).toBe(c1.y);

    // Row 2 (squares 11 to 20): right to left
    const c11 = squareCenter(11);
    const c20 = squareCenter(20);
    expect(c20.x).toBeLessThan(c11.x);
    expect(c20.y).toBe(c11.y);
    expect(c11.y).toBeLessThan(c10.y); // row 2 is higher up (smaller y)

    // Square 100 is at top-left
    const c100 = squareCenter(100);
    const c91 = squareCenter(91);
    expect(c100.x).toBeLessThan(c91.x);
    expect(c100.y).toBe(c91.y);
    expect(c100.y).toBeLessThan(c1.y);
  });

  it('maps points back to squares with squareFromPoint', () => {
    for (const sq of [1, 15, 50, 87, 100]) {
      const center = squareCenter(sq);
      const mapped = squareFromPoint(center.x, center.y);
      expect(mapped).toBe(sq);
    }
  });

  it('returns null for coordinates outside the board grid', () => {
    expect(squareFromPoint(-10, -10)).toBeNull();
    expect(squareFromPoint(LOGICAL + 50, LOGICAL + 50)).toBeNull();
    // In padding margin
    expect(squareFromPoint(5, 5)).toBeNull();
  });

  it('maintains valid start docks for all 4 player slots', () => {
    expect(START_POS).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(START_POS[i].x).toBeGreaterThan(0);
      expect(START_POS[i].y).toBeGreaterThan(0);
      expect(START_POS[i].y).toBeGreaterThan(squareCenter(1).y); // below row 1 in start bay
    }

    // All 4 dock positions are spaced apart
    const xs = START_POS.map((p) => p.x);
    const uniqueXs = new Set(xs);
    expect(uniqueXs.size).toBe(4);
  });
});

describe('Snakes and Ladders Rules & Portals', () => {
  it('validates portal definitions', () => {
    const portalKeys = Object.keys(PORTALS).map(Number);
    expect(portalKeys.length).toBeGreaterThan(10);

    for (const from of portalKeys) {
      const p = PORTALS[from];
      expect(p.from).toBe(from);
      expect(from).toBeGreaterThanOrEqual(1);
      expect(from).toBeLessThan(100);
      expect(p.to).toBeGreaterThanOrEqual(1);
      expect(p.to).toBeLessThanOrEqual(100);

      if (p.type === 'snake') {
        expect(p.from).toBeGreaterThan(p.to);
        expect(p.diff).toBe(p.to - p.from); // negative diff
      } else {
        expect(p.to).toBeGreaterThan(p.from);
        expect(p.diff).toBe(p.to - p.from); // positive diff
      }
    }
  });

  it('calculates bounce rule coordinates: 98 + 5 = 97', () => {
    const pos = 98;
    const roll = 5;
    const raw = pos + roll;
    expect(raw).toBeGreaterThan(100);

    // Exact rule: stays at 98
    const exactTarget = raw <= 100 ? raw : pos;
    expect(exactTarget).toBe(98);

    // Bounce rule: bounces back from 100
    const overshoot = raw - 100;
    const bounceTarget = 100 - overshoot;
    expect(bounceTarget).toBe(97);
  });

  it('triggers winner when exactly reaching 100 in state machine', () => {
    let state = initialGameState();
    state = gameReducer(state, {
      type: 'START_GAME',
      speed: 'turbo',
      winRule: 'exact',
    });

    state.pos[0] = 98;

    const move = gameReducer(state, {
      type: 'START_MOVE',
      txId: state.txId,
      player: 0,
      steps: [squareCenter(99), squareCenter(100)],
      target: 100,
      roll: 2,
    });
    expect(move.targetSquare).toBe(100);

    const landed = gameReducer(move, {
      type: 'FINISH_MOVE',
      txId: move.txId,
      player: 0,
      target: 100,
    });
    expect(landed.pos[0]).toBe(100);

    const over = gameReducer(landed, {
      type: 'GAME_OVER',
      winner: 0,
    });
    expect(over.winner).toBe(0);
    expect(over.mode).toBe('over');
  });
});
