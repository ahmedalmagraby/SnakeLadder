import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import Die from './components/Die';
import OnlineLobby from './components/OnlineLobby';
import OnlineHudBar from './components/OnlineHudBar';
import ThemeModal from './components/ThemeModal';
import { THEMES, themeCssVars, type ThemeId, type BoardTheme } from './game/themes';
import Dialog from './components/Dialog';
import AriaLiveAnnouncer from './components/AriaLiveAnnouncer';
import AccessibleBoardTable from './components/AccessibleBoardTable';
import { useMultiplayer } from './game/network/useMultiplayer';
import type { SavedSession } from './game/network/sessionStorage';
import { hasResumableMatch } from './game/network/sessionStorage';
import {
  PLAYER_COLORS,
  PORTALS,
  SPEEDS,
  type GameSpeed,
  type WinRule,
} from './game/constants';
import { useGame, type PlayerConfig, type Toast } from './game/useGame';

/* ---------------- icons ---------------- */

const ic = 'shrink-0';

function SnakeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`${ic} ${className ?? ''}`}>
      <path d="M4 20c0-5.5 8.5-4.5 10-9 1.1-3.3-1.6-5.6 1.5-6.5" />
      <circle cx="18.6" cy="4.6" r="2.3" fill="currentColor" stroke="none" />
      <path d="M20.4 2.4 22 1.4M20.4 2.4l1.6 1" />
    </svg>
  );
}

function LadderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`${ic} ${className ?? ''}`}>
      <path d="M7 2v20M17 2v20M7 7h10M7 12h10M7 17h10" />
    </svg>
  );
}

function DiceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`${ic} ${className ?? ''}`}>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrophyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${ic} ${className ?? ''}`}>
      <path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4a1 1 0 0 0-1 1c0 2.5 1.6 4.1 4 4.5M17 6h3a1 1 0 0 1 1 1c0 2.5-1.6 4.1-4 4.5" />
    </svg>
  );
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`${ic} ${className ?? ''}`}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="10" y="10" width="4" height="4" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  );
}

function PlayersIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`${ic} ${className ?? ''}`}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5" />
      <circle cx="16.8" cy="9" r="2.6" />
      <path d="M15.6 14.6c2.6.3 4.3 2 4.8 4.4" />
    </svg>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${ic} w-4.5 h-4.5`}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
      {on ? <path d="M15.5 9.5a4 4 0 0 1 0 5M18 7a8 8 0 0 1 0 10" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </svg>
  );
}

function RestartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`${ic} ${className ?? ''}`}>
      <path d="M20 11a8 8 0 1 0-2.5 6.5" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`${ic} ${className ?? ''}`}>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${ic} ${className ?? ''}`}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function PaletteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${ic} ${className ?? ''}`}>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2Z" />
    </svg>
  );
}

/**
 * (F2) Drawn replacement for the bare "➔" character.
 *
 * "➔" (U+2794) is not present in the bundled `latin` subset, so it fell back
 * to whatever symbol font the OS happened to pick - a different arrow on
 * Windows, macOS and Android. A stroke path is identical everywhere.
 */
function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`${ic} ${className ?? ''}`}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

/** (G1) Leader crown shown on whoever is currently furthest up the board. */
function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`${ic} ${className ?? ''}`}>
      <path d="M3 7.5 6.6 12 12 4.5 17.4 12 21 7.5 19.6 18H4.4L3 7.5Z" />
    </svg>
  );
}

/** (G3) Small clock glyph for log timestamps. */
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`${ic} ${className ?? ''}`}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** (G1) Draws a thin 25/50/75 tick track under a player's progress bar so the
 *  bar can be read as "how far to 100" rather than just "some amount". */
function ProgressTicks() {
  return (
    <div className="pointer-events-none absolute inset-0 flex justify-between px-[25%] items-center" aria-hidden="true">
      <span className="w-px h-1.5 bg-emerald-100/25" />
      <span className="w-px h-1.5 bg-emerald-100/25" />
      <span className="w-px h-1.5 bg-emerald-100/25" />
    </div>
  );
}

/* ---------------- shared bits ---------------- */

const btnGhost = 'btn-theme-ghost font-display tracking-wide px-6 py-3';

function BgGlow({ bgGlow, themeId = 'jungle' }: { bgGlow?: string; themeId?: ThemeId }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none transition-all duration-700 overflow-hidden"
      style={{
        background:
          bgGlow ||
          'radial-gradient(950px 620px at 10% -5%, rgba(16,185,129,0.16), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(251,191,36,0.14), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(7,60,44,0.5), transparent 75%)',
      }}
    >
      {/* Theme atmospheric ambient sparkles (D2) */}
      {themeId === 'jungle' && (
        <>
          <div className="absolute top-[12%] left-[8%] w-2 h-2 rounded-full bg-emerald-400/40 blur-[1px] floaty" />
          <div className="absolute top-[75%] left-[15%] w-2.5 h-2.5 rounded-full bg-yellow-300/35 blur-[1.5px] floaty" style={{ animationDelay: '-2s' }} />
          <div className="absolute top-[20%] right-[10%] w-1.5 h-1.5 rounded-full bg-emerald-300/40 blur-[1px] floaty" style={{ animationDelay: '-3.5s' }} />
          <div className="absolute top-[68%] right-[12%] w-2 h-2 rounded-full bg-amber-400/30 blur-[1px] floaty" style={{ animationDelay: '-1s' }} />
        </>
      )}
      {themeId === 'cyber' && (
        <>
          <div className="absolute top-[15%] left-[10%] w-2 h-2 rounded bg-cyan-400/40 blur-[1px] floaty" />
          <div className="absolute top-[80%] left-[8%] w-2.5 h-2.5 rounded bg-fuchsia-400/30 blur-[1px] floaty" style={{ animationDelay: '-2.5s' }} />
          <div className="absolute top-[25%] right-[8%] w-1.5 h-1.5 rounded bg-cyan-300/45 blur-[1px] floaty" style={{ animationDelay: '-4s' }} />
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-cyan-500/10 to-transparent pointer-events-none" />
        </>
      )}
      {themeId === 'desert' && (
        <>
          <div className="absolute top-[18%] left-[12%] w-2 h-2 rounded-full bg-amber-300/40 blur-[1.5px] floaty" />
          <div className="absolute top-[70%] left-[6%] w-1.5 h-1.5 rounded-full bg-yellow-400/30 blur-[1px] floaty" style={{ animationDelay: '-1.8s' }} />
          <div className="absolute top-[30%] right-[14%] w-2 h-2 rounded-full bg-amber-400/35 blur-[1.5px] floaty" style={{ animationDelay: '-3s' }} />
        </>
      )}
      {themeId === 'cosmic' && (
        <>
          <div className="absolute top-[10%] left-[14%] w-1.5 h-1.5 rounded-full bg-indigo-300/50 blur-[0.5px] floaty" />
          <div className="absolute top-[82%] left-[12%] w-2 h-2 rounded-full bg-purple-300/40 blur-[1px] floaty" style={{ animationDelay: '-2.2s' }} />
          <div className="absolute top-[18%] right-[12%] w-2 h-2 rounded-full bg-cyan-200/50 blur-[0.8px] floaty" style={{ animationDelay: '-4.2s' }} />
          <div className="absolute top-[65%] right-[8%] w-1.5 h-1.5 rounded-full bg-fuchsia-300/40 blur-[0.5px] floaty" style={{ animationDelay: '-1.2s' }} />
        </>
      )}
      {themeId === 'candy' && (
        <>
          <div className="absolute top-[14%] left-[10%] w-2 h-2 rounded-full bg-pink-300/40 blur-[1px] floaty" />
          <div className="absolute top-[78%] left-[14%] w-2.5 h-2.5 rounded-full bg-amber-200/45 blur-[1px] floaty" style={{ animationDelay: '-1.5s' }} />
          <div className="absolute top-[22%] right-[10%] w-2 h-2 rounded-full bg-sky-300/40 blur-[1px] floaty" style={{ animationDelay: '-3.8s' }} />
        </>
      )}
    </div>
  );
}

const TOAST_COLORS: Record<Toast['kind'], string> = {
  gold: '#fbbf24',
  red: '#fb7185',
  cyan: '#67e8f9',
  pink: '#f9a8d4',
  lime: '#a3e635',
  info: '#a7f3d0',
};

function ToastView({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  const c = TOAST_COLORS[toast.kind];
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div key={toast.id} className="toast-pop text-center">
        <div
          className="font-display text-5xl sm:text-6xl"
          style={{ color: c, textShadow: `0 5px 0 rgba(0,0,0,0.5), 0 0 44px ${c}66` }}
        >
          {toast.title}
        </div>
        {toast.sub && <div className="font-display text-2xl text-amber-50 mt-1 drop-title">{toast.sub}</div>}
      </div>
    </div>
  );
}

function IconBtn({
  onClick,
  label,
  children,
  size = 'md',
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}) {
  const s = size === 'sm' ? 'w-7 h-7' : 'w-8.5 h-8.5';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`${s} relative before:absolute before:-inset-2 before:content-[''] rounded-lg border border-amber-400/20 bg-emerald-950/70 text-emerald-200/90 flex items-center justify-center hover:border-amber-400/60 hover:text-amber-300 transition-colors cursor-pointer shrink-0`}
    >
      {children}
    </button>
  );
}

