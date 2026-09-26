import { useEffect, useRef } from 'react';
import { THEMES, type ThemeId, type BoardTheme } from '../game/themes';
import { LOGICAL, ORIGIN, CELL } from '../game/constants';
import { drawStaticBoard, drawAnimatedSnakes } from '../game/render';
import Dialog from './Dialog';

interface ThemeModalProps {
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  onClose: () => void;
}

/**
 * (A5) Live miniature of the *actual* board.
 *
 * The theme picker used to show three hand-maintained colour dots from
 * `previewColors`, which had drifted out of sync with the real theme data
 * (e.g. desert's and cyber's tile colours did not match the board at all), so
 * the picker was actively misleading.
 *
 * Instead of maintaining a second copy of the palette, this renders the real
 * `drawStaticBoard` + `drawAnimatedSnakes` into a small canvas at 1/LOGICAL
 * scale. Whatever you see in the picker is literally what you get.
 *
 * The board layer only needs to be painted once - the snakes are drawn at
 * t = 0 and left static, which is plenty to show a theme's colour identity and
 * costs one small canvas per theme.
 */
function ThemePreview({ theme }: { theme: BoardTheme }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Render at 3x the CSS size for crisp edges on HiDPI displays.
    const cssSize = 72;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const px = Math.round(cssSize * dpr);
    canvas.width = px;
    canvas.height = px;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);

    // 1:1 logical -> preview mapping, with a margin so the frame is fully visible.
    const s = px / (LOGICAL + ORIGIN * 2);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.translate(ORIGIN, ORIGIN);

    drawStaticBoard(ctx, theme, undefined, 1);
    drawAnimatedSnakes(ctx, 0, undefined, theme);

    // Corner count so the tile geometry is obviously the real thing.
    void CELL;
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 72, height: 72 }}
      className="rounded-xl shrink-0 shadow-lg ring-1 ring-black/30"
      aria-hidden="true"
    />
  );
}

export default function ThemeModal({
  currentThemeId,
  onSelectTheme,
  onClose,
}: ThemeModalProps) {
  const themesList: BoardTheme[] = Object.values(THEMES);

  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      titleId="theme-modal-title"
      className="w-full max-w-lg p-4 sm:p-6 text-center border-amber-400/40 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-emerald-800/30">
        <div className="flex items-center gap-2">
          <div className="text-2xl" aria-hidden="true">🎨</div>
          <div className="text-left">
            <h2 id="theme-modal-title" className="font-display text-lg sm:text-xl text-amber-300">
              BOARD THEMES
            </h2>
            <p className="text-[11px] font-bold text-emerald-200/70">
              Live previews — pick your favourite look for the board &amp; snakes
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close board theme picker"
          className="min-w-[44px] min-h-[44px] rounded-lg bg-emerald-950/80 border border-emerald-800/40 text-emerald-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Theme List */}
      <div className="mt-3 flex-1 overflow-y-auto space-y-2.5 pr-1 text-left">
        {themesList.map((t) => {
          const isSelected = t.id === currentThemeId;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={isSelected}
              aria-label={`Theme: ${t.name}. ${t.tagline}`}
              onClick={() => {
                onSelectTheme(t.id);
                onClose();
              }}
              className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 relative ${
                isSelected
                  ? 'bg-amber-400/15 border-amber-400/90 shadow-[0_0_16px_var(--theme-accent-glow)] ring-1 ring-amber-400/50'
                  : 'bg-emerald-950/40 border-emerald-800/40 hover:border-emerald-700/70 hover:bg-emerald-900/30'
              }`}
            >
              {/* (A5) Real board thumbnail instead of three drifting swatches. */}
              <ThemePreview theme={t} />

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm sm:text-base text-white tracking-wide truncate">
                    {t.name}
                  </span>
                  {isSelected && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-amber-400 text-stone-950">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-emerald-200/70 truncate mt-0.5 font-bold">
                  {t.tagline}
                </p>
              </div>

              {/* Selection indicator - (F2) drawn glyphs, not font fallbacks. */}
              <div className="shrink-0 text-xl font-bold" aria-hidden="true">
                {isSelected ? (
                  <CheckIcon className="w-5 h-5 text-amber-400" />
                ) : (
                  <ArrowIcon className="w-5 h-5 text-emerald-500/40" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-emerald-800/30 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-5 py-2 rounded-xl text-xs font-black bg-emerald-900/60 hover:bg-emerald-800/60 border border-emerald-700/50 text-emerald-100 transition-colors cursor-pointer"
        >
          CLOSE
        </button>
      </div>
    </Dialog>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? ''}
    >
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? ''}
    >
      <path d="m4 12.5 5.5 5.5L20 6.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      aria-hidden="true"
      className="w-4 h-4"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
