/**
 * @vitest-environment jsdom
 *
 * Mobile 60 FPS & animation performance regression suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Die from '../src/components/Die';
import { sfx } from '../src/game/audio';
import {
  drawAnimatedSnakes,
  drawActivePlayerEdge,
  drawCornerPulse,
  drawFrameSweep,
  drawTargetHighlight,
  drawTurnRing,
  drawLadderClimbGlow,
} from '../src/game/render';
import { THEMES } from '../src/game/themes';
import App from '../src/App';

describe('Tier 1: Die 3D compositing & DOM optimization', () => {
  it('renders only actual pip elements (21 total across 6 faces) with zero empty placeholder spans', () => {
    const { container } = render(
      <Die value={1} rolling={false} onRoll={() => {}} canRoll={true} />,
    );
    const faces = container.querySelectorAll('.die-face');
    expect(faces).toHaveLength(6);

    const allSpans = container.querySelectorAll('.die-face span');
    const pipSpans = container.querySelectorAll('.die-face .die-pip');
    // 1 + 2 + 3 + 4 + 5 + 6 = 21 pips total, no empty spans
    expect(pipSpans).toHaveLength(21);
    expect(allSpans).toHaveLength(21);
  });

  it('does not apply a dynamic CSS filter on the 3D .die-stage button when canRoll toggles', () => {
    const { container, rerender } = render(
      <Die value={2} rolling={false} onRoll={() => {}} canRoll={true} />,
    );
    const stage = container.querySelector('.die-stage') as HTMLElement;
    expect(stage.style.filter).toBe('');

    rerender(<Die value={2} rolling={true} onRoll={() => {}} canRoll={false} />);
    expect(stage.style.filter).toBe('');
  });

  it('commits the 3D spin transform synchronously on the exact frame rolling becomes true', () => {
    const { container, rerender } = render(
      <Die value={0} rolling={false} onRoll={() => {}} canRoll={true} rollMs={950} />,
    );
    const cube = container.querySelector('.die-cube') as HTMLElement;
    expect(cube.style.transform).toBe('rotateX(0deg) rotateY(0deg)');

    // Transition to rolling value=4 (FACE_ROT[4] = [0, 90])
    rerender(<Die value={4} rolling={true} onRoll={() => {}} canRoll={false} rollMs={950} />);
    expect(cube.style.transform).toBe('rotateX(720deg) rotateY(1170deg)');
    expect(cube.style.transition).toContain('transform 950ms');

    // Landing preserves the exact cumulative rotation
    rerender(<Die value={4} rolling={false} onRoll={() => {}} canRoll={true} rollMs={950} />);
    expect(cube.style.transform).toBe('rotateX(720deg) rotateY(1170deg)');
  });
});

describe('Tier 1: Audio white-noise buffer caching on dice roll', () => {
  it('reuses a single cached AudioBuffer across all bursts in sfx.roll()', () => {
    const createBufferSpy = vi.fn((_channels: number, length: number, sampleRate: number) => ({
      getChannelData: () => new Float32Array(length),
      length,
      sampleRate,
      duration: length / sampleRate,
      numberOfChannels: 1,
    }));

    class MockAudioContext {
      state = 'running';
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      createBuffer = createBufferSpy;
      createBufferSource = () => ({
        buffer: null,
        loop: false,
        connect: () => ({ connect: () => ({ connect: () => {} }) }),
        start: vi.fn(),
        stop: vi.fn(),
      });
      createBiquadFilter = () => ({
        type: 'bandpass',
        frequency: { setValueAtTime: vi.fn() },
        Q: { setValueAtTime: vi.fn() },
        connect: () => ({ connect: () => {} }),
      });
      createGain = () => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: () => {},
      });
      createOscillator = () => ({
        type: 'sine',
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: () => ({ connect: () => {} }),
        start: vi.fn(),
        stop: vi.fn(),
      });
    }

    const prevAC = window.AudioContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
    // Reset internal context so MockAudioContext is used
    (sfx as unknown as { ctx: null; noiseBuffer?: null }).ctx = null;
    (sfx as unknown as { noiseBuffer?: null }).noiseBuffer = null;

    try {
      sfx.roll();
      sfx.roll();
      // Should allocate the noise buffer only once instead of 6 times per roll (12 total)
      expect(createBufferSpy).toHaveBeenCalledTimes(1);
    } finally {
      (window as unknown as { AudioContext: unknown }).AudioContext = prevAC;
      (sfx as unknown as { ctx: null; noiseBuffer?: null }).ctx = null;
      (sfx as unknown as { noiseBuffer?: null }).noiseBuffer = null;
    }
  });
});

describe('Tier 2: Canvas snake batching & zero per-frame shadowBlur', () => {
  function createTrackingCtx() {
    const gradientStub = { addColorStop: () => {} };
    let strokeCount = 0;
    let maxShadowBlur = 0;
    let shadowBlurState = 0;

    const ctx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      arcTo: () => {},
      ellipse: () => {},
      rect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      clip: () => {},
      fill: () => {},
      stroke: () => {
        strokeCount++;
      },
      fillText: () => {},
      setLineDash: () => {},
      createRadialGradient: () => gradientStub,
      createLinearGradient: () => gradientStub,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineJoin: 'round',
      lineCap: 'round',
      lineDashOffset: 0,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: '',
      get shadowBlur() {
        return shadowBlurState;
      },
      set shadowBlur(v: number) {
        shadowBlurState = v;
        if (v > maxShadowBlur) maxShadowBlur = v;
      },
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      font: '',
      textAlign: 'center',
      textBaseline: 'middle',
    };

    return {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      getStrokeCount: () => strokeCount,
      getMaxShadowBlur: () => maxShadowBlur,
    };
  }

  it('batches drawAnimatedSnakes strokes (< 550 strokes for all 10 snakes) and avoids shadowBlur', () => {
    for (const theme of Object.values(THEMES)) {
      const tracker = createTrackingCtx();
      drawAnimatedSnakes(tracker.ctx, 1.5, 16, theme, 1);
      expect(tracker.getStrokeCount(), `stroke count for ${theme.id}`).toBeLessThan(550);
      expect(tracker.getMaxShadowBlur(), `shadowBlur for ${theme.id}`).toBe(0);
    }
  });

  it('draws per-frame board overlays with zero shadowBlur', () => {
    const tracker = createTrackingCtx();
    drawActivePlayerEdge(tracker.ctx, '#06b6d4', 1.2);
    drawCornerPulse(tracker.ctx, 1.2, '#06b6d4', true);
    drawFrameSweep(tracker.ctx, 1.2, THEMES.jungle);
    drawTargetHighlight(tracker.ctx, 24, '#06b6d4', 1.2);
    drawTurnRing(tracker.ctx, 200, 200, 22, 1.2, '#06b6d4');
    drawLadderClimbGlow(tracker.ctx, 4, 14, 0.5, 1.2, THEMES.jungle);

    expect(tracker.getMaxShadowBlur()).toBe(0);
  });
});

describe('Tier 3: StartScreen idle pointer parallax does not run perpetual rAF loop', () => {
  it('does not schedule continuous requestAnimationFrame ticks when pointer has not moved', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    try {
      render(<App />);
      // Mounting StartScreen without pointer movement should not start a 60fps rAF loop
      expect(rafSpy).not.toHaveBeenCalled();
    } finally {
      rafSpy.mockRestore();
    }
  });
});
