import { THEMES, type ThemeId, type BoardTheme } from '../game/themes';
import Dialog from './Dialog';

interface ThemeModalProps {
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  onClose: () => void;
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
          <span className="text-2xl" aria-hidden="true">🎨</span>
          <div className="text-left">
            <h2 id="theme-modal-title" className="font-display text-lg sm:text-xl text-amber-300">
              BOARD THEMES
            </h2>
            <p className="text-[11px] font-bold text-emerald-200/70">
              Choose your favorite visual theme for the board &amp; snakes
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close board theme picker"
          className="min-w-[44px] min-h-[44px] rounded-lg bg-emerald-950/80 border border-emerald-800/40 text-emerald-300 hover:text-white flex items-center justify-center text-sm font-black cursor-pointer transition-colors"
        >
          ✕
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
                  ? 'bg-amber-400/15 border-amber-400/90 shadow-[0_0_16px_rgba(251,191,36,0.25)] ring-1 ring-amber-400/50'
                  : 'bg-emerald-950/40 border-emerald-800/40 hover:border-emerald-700/70 hover:bg-emerald-900/30'
              }`}
            >
              {/* Icon badge */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 shadow-inner border"
                style={{
                  backgroundColor: t.previewColors.tileDark,
                  borderColor: t.previewColors.accent,
                }}
                aria-hidden="true"
              >
                {t.icon}
              </div>

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

                {/* Swatch chips */}
                <div className="flex items-center gap-1.5 mt-2" aria-hidden="true">
                  <span className="text-[9px] font-black tracking-widest text-emerald-300/50 uppercase">
                    PALETTE:
                  </span>
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/40"
                    style={{ backgroundColor: t.previewColors.frame }}
                    title="Frame"
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/40"
                    style={{ backgroundColor: t.previewColors.tileDark }}
                    title="Dark Tile"
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/40"
                    style={{ backgroundColor: t.previewColors.tileLight }}
                    title="Light Tile"
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/40"
                    style={{ backgroundColor: t.previewColors.accent }}
                    title="Accent"
                  />
                </div>
              </div>

              {/* Selection indicator */}
              <div className="shrink-0 text-xl font-bold" aria-hidden="true">
                {isSelected ? (
                  <span className="text-amber-400">✓</span>
                ) : (
                  <span className="text-emerald-500/40">➔</span>
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