function PlayerCard({
  player,
  pos,
  rolls,
  ladders,
  snakes,
  active,
  activeLabel,
  isLeader,
}: {
  player: PlayerConfig;
  pos: number;
  rolls: number;
  ladders: number;
  snakes: number;
  active: boolean;
  activeLabel?: string;
  isLeader: boolean;
}) {
  const col = PLAYER_COLORS[player.colorId % PLAYER_COLORS.length];
  return (
    <div
      className={`panel p-2.5 transition-all duration-300 ${
        active ? 'active-shimmer pulse-glow border-amber-400/80 shadow-[0_0_16px_var(--theme-accent-glow)]' : 'opacity-80'
      }`}
      style={active ? { borderColor: col.base } : undefined}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-4.5 h-4.5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black text-white"
          style={{
            background: `radial-gradient(circle at 35% 30%, ${col.light}, ${col.base} 55%, ${col.dark})`,
            boxShadow: `0 0 10px ${col.glow}`,
          }}
        >
          {player.slotIndex + 1}
        </span>
        <span className="font-display text-xs sm:text-sm tracking-wide truncate">{player.name}</span>
        {/* (G1) Crown the current leader so the standings are readable at a glance. */}
        {isLeader && pos > 0 && (
          <CrownIcon className="w-3 h-3 text-amber-300 shrink-0" />
        )}
        <span
          className={`ml-auto text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded border shrink-0 ${
            player.isCpu
              ? 'bg-purple-950/80 text-purple-300 border-purple-700/40'
              : 'bg-emerald-950/80 text-emerald-300/80 border-emerald-700/40'
          }`}
        >
          {player.isCpu ? 'CPU' : 'HUMAN'}
        </span>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-[9px] font-black tracking-widest text-emerald-300/60">SQUARE</span>
        <span className="font-display tnum text-2xl leading-none" style={{ color: active ? col.light : '#d1fae5' }}>
          {pos === 0 ? 'START' : pos}
        </span>
      </div>

      {/* Progress bar to 100 with miniature token pin (D3) */}
      <div className="relative mt-2 h-2 rounded-full bg-emerald-950/80">
        <div
          className="h-full rounded-full transition-all duration-500 relative"
          style={{
            width: `${Math.max(2, Math.min(100, pos))}%`,
            background: `linear-gradient(90deg, ${col.dark}, ${col.base})`,
          }}
        >
          {pos > 0 && (
            <span
              className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-white/80 shadow-md flex items-center justify-center text-[7.5px] font-black text-white pointer-events-none"
              style={{
                background: `radial-gradient(circle at 35% 30%, ${col.light}, ${col.base} 55%, ${col.dark})`,
                boxShadow: `0 0 6px ${col.glow}`,
              }}
            >
              {player.slotIndex + 1}
            </span>
          )}
        </div>
        <ProgressTicks />
      </div>

      <div className="mt-1.5 flex justify-between items-center text-[9px] font-bold text-emerald-300/60">
        <div className="flex items-center gap-1.5">
          <span className="tnum">{rolls} rolls</span>
          {ladders > 0 && <span className="text-amber-400">🪜 <span className="tnum">{ladders}</span></span>}
          {snakes > 0 && <span className="text-red-400">🐍 <span className="tnum">{snakes}</span></span>}
        </div>
        {active && activeLabel && (
          <span style={{ color: col.light }} className="font-black tracking-wider">
            {activeLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function MobilePlayerChip({
  player,
  pos,
  active,
  rolls,
  ladders,
  snakes,
  activeLabel,
  totalPlayers = 2,
}: {
  player: PlayerConfig;
  pos: number;
  active: boolean;
  rolls: number;
  ladders: number;
  snakes: number;
  activeLabel?: string;
  totalPlayers?: number;
}) {
  const col = PLAYER_COLORS[player.colorId % PLAYER_COLORS.length];
  const is4p = totalPlayers >= 4;

  return (
    <div
      className={`min-w-0 px-1.5 py-1 rounded-lg border transition-all duration-300 flex items-center gap-1 ${
        active
          ? 'active-shimmer bg-amber-400/20 border-amber-400 shadow-[0_0_10px_var(--theme-accent-glow)] ring-1 ring-amber-400/60'
          : 'bg-emerald-950/60 border-emerald-800/40 opacity-80'
      }`}
      style={active ? { borderColor: col.base } : undefined}
    >
      <span
        className="w-4.5 h-4.5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black text-white shadow-sm"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${col.light}, ${col.base} 55%, ${col.dark})`,
          boxShadow: active ? `0 0 6px ${col.glow}` : undefined,
        }}
      >
        {player.slotIndex + 1}
      </span>

      <div className="flex-1 min-w-0 leading-tight">
        <div className="flex items-center gap-0.5">
          <span className="font-display text-[10px] sm:text-[11px] text-white truncate">
            {player.name}
          </span>
          {player.isCpu && (
            <span className="text-[7px] font-black px-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/40 shrink-0">
              AI
            </span>
          )}
        </div>
        {!is4p ? (
          <div className="text-[8px] text-emerald-300/70 font-bold flex items-center gap-1 truncate">
            {active && activeLabel ? (
              <span className="font-black text-amber-300 uppercase tracking-tight truncate">
                {activeLabel}
              </span>
            ) : (
              <>
                {ladders > 0 && <span className="text-amber-400">🪜{ladders}</span>}
                {snakes > 0 && <span className="text-rose-400">🐍{snakes}</span>}
                {ladders === 0 && snakes === 0 && <span>{rolls}r</span>}
              </>
            )}
          </div>
        ) : (
          <div className="text-[7.5px] text-emerald-300/60 font-bold leading-none truncate">
            {ladders > 0 && <span className="text-amber-400">🪜{ladders} </span>}
            {snakes > 0 && <span className="text-rose-400">🐍{snakes} </span>}
            {ladders === 0 && snakes === 0 && <span>{rolls}r</span>}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right leading-none pl-0.5">
        <span
          className="font-display text-xs sm:text-sm font-black"
          style={{ color: active ? col.light : '#a7f3d0' }}
        >
          {pos === 0 ? '0' : pos}
        </span>
      </div>
    </div>
  );
}

/* ---------------- start screen ---------------- */

function StartScreen({
  onStart,
  onOpenOnline,
  savedSession,
  onResumeSession,
  currentThemeId,
  onSelectTheme,
  onOpenThemeModal,
  onConfigChange,
}: {
  onStart: (players: PlayerConfig[], speed: GameSpeed, winRule: WinRule) => void;
  onOpenOnline: () => void;
  savedSession?: SavedSession | null;
  onResumeSession?: () => void;
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  onOpenThemeModal: () => void;
  onConfigChange?: (config: { players: PlayerConfig[]; speed: GameSpeed; rule: WinRule }) => void;
}) {
  const [mode, setMode] = useState<'solo' | 'pass'>('solo');
  const [playerCount, setPlayerCount] = useState<number>(2);
  const [speed, setSpeed] = useState<GameSpeed>('normal');
  const [rule, setRule] = useState<WinRule>('exact');
  const [names, setNames] = useState<string[]>([
    'You',
    'CPU 1',
    'CPU 2',
    'CPU 3',
  ]);

  // (H1) Gentle pointer parallax for the floating background icons. The value
  // is damped toward the pointer each frame so the drift feels like inertia
  // rather than a cursor glued to the artwork.
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const parallaxTarget = useRef({ x: 0, y: 0 });
  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      parallaxTarget.current = {
        x: Math.max(-1, Math.min(1, (e.clientX / window.innerWidth - 0.5) * 2)),
        y: Math.max(-1, Math.min(1, (e.clientY / window.innerHeight - 0.5) * 2)),
      };
    };
    const onLeave = () => {
      parallaxTarget.current = { x: 0, y: 0 };
    };
    const tick = () => {
      setParallax((prev) => ({
        x: prev.x + (parallaxTarget.current.x - prev.x) * 0.06,
        y: prev.y + (parallaxTarget.current.y - prev.y) * 0.06,
      }));
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  const drift = (depth: number) => ({
    transform: `translate3d(${(-parallax.x * depth).toFixed(2)}px, ${(-parallax.y * depth).toFixed(2)}px, 0)`,
  });

  const handleNameChange = (idx: number, val: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const getPlayerList = useCallback(() => {
    const list: PlayerConfig[] = [];
    for (let i = 0; i < playerCount; i++) {
      const isCpu = mode === 'solo' ? i > 0 : false;
      const defaultName =
        mode === 'solo'
          ? i === 0
            ? 'You'
            : `CPU ${i}`
          : `Player ${i + 1}`;
      list.push({
        id: `player-${i}`,
        slotIndex: i,
        name: names[i]?.trim() || defaultName,
        isCpu,
        colorId: i,
      });
    }
    return list;
  }, [playerCount, mode, names]);

  // Keep parent in sync for menu Space/Enter shortcut
  useEffect(() => {
    onConfigChange?.({ players: getPlayerList(), speed, rule });
  }, [getPlayerList, speed, rule, onConfigChange]);

  const handleLaunch = () => {
    onStart(getPlayerList(), speed, rule);
  };

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto p-2.5 sm:p-6 flex flex-col items-center justify-start sm:justify-center">
      {/* (H1) Parallax wrapper divs carry the pointer-driven transform; the icons
          inside keep their own `floaty` animation (a CSS animation outranks an
          inline transform, so they have to be separate elements). */}
      <div className="pointer-events-none absolute left-[5%] top-[8%]" style={drift(14)}>
        <SnakeIcon className="floaty w-14 h-14 text-red-500/25" />
      </div>
      <div className="pointer-events-none absolute right-[6%] top-[14%]" style={drift(22)}>
        <LadderIcon className="floaty w-14 h-14 text-amber-400/25 [--fr:14deg]" />
      </div>
      <div className="pointer-events-none absolute left-[8%] bottom-[10%]" style={drift(10)}>
        <DiceIcon className="floaty w-12 h-12 text-emerald-400/25 [--fr:-10deg]" />
      </div>
      <div className="pointer-events-none absolute right-[8%] bottom-[8%]" style={drift(18)}>
        <SnakeIcon className="floaty w-12 h-12 text-lime-400/20 [--fr:160deg]" />
      </div>

      <div className="relative w-full max-w-xl panel p-4 sm:p-8 text-center border-amber-400/30 my-1 sm:my-auto shrink-0">
        <div className="flex items-center justify-center gap-3 mb-2">
          <SnakeIcon className="w-8 h-8 text-red-400" />
          <DiceIcon className="w-8 h-8 text-amber-300" />
          <LadderIcon className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="font-display leading-[0.95]">
          <span className="block text-5xl sm:text-6xl text-emerald-100 drop-title">SNAKE</span>
          <span className="block text-3.5xl sm:text-4.5xl text-amber-400 drop-title mt-0.5">&amp; LADDER</span>
        </h1>
        <p className="mt-2 text-emerald-200/80 font-bold tracking-wide text-xs sm:text-sm">
          Race to square 100 — climb golden ladders, dodge jungle snakes!
        </p>

        {/* Active Session Reconnect Banner */}
        {savedSession && hasResumableMatch(savedSession) && (
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-amber-500/25 via-emerald-900/60 to-amber-500/25 border border-amber-400/70 flex items-center justify-between text-left shadow-lg">
            <div>
              <div className="text-xs font-display text-amber-300 flex items-center gap-1.5">
                <span>🔄</span>
                <span>ACTIVE MATCH IN ROOM {savedSession.roomCode}</span>
              </div>
              <div className="text-[11px] text-emerald-100 font-bold">
                Playing as {savedSession.playerName} ({savedSession.isHost ? 'Host' : `Player ${savedSession.slotIndex + 1}`})
              </div>
            </div>
            <button
              type="button"
              onClick={onResumeSession}
              aria-label="Resume active online match"
              className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-amber-400 text-stone-900 hover:bg-amber-300 transition-all cursor-pointer shadow flex items-center gap-1 min-h-[44px]"
            >
              <span>RESUME</span>
              <ArrowIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* (H2) The panel used to be one long undifferentiated stack of controls.
            Grouping it into labelled sections makes the scan order obvious:
            how to play -> who is playing -> the rules -> the look. Every
            control keeps its original aria-label, so this is purely additive. */}
        <div className="mt-5 text-[10px] font-black tracking-[0.2em] text-emerald-300/50 uppercase flex items-center gap-2">
          <span className="h-px flex-1 bg-emerald-800/40" />
          How to play
          <span className="h-px flex-1 bg-emerald-800/40" />
        </div>

        {/* Mode Selector */}
        <div className="mt-2.5 grid grid-cols-2 gap-3" role="group" aria-label="Game Mode">
          <button
            type="button"
            aria-pressed={mode === 'solo'}
            aria-label="Solo vs CPU mode"
            onClick={() => {
              setMode('solo');
              setNames(['You', 'CPU 1', 'CPU 2', 'CPU 3']);
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer min-h-[48px] ${
              mode === 'solo'
                ? 'bg-amber-400/15 border-amber-400/80 shadow-[0_0_14px_var(--theme-glow)]'
                : 'bg-emerald-950/40 border-emerald-800/40 hover:border-emerald-700/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <CpuIcon className="w-5 h-5 text-cyan-300" />
              <div className="font-display text-base text-amber-300">SOLO VS CPU</div>
            </div>
            <div className="text-[11px] font-bold text-emerald-200/70 mt-0.5">Play against AI bots</div>
          </button>

          <button
            type="button"
            aria-pressed={mode === 'pass'}
            aria-label="Pass and play mode"
            onClick={() => {
              setMode('pass');
              setNames(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer min-h-[48px] ${
              mode === 'pass'
                ? 'bg-amber-400/15 border-amber-400/80 shadow-[0_0_14px_var(--theme-glow)]'
                : 'bg-emerald-950/40 border-emerald-800/40 hover:border-emerald-700/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <PlayersIcon className="w-5 h-5 text-pink-300" />
              <div className="font-display text-base text-amber-300">PASS &amp; PLAY</div>
            </div>
            <div className="text-[11px] font-bold text-emerald-200/70 mt-0.5">Friends on one screen</div>
          </button>
        </div>

        {/* Online Multiplayer Mode Button */}
        <button
          type="button"
          onClick={onOpenOnline}
          aria-label="Open online multiplayer lobby"
          className="mt-3 w-full p-3 rounded-xl border border-amber-400/60 bg-gradient-to-r from-amber-500/20 via-emerald-900/40 to-amber-500/20 hover:border-amber-400/90 hover:from-amber-500/30 hover:to-amber-500/30 text-left transition-all cursor-pointer shadow-[0_0_16px_var(--theme-glow-soft)] flex items-center justify-between min-h-[48px]"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden="true">🌐</span>
            <div>
              <div className="font-display text-base text-amber-300 flex items-center gap-2">
                <span>ONLINE MULTIPLAYER</span>
                <span className="text-[9px] font-black bg-amber-400 text-stone-950 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  CROSS-DEVICE
                </span>
              </div>
              <div className="text-[11px] font-bold text-emerald-200/80">
                Play against friends on phones, tablets or PCs over the Internet!
              </div>
            </div>
          </div>
          <ArrowIcon className="w-5 h-5 text-amber-300" />
        </button>

        {/* (H2) Section divider */}
        <div className="mt-4 text-[10px] font-black tracking-[0.2em] text-emerald-300/50 uppercase flex items-center gap-2">
          <span className="h-px flex-1 bg-emerald-800/40" />
          Players &amp; rules
          <span className="h-px flex-1 bg-emerald-800/40" />
        </div>

        {/* Player Count & Names */}
        <div className="mt-2.5 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30 text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-emerald-300/80 tracking-wider">PLAYERS:</span>
            <div className="flex gap-1.5" role="group" aria-label="Player count">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={playerCount === n}
                  aria-label={`${n} players`}
                  onClick={() => setPlayerCount(n)}
                  className={`w-8 h-8 rounded-lg text-xs font-display transition-all cursor-pointer flex items-center justify-center min-h-[36px] ${
                    playerCount === n
                      ? 'bg-amber-400 text-stone-900 font-black'
                      : 'bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800/60'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            {Array.from({ length: playerCount }, (_, idx) => {
              const col = PLAYER_COLORS[idx];
              const inputId = `player-name-${idx}`;
              const placeholderText = mode === 'solo' && idx > 0 ? `CPU ${idx}` : `Player ${idx + 1}`;
              return (
                <div key={idx} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-emerald-950/70 border border-emerald-800/40">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ background: col.base, boxShadow: `0 0 6px ${col.glow}` }}
                    aria-hidden="true"
                  />
                  <label htmlFor={inputId} className="sr-only">
                    {mode === 'solo' && idx > 0 ? `CPU ${idx} Name` : `Player ${idx + 1} Name`}
                  </label>
                  <input
                    id={inputId}
                    type="text"
                    maxLength={12}
                    value={names[idx] ?? ''}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    placeholder={placeholderText}
                    aria-label={mode === 'solo' && idx > 0 ? `CPU ${idx} Name` : `Player ${idx + 1} Name`}
                    className="w-full bg-transparent text-xs font-bold text-emerald-100 outline-none placeholder:text-emerald-500 min-h-[36px]"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Game Rules & Speed Settings
            (H5) The pills themselves are unchanged; what changed is the
            container - a recessed "track" with a subtle inner shadow, so the
            group reads as one control rather than a row of loose buttons. */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-left text-xs">
          <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]">
            <span className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1.5">SPEED</span>
            <div className="flex gap-1 p-0.5 rounded-lg bg-emerald-950/60" role="group" aria-label="Game Speed">
              {(['normal', 'fast', 'turbo'] as GameSpeed[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={speed === s}
                  aria-label={`${s} speed`}
                  onClick={() => setSpeed(s)}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer min-h-[36px] flex items-center justify-center ${
                    speed === s
                      ? 'bg-amber-400 text-stone-900 shadow-[0_2px_6px_var(--theme-btn-glow)]'
                      : 'text-emerald-300/80 hover:bg-emerald-900/60'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30 shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]">
            <span className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1.5">WIN RULE</span>
            <div className="flex gap-1 p-0.5 rounded-lg bg-emerald-950/60" role="group" aria-label="Win Rule">
              {(['exact', 'bounce'] as WinRule[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={rule === r}
                  aria-label={r === 'exact' ? 'Exact 100 win rule' : 'Bounce back win rule'}
                  onClick={() => setRule(r)}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all cursor-pointer min-h-[36px] flex items-center justify-center ${
                    rule === r
                      ? 'bg-amber-400 text-stone-900 shadow-[0_2px_6px_var(--theme-btn-glow)]'
                      : 'text-emerald-300/80 hover:bg-emerald-900/60'
                  }`}
                >
                  {r === 'exact' ? 'Exact 100' : 'Bounce Back'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Board Theme Selector Strip */}
        <div className="mt-3.5 p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/30 text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <PaletteIcon className="w-4 h-4 text-amber-300" />
              <span className="text-xs font-black text-emerald-300/80 tracking-wider">BOARD THEME:</span>
            </div>
            <button
              type="button"
              onClick={onOpenThemeModal}
              aria-label="View all 5 board themes"
              className="text-[11px] font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer p-1"
            >
              View All (5)
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Board themes">
            {(Object.values(THEMES) as BoardTheme[]).map((t) => {
              const isSelected = t.id === currentThemeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Theme: ${t.name}`}
                  onClick={() => onSelectTheme(t.id)}
                  title={`${t.name}: ${t.tagline}`}
                  className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer min-h-[44px] ${
                    isSelected
                      ? 'bg-amber-400/20 border-amber-400 shadow-[0_0_12px_var(--theme-glow-strong)] ring-1 ring-amber-400/70 scale-[1.02]'
                      : 'bg-emerald-950/60 border-emerald-800/40 hover:border-emerald-700/70 hover:bg-emerald-900/30'
                  }`}
                >
                  <span className="text-lg sm:text-xl leading-none" aria-hidden="true">{t.icon}</span>
                  <span className="text-[10px] font-bold text-center leading-tight truncate w-full text-emerald-100">
                    {t.name.split(' ')[0]}
                  </span>
                  <div className="flex gap-0.5 mt-0.5" aria-hidden="true">
                    <span
                      className="w-2 h-2 rounded-full border border-black/30"
                      style={{ backgroundColor: t.previewColors.accent }}
                    />
                    <span
                      className="w-2 h-2 rounded-full border border-black/30"
                      style={{ backgroundColor: t.previewColors.tileDark }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Start Game Button */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleLaunch}
            aria-label="Start match with configured settings"
            className="btn-theme w-full py-3.5 text-base sm:text-lg min-h-[48px] cursor-pointer"
          >
            START MATCH
          </button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[10px] font-black tracking-wider text-emerald-200/70">
          <span className="px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-700/40">ROLL 6 = EXTRA TURN</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-700/40">LADDERS CLIMB ▲</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-700/40">SNAKES DROP ▼</span>
        </div>
        <p className="mt-3 text-[11px] text-emerald-300/50 font-bold">
          PC — SPACE / ENTER to roll &middot; M to mute &middot; S for speed &middot; F fullscreen &middot; R restart &middot; Esc menu
        </p>
      </div>
    </div>
  );
}

/* ---------------- win overlay ---------------- */

function WinOverlay({
  winner,
  players,
  positions,
  rolls,
  ladders,
  snakes,
  sixes,
  isOnline,
  isHost,
  theme,
  onAgain,
  onMenu,
}: {
  winner: PlayerConfig;
  players: PlayerConfig[];
  positions: number[];
  rolls: number[];
  ladders: number[];
  snakes: number[];
  sixes: number[];
  isOnline: boolean;
  isHost: boolean;
  theme: BoardTheme;
  onAgain: () => void;
  onMenu: () => void;
}) {
  const col = PLAYER_COLORS[winner.colorId % PLAYER_COLORS.length];
  const winnerIndex = players.findIndex((p) => p.slotIndex === winner.slotIndex);
  const safeWinnerIndex = winnerIndex >= 0 ? winnerIndex : 0;
  const winnerRolls = rolls[safeWinnerIndex] ?? 0;
  const winnerLadders = ladders[safeWinnerIndex] ?? 0;
  const winnerSnakes = snakes[safeWinnerIndex] ?? 0;

  /* (J6) Real standings. The summary used to list players in roster order with
     no square numbers at all, so "who actually got close" was unreadable. Now
     it is sorted by final square (winner first) with a rank, the square itself
     and a 0-100 bar.
     A *copy* is sorted: roster order is what the rest of the app - and the
     online checkpoint payloads - index by, and it must not be disturbed. Ties
     keep roster order via the `idx` tiebreak. */
  const standings = players
    .map((p, idx) => ({
      player: p,
      idx,
      pos: positions[idx] ?? 0,
      rolls: rolls[idx] ?? 0,
      sixes: sixes[idx] ?? 0,
    }))
    .sort((a, b) => b.pos - a.pos || a.idx - b.idx);

  const canRestart = !isOnline || isHost;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (canRestart) {
          e.preventDefault();
          onAgain();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [canRestart, onAgain]);

  return (
    <Dialog
      isOpen={true}
      onClose={onMenu}
      titleId="win-dialog-title"
      closeOnBackdropClick={false}
      className="w-full max-w-md p-6 sm:p-8 text-center"
      backdropClassName="z-40"
    >
      <div style={{ borderColor: col.base }}>
        {/* (H3) Staggered reveal: trophy, headline, stats and summary cascade in
            so the result lands as an event rather than appearing all at once. */}
        <TrophyIcon className="rise-in w-16 h-16 mx-auto text-amber-400 drop-shadow-[0_0_20px_var(--theme-accent-glow)]" />
        <h2
          id="win-dialog-title"
          className="font-display text-4xl drop-title mt-2 rise-in"
          style={{ color: col.light, textShadow: `0 0 20px ${col.glow}`, animationDelay: '90ms' }}
        >
          {winner.name.toUpperCase()} WINS!
        </h2>
        <p
          className="mt-1 font-bold text-emerald-100/90 text-sm rise-in"
          style={{ animationDelay: '170ms' }}
        >
          Conquered square 100 in {winnerRolls} {winnerRolls === 1 ? 'roll' : 'rolls'}!
        </p>

        {/* (A6) The theme's podium title/subtitle were defined for all five
            themes but never rendered anywhere. Surface them here. */}
        <p
          className="mt-1 text-[11px] font-black tracking-[0.18em] uppercase text-amber-300/80 rise-in"
          style={{ animationDelay: '210ms' }}
        >
          {theme.board.podiumTitle} · {theme.board.podiumSubtitle}
        </p>

        {/* (E1) Tiered Victory Podium */}
        <div className="mt-4 mb-2 flex items-end justify-center gap-2 sm:gap-3 px-2 rise-in" style={{ animationDelay: '260ms' }}>
          {/* 2nd Place (Left) */}
          {standings[1] && (() => {
            const p2 = standings[1];
            const col2 = PLAYER_COLORS[p2.player.colorId % PLAYER_COLORS.length];
            return (
              <div className="flex-1 max-w-[95px] flex flex-col items-center">
                <div className="relative mb-1 flex flex-col items-center">
                  <span className="text-xs mb-0.5" aria-hidden="true">🥈</span>
                  <div
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-xs text-white border-2 border-slate-300 shadow-md"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, ${col2.light}, ${col2.base} 55%, ${col2.dark})`,
                      boxShadow: `0 0 10px ${col2.glow}`,
                    }}
                  >
                    {p2.player.slotIndex + 1}
                  </div>
                  <span className="text-[10px] font-bold text-slate-200 mt-1 truncate max-w-full">
                    {p2.player.name}
                  </span>
                </div>
                <div className="w-full h-14 sm:h-16 rounded-t-xl bg-gradient-to-t from-slate-800/90 via-slate-700/80 to-slate-500/70 border-t-2 border-x border-slate-400/60 flex flex-col items-center justify-center shadow-lg">
                  <span className="font-display text-lg sm:text-xl text-slate-100 leading-none">2</span>
                  <span className="text-[8px] font-black text-slate-300/80 tnum">SQ {p2.pos}</span>
                </div>
              </div>
            );
          })()}

          {/* 1st Place (Center - Highest) */}
          {standings[0] && (() => {
            const p1 = standings[0];
            const col1 = PLAYER_COLORS[p1.player.colorId % PLAYER_COLORS.length];
            return (
              <div className="flex-1 max-w-[110px] flex flex-col items-center">
                <div className="relative mb-1 flex flex-col items-center">
                  <span className="text-sm mb-0.5 animate-bounce" aria-hidden="true">👑</span>
                  <div
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-sm text-white border-2 border-amber-300 shadow-lg"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, ${col1.light}, ${col1.base} 55%, ${col1.dark})`,
                      boxShadow: `0 0 16px ${col1.glow}`,
                    }}
                  >
                    {p1.player.slotIndex + 1}
                  </div>
                  <span className="text-[11px] font-black text-amber-300 mt-1 truncate max-w-full">
                    {p1.player.name}
                  </span>
                </div>
                <div className="w-full h-20 sm:h-24 rounded-t-xl bg-gradient-to-t from-amber-700/90 via-amber-500/80 to-yellow-300/90 border-t-2 border-x border-amber-200 flex flex-col items-center justify-center shadow-xl">
                  <span className="font-display text-2xl sm:text-3xl text-stone-950 font-black leading-none drop-shadow-sm">1</span>
                  <span className="text-[9px] font-black text-stone-900/90 uppercase tracking-wider">WINNER</span>
                </div>
              </div>
            );
          })()}

          {/* 3rd Place (Right) */}
          {standings[2] && (() => {
            const p3 = standings[2];
            const col3 = PLAYER_COLORS[p3.player.colorId % PLAYER_COLORS.length];
            return (
              <div className="flex-1 max-w-[95px] flex flex-col items-center">
                <div className="relative mb-1 flex flex-col items-center">
                  <span className="text-xs mb-0.5" aria-hidden="true">🥉</span>
                  <div
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-xs text-white border-2 border-amber-600 shadow-md"
                    style={{
                      background: `radial-gradient(circle at 35% 30%, ${col3.light}, ${col3.base} 55%, ${col3.dark})`,
                      boxShadow: `0 0 10px ${col3.glow}`,
                    }}
                  >
                    {p3.player.slotIndex + 1}
                  </div>
                  <span className="text-[10px] font-bold text-amber-200 mt-1 truncate max-w-full">
                    {p3.player.name}
                  </span>
                </div>
                <div className="w-full h-10 sm:h-12 rounded-t-xl bg-gradient-to-t from-amber-950/80 via-amber-800/70 to-amber-700/60 border-t-2 border-x border-amber-600/60 flex flex-col items-center justify-center shadow-md">
                  <span className="font-display text-base sm:text-lg text-amber-200 leading-none">3</span>
                  <span className="text-[8px] font-black text-amber-300/80 tnum">SQ {p3.pos}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Match breakdown stats */}
        <div
          className="mt-3 grid grid-cols-3 gap-2 p-3 rounded-xl bg-emerald-950/70 border border-amber-400/30 text-center rise-in"
          style={{ animationDelay: '320ms' }}
        >
          <div>
            <div className="text-[10px] font-black tracking-wider text-emerald-300/60">ROLLS</div>
            <div className="font-display tnum text-xl text-amber-300 mt-0.5">{winnerRolls}</div>
          </div>
          <div>
            <div className="text-[10px] font-black tracking-wider text-emerald-300/60">LADDERS</div>
            <div className="font-display tnum text-xl text-yellow-300 mt-0.5">🪜 {winnerLadders}</div>
          </div>
          <div>
            <div className="text-[10px] font-black tracking-wider text-emerald-300/60">SNAKES</div>
            <div className="font-display tnum text-xl text-rose-300 mt-0.5">🐍 {winnerSnakes}</div>
          </div>
        </div>

        {/* Full match score table (J6: ordered standings) */}
        <div
          className="mt-3 p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30 text-left rise-in"
          style={{ animationDelay: '350ms' }}
        >
          <div className="text-[10px] font-black text-emerald-300/60 uppercase mb-1.5">
            Final Standings
          </div>
          <div className="space-y-1.5 text-xs font-bold">
            {standings.map((row, rank) => {
              const pal = PLAYER_COLORS[row.player.colorId % PLAYER_COLORS.length];
              const isWinner = row.player.slotIndex === winner.slotIndex;
              return (
                <div key={row.player.id}>
                  <div className="flex items-center gap-2 text-emerald-100/90">
                    <span
                      className="w-4 shrink-0 text-center text-[10px] font-black tnum"
                      style={{ color: pal.base }}
                      aria-hidden="true"
                    >
                      {rank + 1}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: pal.base }}
                      aria-hidden="true"
                    />
                    <span className="truncate max-w-[110px]">{row.player.name}</span>
                    {isWinner && (
                      <span className="text-[10px] text-amber-400 shrink-0">👑 WINNER</span>
                    )}
                    <span className="ml-auto flex items-center gap-2.5 text-[11px] text-emerald-300/70 shrink-0">
                      <span className="tnum font-black text-emerald-100">
                        SQ {row.pos}
                      </span>
                      <span className="tnum">{row.rolls} rolls</span>
                      <span className="tnum">{row.sixes} sixes</span>
                    </span>
                  </div>
                  {/* Distance-to-100 bar, same visual language as the sidebar
                      player cards so the two read as one system. */}
                  <div className="relative mt-1 h-1 rounded-full bg-emerald-950/80 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.pos}%`,
                        background: `linear-gradient(90deg, ${pal.dark}, ${pal.base})`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex gap-3 justify-center flex-wrap items-center rise-in" style={{ animationDelay: '410ms' }}>
          {canRestart ? (
            <button
              type="button"
              className="btn-theme min-h-[44px] px-6 py-3 cursor-pointer"
              onClick={onAgain}
              aria-label="Play again"
            >
              PLAY AGAIN (SPACE)
            </button>
          ) : (
            <div className="p-3 text-xs font-bold text-amber-300 bg-amber-950/60 rounded-xl border border-amber-500/40">
              Waiting for room host to restart match...
            </div>
          )}
          <button
            type="button"
            className={`${btnGhost} min-h-[44px] cursor-pointer`}
            onClick={onMenu}
            aria-label="Return to main menu"
          >
            MAIN MENU
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- confirm modal ---------------- */

function ConfirmModal({
  action,
  onConfirm,
  onCancel,
}: {
  action: 'restart' | 'menu';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      isOpen={true}
      onClose={onCancel}
      titleId="confirm-dialog-title"
      descriptionId="confirm-dialog-desc"
      className="w-full max-w-sm p-6 text-center border-amber-400/40"
      backdropClassName="z-50"
    >
      <h3 id="confirm-dialog-title" className="font-display text-2xl text-amber-300 drop-title">
        {action === 'restart' ? 'RESTART MATCH?' : 'RETURN TO MENU?'}
      </h3>
      <p id="confirm-dialog-desc" className="mt-2 text-xs font-bold text-emerald-200/80">
        The current game progress will be lost. Are you sure?
      </p>
      <div className="mt-5 flex gap-3 justify-center">
        <button
          type="button"
          onClick={onConfirm}
          aria-label="Confirm and proceed"
          className="btn-theme min-h-[44px] px-6 py-3 cursor-pointer"
        >
          YES, PROCEED
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel and return to match"
          className={`${btnGhost} min-h-[44px] cursor-pointer`}
        >
          CANCEL
        </button>
      </div>
    </Dialog>
  );
}

/* ---------------- app ---------------- */

/** (G3) mm:ss timestamp for the game log. */
function formatLogTime(at: number): string {
  const d = new Date(at);
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function App() {
  const [showOnlineModal, setShowOnlineModal] = useState(() => {
    return window.location.hash.startsWith('#room=');
  });
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showFullLog, setShowFullLog] = useState(false);

  const gameRef = useRef<ReturnType<typeof useGame> | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearReconnectTimeout, [clearReconnectTimeout]);

  const multiplayer = useMultiplayer({
    onGameStart: (players, speed, winRule) => {
      clearReconnectTimeout();
      setShowOnlineModal(false);
      gameRef.current?.startGame(players, speed, winRule);
    },
    onRemoteRoll: (player, roll) => {
      gameRef.current?.doRemoteRoll(roll, player);
    },
    onSyncCheckpoint: (checkpoint) => {
      gameRef.current?.syncFromCheckpoint(checkpoint);
    },
    onEmoteReceived: (player, emoji) => {
      gameRef.current?.triggerEmote(player, emoji);
    },
    onPlayerDisconnected: (_slot, name) => {
      gameRef.current?.showToast(
        'PLAYER DISCONNECTED',
        `${name} disconnected. Waiting for them to rejoin...`,
        'pink',
      );
    },
    onPlayerReconnected: (_slot, name) => {
      gameRef.current?.showToast('PLAYER REJOINED', `${name} rejoined the match!`, 'cyan');
    },
    onPlayersUpdated: (updatedPlayers) => {
      gameRef.current?.updatePlayers(updatedPlayers);
    },
    onReconnected: (players, speed, winRule, gameState) => {
      clearReconnectTimeout();
      setShowOnlineModal(false);
      if (gameState) {
        gameRef.current?.reconnectGame(players, speed, winRule, gameState);
      } else {
        gameRef.current?.startGame(players, speed, winRule);
      }
      gameRef.current?.showToast('RECONNECTED', 'Welcome back to your match!', 'info');
    },
    getGameStateSnapshot: () => {
      return gameRef.current?.getSnapshot();
    },
    // Live turn/phase view. `getGameStateSnapshot` intentionally reports the last
    // stable checkpoint, so the host needs this to reject duplicate/out-of-turn rolls.
    getRollAuthority: () => {
      return gameRef.current?.getRollAuthority();
    },
  });

  const game = useGame({
    isOnline: multiplayer.isOnline,
    isOnlineMatch: multiplayer.isOnlineMatch,
    isPaused: multiplayer.isPaused,
    isHost: multiplayer.isHost,
    onlineSlot: multiplayer.mySlot,
    onLocalRoll: (roll, player) => {
      multiplayer.broadcastRoll(player, roll);
    },
    onTurnSettled: (snapshot) => {
      multiplayer.broadcastCheckpoint(snapshot);
    },
  });

  gameRef.current = game;
  const { hud } = game;
  const activePlayer = hud.players[hud.turn] ?? hud.players[0];
  const activePal = game.playerPalette(hud.turn);

  // Listen to hash changes for direct invite joins
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash.startsWith('#room=')) {
        setShowOnlineModal(true);
      }
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const menuConfigRef = useRef<{
    players: PlayerConfig[];
    speed: GameSpeed;
    rule: WinRule;
  } | null>(null);

  const lastAnnouncedTextRef = useRef('');
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  useEffect(() => {
    let msg = '';
    if (hud.mode === 'over' && hud.winner >= 0) {
      const winnerName = hud.players[hud.winner]?.name ?? `Player ${hud.winner + 1}`;
      msg = `${winnerName} won the match!`;
    } else if (game.toast) {
      msg = `${game.toast.title}: ${game.toast.sub ?? ''}`;
    } else if (game.log[0]) {
      msg = game.log[0].text;
    }
    if (msg && msg !== lastAnnouncedTextRef.current) {
      lastAnnouncedTextRef.current = msg;
      setLiveAnnouncement(msg);
    }
  }, [game.toast, game.log, hud.mode, hud.winner, hud.players]);

  const hashRoomCode = window.location.hash.startsWith('#room=')
    ? window.location.hash.replace('#room=', '').trim()
    : '';

  const handleLeaveOnline = useCallback(() => {
    clearReconnectTimeout();
    multiplayer.leaveRoom();
    game.backToMenu();
  }, [clearReconnectTimeout, multiplayer, game]);

  const handleConfirm = useCallback(() => {
    clearReconnectTimeout();
    if (game.confirmAction === 'menu' && multiplayer.isOnline) {
      multiplayer.leaveRoom();
    }
    game.confirmPending();
  }, [clearReconnectTimeout, game, multiplayer]);

  const handleRestart = useCallback(() => {
    clearReconnectTimeout();
    if (multiplayer.isOnline) {
      if (multiplayer.isHost) {
        multiplayer.startGame();
      } else {
        game.showToast('HOST ONLY', 'Only the room host can restart an online match.', 'gold');
      }
    } else {
      game.requestRestart();
    }
  }, [clearReconnectTimeout, multiplayer, game]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Global keyboard shortcuts (F, R, Esc, T, Space, Enter)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest?.('[contenteditable="true"]') ||
          target.closest?.('[role="dialog"]') ||
          target.closest?.('dialog'))
      ) {
        return;
      }

      // If any modal dialog is currently open in DOM, do not handle global shortcuts
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], dialog')) {
        return;
      }

      if (e.code === 'KeyF') {
        toggleFullscreen();
      } else if (e.code === 'KeyR') {
        if (hud.mode === 'playing') {
          handleRestart();
        }
      } else if (e.code === 'Escape') {
        if (hud.mode === 'playing') {
          game.requestMenu();
        }
      } else if (e.code === 'KeyT') {
        setShowThemeModal((v) => !v);
      } else if (e.code === 'Space' || e.code === 'Enter') {
        if (hud.mode === 'menu' && !showOnlineModal) {
          e.preventDefault();
          if (menuConfigRef.current) {
            clearReconnectTimeout();
            game.startGame(
              menuConfigRef.current.players,
              menuConfigRef.current.speed,
              menuConfigRef.current.rule
            );
          }
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hud.mode, showOnlineModal, clearReconnectTimeout, game, handleRestart, toggleFullscreen]);

  const isMyTurn =
    !multiplayer.isOnline || hud.players[hud.turn]?.slotIndex === multiplayer.mySlot;

  // (G1) Who is furthest up the board right now?
  const leaderIndex = (() => {
    let best = -1;
    let bestPos = -1;
    for (let i = 0; i < hud.players.length; i++) {
      const p = hud.pos[i] ?? 0;
      if (p > bestPos) {
        bestPos = p;
        best = i;
      }
    }
    return bestPos > 0 ? best : -1;
  })();

  const cardLabel = (idx: number) => {
    if (hud.turn !== idx || hud.mode !== 'playing') return undefined;
    if (multiplayer.isPaused) return 'PAUSED';
    if (hud.rolling) return 'ROLLING';
    if (hud.phase === 'moving') return 'HOPPING';
    if (hud.phase === 'sliding') return 'SLIDING';
    if (hud.phase === 'settling') return 'LANDED';
    const player = hud.players[idx];
    if (player?.isCpu) return 'THINKING...';
    if (multiplayer.isOnline) {
      const netPlayer = multiplayer.players.find((p) => p.slotIndex === player?.slotIndex);
      if (netPlayer && !netPlayer.isReady) return 'DISCONNECTED';
      return player?.slotIndex === multiplayer.mySlot ? 'YOUR TURN!' : 'WAITING...';
    }
    return 'YOUR TURN';
  };

  const rollButtonLabel = () => {
    if (multiplayer.isPaused) return 'MATCH PAUSED (RECONNECTING...)';
    if (multiplayer.isOnlineMatch && !multiplayer.isOnline) return 'DISCONNECTED...';
    if (hud.mode === 'over') return 'GAME FINISHED';
    if (game.awaitingRemoteRoll) return 'AWAITING HOST...';
    if (hud.rolling) return 'ROLLING...';
    if (hud.phase === 'moving') return 'MOVING...';
    if (hud.phase === 'sliding') return 'SLIDING...';
    if (hud.phase === 'settling') return 'LANDED!';
    if (activePlayer?.isCpu) return `${activePlayer.name.toUpperCase()} THINKING...`;
    if (multiplayer.isOnline) {
      const activeNetPlayer = multiplayer.players.find(
        (p) => p.slotIndex === activePlayer?.slotIndex,
      );
      if (activeNetPlayer && !activeNetPlayer.isReady) {
        return `WAITING FOR ${activePlayer.name.toUpperCase()} TO RECONNECT...`;
      }
      return isMyTurn ? 'ROLL DICE (YOUR TURN)' : `WAITING FOR ${activePlayer.name.toUpperCase()}...`;
    }
    return 'ROLL DICE';
  };

  // (A1/A2) One-shot map of every `--theme-*` custom property for the active
  // theme. The `@theme inline` block in index.css repoints Tailwind's
  // `emerald-*` / `amber-*` utilities at these, which is what finally makes the
  // whole UI (not just the canvas) follow the selected theme.
  const themeVars = themeCssVars(game.theme) as React.CSSProperties;

  // (A3) Keep the browser/OS chrome colour in step with the active theme, so
  // the address bar (or the mobile status bar) never stays jungle-green while
  // a different board theme is selected.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', game.theme.ui.bodyBg);
  }, [game.themeId, game.theme]);

  return (
    <div
      className="h-[100dvh] w-full overflow-hidden font-ui text-emerald-50 relative select-none"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
        ...themeVars,
      }}
    >
      <BgGlow bgGlow={game.theme.ui.bgGlow} themeId={game.themeId} />
      <AriaLiveAnnouncer message={liveAnnouncement} />
      <AccessibleBoardTable
        players={hud.players}
        positions={hud.pos}
        currentTurn={hud.turn}
      />

      {hud.mode === 'menu' ? (
        showOnlineModal ? (
          <OnlineLobby
            isOnline={multiplayer.isOnline}
            isHost={multiplayer.isHost}
            roomCode={multiplayer.roomCode}
            mySlot={multiplayer.mySlot}
            status={multiplayer.status}
            statusDetail={multiplayer.statusDetail}
            players={multiplayer.players}
            speed={multiplayer.speed}
            winRule={multiplayer.winRule}
            maxPlayers={multiplayer.maxPlayers}
            ping={multiplayer.ping}
            savedSession={multiplayer.savedSession}
            initialRoomCode={hashRoomCode}
            onCreateRoom={multiplayer.createRoom}
            onJoinRoom={async (roomCode, guestName, colorId) => {
              await multiplayer.joinRoom(roomCode, guestName, colorId);
            }}
            onReconnect={multiplayer.reconnectRoom}
            onChangeColor={multiplayer.changeColor}
            onToggleCpu={multiplayer.toggleCpuSlot}
            onUpdateRules={multiplayer.updateRoomRules}
            onStartGame={multiplayer.startGame}
            onLeaveRoom={multiplayer.leaveRoom}
            onCancel={() => {
              clearReconnectTimeout();
              setShowOnlineModal(false);
              multiplayer.leaveRoom();
              if (window.location.hash.startsWith('#room=')) {
                window.history.replaceState(null, '', window.location.pathname);
              }
            }}
          />
        ) : (
          <StartScreen
            onStart={(players, speed, winRule) => {
              clearReconnectTimeout();
              game.startGame(players, speed, winRule);
            }}
            onConfigChange={(config) => {
              menuConfigRef.current = config;
            }}
            onOpenOnline={() => setShowOnlineModal(true)}
            savedSession={multiplayer.savedSession}
            onResumeSession={() => setShowOnlineModal(true)}
            currentThemeId={game.themeId}
            onSelectTheme={game.setTheme}
            onOpenThemeModal={() => setShowThemeModal(true)}
          />
        )
      ) : (
        <>
          <div className="relative z-10 h-full flex flex-col landscape:flex-row lg:flex-row gap-1.5 sm:gap-2 lg:gap-3 p-1.5 sm:p-2.5 lg:p-4 max-w-[1600px] mx-auto overflow-hidden">
            {/* Mobile Top Header (Portrait only) */}
            <div className="landscape:hidden lg:hidden shrink-0 flex items-center justify-between gap-1 px-2 py-1 rounded-xl bg-emerald-950/80 border border-emerald-800/40 backdrop-blur-md">
              <div className="flex items-center gap-1.5 min-w-0">
                <SnakeIcon className="w-4.5 h-4.5 text-red-400 shrink-0" />
                <span className="font-display text-xs sm:text-sm tracking-wide text-emerald-100 truncate">
                  SNAKE <span className="text-amber-400">&amp; LADDER</span>
                </span>
                <span className="hidden xs:inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-900/60 border border-emerald-700/40 text-emerald-300 uppercase shrink-0">
                  {hud.winRule === 'exact' ? 'Exact' : 'Bounce'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowThemeModal(true)}
                  aria-label="Change Theme"
                  title="Change Theme (T)"
                  className="px-1.5 py-1 rounded-lg border border-amber-400/30 bg-emerald-950/80 text-amber-300 text-[10px] font-bold hover:border-amber-400/60 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>{game.theme.icon}</span>
                  <span className="truncate max-w-[50px] xs:max-w-[70px]">{game.theme.name.split(' ')[0]}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (multiplayer.isOnline && hud.mode === 'playing') {
                      game.showToast('LOCKED', 'Speed is locked during online matches.', 'gold');
                      return;
                    }
                    const next: Record<GameSpeed, GameSpeed> = {
                      normal: 'fast',
                      fast: 'turbo',
                      turbo: 'normal',
                    };
                    game.setSpeed(next[hud.speed]);
                  }}
                  title="Cycle Game Speed (S)"
                  className="px-1.5 py-1 rounded-lg border border-emerald-700/40 bg-emerald-950/80 text-emerald-200 text-[10px] font-black uppercase hover:border-amber-400/50 transition-colors cursor-pointer"
                >
                  ⚡{SPEEDS[hud.speed].label.split(' ')[0]}
                </button>

                <IconBtn onClick={game.toggleMute} label="Toggle Sound (M)" size="sm">
                  <SpeakerIcon on={!game.muted} />
                </IconBtn>
                <IconBtn onClick={handleRestart} label="Restart Match (R)" size="sm">
                  <RestartIcon className="w-3.5 h-3.5" />
                </IconBtn>
                <IconBtn onClick={game.requestMenu} label="Main Menu (Esc)" size="sm">
                  <HomeIcon className="w-3.5 h-3.5" />
                </IconBtn>
              </div>
            </div>

            {/* Mobile Player Strip (Portrait only - single row) */}
            <div className="landscape:hidden lg:hidden shrink-0">
              <div
                className={`grid gap-1 ${
                  hud.players.length === 2
                    ? 'grid-cols-2'
                    : hud.players.length === 3
                    ? 'grid-cols-3'
                    : 'grid-cols-4'
                }`}
              >
                {hud.players.map((p, idx) => (
                  <MobilePlayerChip
                    key={p.id}
                    player={p}
                    pos={hud.pos[idx] ?? 0}
                    rolls={hud.rolls[idx] ?? 0}
                    ladders={hud.laddersHit[idx] ?? 0}
                    snakes={hud.snakesHit[idx] ?? 0}
                    active={hud.turn === idx && hud.mode === 'playing'}
                    activeLabel={cardLabel(idx)}
                    totalPlayers={hud.players.length}
                  />
                ))}
              </div>
            </div>

            {/* Board Area - Shared by Mobile & Desktop */}
            <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center gap-1 w-full h-full">
              {multiplayer.isOnline && (
                <OnlineHudBar
                  roomCode={multiplayer.roomCode}
                  mySlot={multiplayer.mySlot}
                  currentTurn={hud.turn}
                  players={multiplayer.players}
                  ping={multiplayer.ping}
                  onSendEmote={multiplayer.broadcastEmote}
                  onLeaveRoom={handleLeaveOnline}
                />
              )}

              <div className="relative w-full flex-1 min-h-0 min-w-0 flex items-center justify-center overflow-hidden">
                {/* (G5) A soft halo behind the board so the eye is pulled to the
                    play area rather than the chrome around it. */}
                <div
                  className="pointer-events-none absolute inset-0 board-glow"
                  style={{
                    background:
                      'radial-gradient(closest-side, var(--theme-accent-glow), transparent 78%)',
                    opacity: 0.28,
                    mixBlendMode: 'screen',
                  }}
                  aria-hidden="true"
                />
                <div ref={game.wrapRef} className="relative w-full h-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden">
                  <canvas ref={game.canvasRef} className="drop-shadow-[0_18px_44px_rgba(0,0,0,0.6)]" />
                </div>
                <ToastView toast={game.toast} />

                {/* (J1) One top-centre stack for the turn banner + move ticker.
                    They used to be two independent `absolute top-1 left-1/2`
                    elements, so in portrait both landed on the same spot and
                    covered each other. Only their *container* is positioned now;
                    each pill keeps its own look, and they can no longer collide
                    at any breakpoint. */}
                <div className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1 max-w-[92%]">
                  {/* (G4) Turn banner across the top of the board. Previously
                      "whose turn is it" was only expressed in the sidebar status
                      label, which is off-screen on mobile and easy to miss. */}
                  {hud.mode === 'playing' && hud.phase !== 'over' && (
                    <div
                      className="pointer-events-none flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/85 border backdrop-blur-md text-[11px] font-black tracking-wide shadow-lg max-w-full truncate"
                      style={{
                        borderColor: `${activePal.base}66`,
                        color: activePal.light,
                      }}
                      aria-hidden="true"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: activePal.base }}
                      />
                      <span className="truncate">
                        {activePlayer?.name?.toUpperCase() ?? 'PLAYER'}&rsquo;
                        {hud.phase === 'rolling'
                          ? 'S TURN'
                          : hud.phase === 'moving'
                            ? 'S MOVE'
                            : hud.phase === 'sliding'
                              ? 'S SLIDE'
                              : 'S TURN'}
                      </span>
                    </div>
                  )}

                  {/* Floating latest move ticker on mobile/tablet */}
                  {game.log[0] && (
                    <div className="landscape:hidden lg:hidden pointer-events-none px-2.5 py-0.5 rounded-full bg-slate-950/85 border border-amber-400/30 backdrop-blur-md text-[10px] font-bold text-emerald-100 shadow-lg flex items-center gap-1.5 max-w-full truncate">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="truncate">{game.log[0].text}</span>
                    </div>
                  )}
                </div>

                {/* Hover inspection badge */}
                {game.hoveredSquare && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-3 py-1 rounded-full bg-slate-950/92 border border-amber-400/40 backdrop-blur-md text-xs font-bold shadow-2xl flex items-center gap-1.5">
                    <span className="text-amber-300 font-display tracking-wide tnum">
                      Square {game.hoveredSquare}
                    </span>
                    {PORTALS[game.hoveredSquare]?.type === 'snake' && (
                      <span className="text-rose-400 flex items-center gap-1">
                        <span>🐍 Drops to {PORTALS[game.hoveredSquare].to}</span>
                        <span className="opacity-75 font-normal tnum">
                          ({PORTALS[game.hoveredSquare].diff} squares)
                        </span>
                      </span>
                    )}
                    {PORTALS[game.hoveredSquare]?.type === 'ladder' && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span>🪜 Climbs to {PORTALS[game.hoveredSquare].to}</span>
                        <span className="opacity-75 font-normal tnum">
                          (+{PORTALS[game.hoveredSquare].diff} squares)
                        </span>
                      </span>
                    )}
                    {!PORTALS[game.hoveredSquare] && game.hoveredSquare === 100 && (
                      /* (A7) Coloured with the active theme's accent instead of a
                         hardcoded jungle amber. The wording is unchanged so the
                         accessible board table and the hover badge stay in sync. */
                      <span style={{ color: game.theme.ui.accent }}>
                        ★ FINISH PODIUM ★
                      </span>
                    )}
                    {!PORTALS[game.hoveredSquare] && game.hoveredSquare < 100 && (
                      <span className="text-slate-400 font-medium tnum">
                        ({100 - game.hoveredSquare} to 100)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Mobile Bottom Thumb Bar (Portrait only) */}
            <div className="landscape:hidden lg:hidden shrink-0 flex items-center gap-2 p-1.5 rounded-xl panel shadow-xl">
              <Die
                value={hud.roll}
                rolling={hud.rolling}
                onRoll={() => game.doRoll()}
                canRoll={game.canRoll}
                rollMs={SPEEDS[hud.speed].rollMs}
                activeColor={activePal.base}
                compact={true}
              />
              <button
                type="button"
                disabled={!game.canRoll}
                onClick={() => game.doRoll()}
                className={`btn-theme flex-1 py-2.5 px-3 text-sm sm:text-base font-display tracking-wide rounded-xl flex items-center justify-center gap-2 ${
                  !game.canRoll ? 'opacity-50 saturate-50 cursor-not-allowed' : 'pulse-glow'
                }`}
              >
                <span>{rollButtonLabel()}</span>
              </button>
            </div>

            {/* Controls Side Panel (Landscape Mobile AND Desktop: landscape:flex lg:flex) */}
            <aside className="hidden landscape:flex lg:flex shrink-0 w-[215px] xs:w-[235px] lg:w-[350px] flex-col gap-1.5 lg:gap-2 min-h-0 overflow-y-auto">
              {/* Header Bar - Desktop Rich Version */}
              <div className="hidden lg:flex panel p-2.5 flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <SnakeIcon className="w-5.5 h-5.5 text-red-400 shrink-0" />
                    <span className="font-display text-base sm:text-lg tracking-wide whitespace-nowrap">
                      <span className="text-emerald-100">SNAKE</span>{' '}
                      <span className="text-amber-400">&amp; LADDER</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowThemeModal(true)}
                      title="Change Theme (T)"
                      className="px-2 py-0.5 rounded-full bg-emerald-900/60 border border-amber-400/40 text-[10px] font-bold text-amber-300 flex items-center gap-1 hover:border-amber-400/80 transition-colors cursor-pointer"
                    >
                      <span>{game.theme.icon}</span>
                      <span>{game.theme.name.split(' ')[0]}</span>
                    </button>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700/50 text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                      {hud.winRule === 'exact' ? 'Exact 100' : 'Bounce Back'}
                    </span>
                  </div>
                </div>

                {/* Controls toolbar */}
                <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-emerald-900/40">
                  <button
                    type="button"
                    onClick={() => {
                      if (multiplayer.isOnline && hud.mode === 'playing') {
                        game.showToast('LOCKED', 'Speed is locked during online matches.', 'gold');
                        return;
                      }
                      const next: Record<GameSpeed, GameSpeed> = {
                        normal: 'fast',
                        fast: 'turbo',
                        turbo: 'normal',
                      };
                      game.setSpeed(next[hud.speed]);
                    }}
                    title="Cycle Game Speed (S)"
                    className="flex-1 py-1 px-2 rounded-lg border border-amber-400/30 bg-emerald-950/80 text-[11px] font-bold text-amber-300 hover:border-amber-400/60 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="opacity-70 font-normal text-[10px]">SPEED:</span>
                    <span>{SPEEDS[hud.speed].label}</span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <IconBtn onClick={() => setShowThemeModal(true)} label="Board Theme (T)">
                      <PaletteIcon className="w-4 h-4 text-amber-300" />
                    </IconBtn>
                    <IconBtn onClick={toggleFullscreen} label="Toggle Fullscreen (F)">
                      <ExpandIcon className="w-4 h-4" />
                    </IconBtn>
                    <IconBtn onClick={game.toggleMute} label="Toggle Sound (M)">
                      <SpeakerIcon on={!game.muted} />
                    </IconBtn>
                    <IconBtn onClick={handleRestart} label="Restart Match (R)">
                      <RestartIcon className="w-4 h-4" />
                    </IconBtn>
                    <IconBtn onClick={game.requestMenu} label="Main Menu (Esc)">
                      <HomeIcon className="w-4 h-4" />
                    </IconBtn>
                  </div>
                </div>
              </div>

              {/* Header Bar - Landscape Mobile Streamlined Toolbar */}
              <div className="flex lg:hidden panel px-2 py-1 items-center justify-between gap-1 shrink-0">
                <div className="flex items-center gap-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setShowThemeModal(true)}
                    title="Change Theme (T)"
                    className="px-1.5 py-0.5 rounded-lg border border-amber-400/30 bg-emerald-950/80 text-amber-300 text-[10px] font-bold hover:border-amber-400/60 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>{game.theme.icon}</span>
                    <span className="truncate max-w-[45px]">{game.theme.name.split(' ')[0]}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (multiplayer.isOnline && hud.mode === 'playing') {
                        game.showToast('LOCKED', 'Speed is locked during online matches.', 'gold');
                        return;
                      }
                      const next: Record<GameSpeed, GameSpeed> = {
                        normal: 'fast',
                        fast: 'turbo',
                        turbo: 'normal',
                      };
                      game.setSpeed(next[hud.speed]);
                    }}
                    title="Cycle Game Speed (S)"
                    className="px-1.5 py-0.5 rounded-lg border border-emerald-700/40 bg-emerald-950/80 text-emerald-200 text-[10px] font-black uppercase hover:border-amber-400/50 transition-colors cursor-pointer"
                  >
                    ⚡{SPEEDS[hud.speed].label.split(' ')[0]}
                  </button>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <IconBtn onClick={game.toggleMute} label="Toggle Sound (M)" size="sm">
                    <SpeakerIcon on={!game.muted} />
                  </IconBtn>
                  <IconBtn onClick={handleRestart} label="Restart Match (R)" size="sm">
                    <RestartIcon className="w-3.5 h-3.5" />
                  </IconBtn>
                  <IconBtn onClick={game.requestMenu} label="Main Menu (Esc)" size="sm">
                    <HomeIcon className="w-3.5 h-3.5" />
                  </IconBtn>
                </div>
              </div>

              {/* Player Scorecards - Desktop View (full cards with progress bars) */}
              <div
                className={`hidden lg:grid gap-1.5 ${
                  hud.players.length === 2
                    ? 'grid-cols-2 lg:grid-cols-1'
                    : hud.players.length === 3
                    ? 'grid-cols-3 lg:grid-cols-1'
                    : 'grid-cols-2 lg:grid-cols-1'
                }`}
              >
                {hud.players.map((p, idx) => (
                  <PlayerCard
                    key={p.id}
                    player={p}
                    pos={hud.pos[idx] ?? 0}
                    rolls={hud.rolls[idx] ?? 0}
                    ladders={hud.laddersHit[idx] ?? 0}
                    snakes={hud.snakesHit[idx] ?? 0}
                    active={hud.turn === idx && hud.mode === 'playing'}
                    activeLabel={cardLabel(idx)}
                    isLeader={idx === leaderIndex}
                  />
                ))}
              </div>

              {/* Player Chips - Landscape Mobile View (compact chips fitting any height) */}
              <div
                className={`grid lg:hidden gap-1 shrink-0 ${
                  hud.players.length === 2
                    ? 'grid-cols-2'
                    : hud.players.length === 3
                    ? 'grid-cols-3'
                    : 'grid-cols-2'
                }`}
              >
                {hud.players.map((p, idx) => (
                  <MobilePlayerChip
                    key={p.id}
                    player={p}
                    pos={hud.pos[idx] ?? 0}
                    rolls={hud.rolls[idx] ?? 0}
                    ladders={hud.laddersHit[idx] ?? 0}
                    snakes={hud.snakesHit[idx] ?? 0}
                    active={hud.turn === idx && hud.mode === 'playing'}
                    activeLabel={cardLabel(idx)}
                    totalPlayers={hud.players.length}
                  />
                ))}
              </div>

              {/* Dice & Action Panel */}
              <div className="panel p-1.5 sm:p-2 lg:p-2.5 flex items-center gap-2 sm:gap-3 shrink-0">
                <Die
                  value={hud.roll}
                  rolling={hud.rolling}
                  onRoll={() => game.doRoll()}
                  canRoll={game.canRoll}
                  rollMs={SPEEDS[hud.speed].rollMs}
                  activeColor={activePal.base}
                  compact={true}
                />
                <div className="flex-1 min-w-0 flex flex-col items-stretch gap-1">
                  <button
                    type="button"
                    disabled={!game.canRoll}
                    onClick={() => game.doRoll()}
                    className={`btn-theme w-full py-2 sm:py-2.5 px-2 text-xs sm:text-sm lg:text-base text-center font-display ${
                      !game.canRoll ? 'opacity-50 saturate-50 cursor-not-allowed' : 'pulse-glow'
                    }`}
                  >
                    {rollButtonLabel()}
                  </button>
                  <div className="hidden lg:block text-center text-[10px] font-black tracking-widest text-emerald-300/50">
                    SPACE / ENTER TO ROLL
                  </div>
                </div>
              </div>

              {/* Live Move Log (Desktop only - mobile uses floating overlay ticker) */}
              <div className="panel p-2.5 hidden lg:block">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-black tracking-widest text-emerald-300/50">GAME LOG</div>
                  {/* (G3) The log keeps up to 20 entries; reveal them on demand. */}
                  {game.log.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowFullLog((v) => !v)}
                      className="text-[10px] font-black text-amber-300/80 hover:text-amber-200 underline cursor-pointer"
                    >
                      {showFullLog ? 'COLLAPSE' : `SHOW ALL (${game.log.length})`}
                    </button>
                  )}
                </div>
                {/* (G6) Empty state so the panel never looks broken before the
                    first roll. */}
                {game.log.length === 0 ? (
                  <p className="text-[11px] font-bold text-emerald-300/40 italic">
                    No moves yet — roll the dice to begin.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {game.log.slice(0, showFullLog ? 20 : 5).map((e, i) => (
                      <li
                        key={e.id}
                        /* (G2) The newest entry gets a brief highlight so the eye
                           catches it without having to diff the list. */
                        className={`text-[11px] sm:text-[12px] font-bold flex items-center gap-2 text-emerald-100/90 truncate ${
                          i === 0 ? 'log-flash -mx-1.5 px-1.5' : ''
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            e.kind === 'p0'
                              ? 'bg-cyan-400'
                              : e.kind === 'p1'
                                ? 'bg-rose-400'
                                : e.kind === 'p2'
                                  ? 'bg-lime-400'
                                  : e.kind === 'p3'
                                    ? 'bg-amber-400'
                                    : 'bg-yellow-300'
                          }`}
                        />
                        <span className="truncate">{e.text}</span>
                        <span className="ml-auto shrink-0 text-[10px] font-bold text-emerald-300/40 tnum flex items-center gap-0.5">
                          <ClockIcon className="w-2.5 h-2.5" />
                          {formatLogTime(e.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Quick Strategy Legend */}
              <div className="hidden lg:flex items-center justify-between text-[10px] font-black tracking-wider text-emerald-300/45">
                <span>ROLL 6 = EXTRA TURN</span>
                <span>•</span>
                <span>{hud.winRule === 'exact' ? 'EXACT 100 TO WIN' : 'BOUNCE BACK RULE'}</span>
              </div>
            </aside>
          </div>

          {/* Confirm Dialog */}
          {game.confirmAction && (
            <ConfirmModal
              action={game.confirmAction}
              onConfirm={handleConfirm}
              onCancel={game.cancelPending}
            />
          )}

          {/* Winner Celebration Modal */}
          {hud.mode === 'over' && game.showWin && hud.winner >= 0 && (
            <WinOverlay
              winner={
                hud.players[hud.winner] || {
                  id: `player-${hud.winner}`,
                  slotIndex: hud.winner,
                  name: `Player ${hud.winner + 1}`,
                  colorId: hud.winner,
                  isCpu: false,
                }
              }
              players={hud.players}
              positions={hud.pos}
              rolls={hud.rolls}
              ladders={hud.laddersHit}
              snakes={hud.snakesHit}
              sixes={hud.sixesHit}
              isOnline={multiplayer.isOnline}
              isHost={multiplayer.isHost}
              theme={game.theme}
              onAgain={() => {
                if (multiplayer.isOnline) {
                  if (multiplayer.isHost) {
                    multiplayer.startGame();
                  } else {
                    game.showToast('HOST ONLY', 'Only the room host can restart an online match.', 'gold');
                  }
                } else {
                  game.startGame(hud.players, hud.speed, hud.winRule);
                }
              }}
              onMenu={handleLeaveOnline}
            />
          )}
        </>
      )}

      {/* Theme Selector Modal.
          This lives *outside* the menu/game ternary on purpose: it used to be
          inside the in-game branch, which meant the start screen's
          "View All (5)" button and the T shortcut silently did nothing until a
          match had already started. */}
      {showThemeModal && (
        <ThemeModal
          currentThemeId={game.themeId}
          onSelectTheme={game.setTheme}
          onClose={() => setShowThemeModal(false)}
        />
      )}
    </div>
  );
}

