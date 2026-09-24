import { useState, useEffect, useRef, type ReactNode } from 'react';
import Die from './components/Die';
import OnlineLobby from './components/OnlineLobby';
import OnlineHudBar from './components/OnlineHudBar';
import ThemeModal from './components/ThemeModal';
import { THEMES, type ThemeId, type BoardTheme } from './game/themes';
import { useMultiplayer } from './game/network/useMultiplayer';
import type { SavedSession } from './game/network/sessionStorage';
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

/* ---------------- shared bits ---------------- */

const btnGhost = 'btn-theme-ghost font-display tracking-wide px-6 py-3';

function BgGlow({ bgGlow }: { bgGlow?: string }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none transition-all duration-700"
      style={{
        background:
          bgGlow ||
          'radial-gradient(950px 620px at 10% -5%, rgba(16,185,129,0.16), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(251,191,36,0.14), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(7,60,44,0.5), transparent 75%)',
      }}
    />
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
      className={`${s} rounded-lg border border-amber-400/20 bg-emerald-950/70 text-emerald-200/90 flex items-center justify-center hover:border-amber-400/60 hover:text-amber-300 transition-colors cursor-pointer shrink-0`}
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
}: {
  player: PlayerConfig;
  pos: number;
  rolls: number;
  ladders: number;
  snakes: number;
  active: boolean;
  activeLabel?: string;
}) {
  const col = PLAYER_COLORS[player.colorId % PLAYER_COLORS.length];
  return (
    <div
      className={`panel p-2.5 transition-all duration-300 ${
        active ? 'pulse-glow border-amber-400/80 shadow-[0_0_16px_rgba(251,191,36,0.3)]' : 'opacity-80'
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
          {player.id + 1}
        </span>
        <span className="font-display text-xs sm:text-sm tracking-wide truncate">{player.name}</span>
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
        <span className="font-display text-2xl leading-none" style={{ color: active ? col.light : '#d1fae5' }}>
          {pos === 0 ? 'START' : pos}
        </span>
      </div>

      {/* Progress bar to 100 */}
      <div className="mt-1.5 h-1.5 rounded-full bg-emerald-950/80 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pos}%`,
            background: `linear-gradient(90deg, ${col.dark}, ${col.base})`,
          }}
        />
      </div>

      <div className="mt-1.5 flex justify-between items-center text-[9px] font-bold text-emerald-300/60">
        <div className="flex items-center gap-1.5">
          <span>{rolls} rolls</span>
          {ladders > 0 && <span className="text-amber-400">🪜 {ladders}</span>}
          {snakes > 0 && <span className="text-red-400">🐍 {snakes}</span>}
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
          ? 'bg-amber-400/20 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.35)] ring-1 ring-amber-400/60'
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
        {player.id + 1}
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
}: {
  onStart: (players: PlayerConfig[], speed: GameSpeed, winRule: WinRule) => void;
  onOpenOnline: () => void;
  savedSession?: SavedSession | null;
  onResumeSession?: () => void;
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  onOpenThemeModal: () => void;
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

  const handleNameChange = (idx: number, val: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  };

  const handleLaunch = () => {
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
        id: i,
        name: names[i]?.trim() || defaultName,
        isCpu,
        colorId: i,
      });
    }
    onStart(list, speed, rule);
  };

  return (
    <div className="relative z-10 h-full w-full overflow-y-auto p-2.5 sm:p-6 flex flex-col items-center justify-start sm:justify-center">
      <SnakeIcon className="pointer-events-none floaty absolute left-[5%] top-[8%] w-14 h-14 text-red-500/25" />
      <LadderIcon className="pointer-events-none floaty absolute right-[6%] top-[14%] w-14 h-14 text-amber-400/25 [--fr:14deg]" />
      <DiceIcon className="pointer-events-none floaty absolute left-[8%] bottom-[10%] w-12 h-12 text-emerald-400/25 [--fr:-10deg]" />
      <SnakeIcon className="pointer-events-none floaty absolute right-[8%] bottom-[8%] w-12 h-12 text-lime-400/20 [--fr:160deg]" />

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
        {savedSession && (
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
              className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-amber-400 text-stone-900 hover:bg-amber-300 transition-all cursor-pointer shadow flex items-center gap-1"
            >
              <span>RESUME</span>
              <span>➔</span>
            </button>
          </div>
        )}

        {/* Mode Selector */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setMode('solo');
              setNames(['You', 'CPU 1', 'CPU 2', 'CPU 3']);
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              mode === 'solo'
                ? 'bg-amber-400/15 border-amber-400/80 shadow-[0_0_14px_rgba(251,191,36,0.25)]'
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
            onClick={() => {
              setMode('pass');
              setNames(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
            }}
            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
              mode === 'pass'
                ? 'bg-amber-400/15 border-amber-400/80 shadow-[0_0_14px_rgba(251,191,36,0.25)]'
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
          className="mt-3 w-full p-3 rounded-xl border border-amber-400/60 bg-gradient-to-r from-amber-500/20 via-emerald-900/40 to-amber-500/20 hover:border-amber-400/90 hover:from-amber-500/30 hover:to-amber-500/30 text-left transition-all cursor-pointer shadow-[0_0_16px_rgba(251,191,36,0.2)] flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🌐</span>
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
          <span className="text-amber-300 font-display text-lg">➔</span>
        </button>

        {/* Player Count & Names */}
        <div className="mt-4 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30 text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-emerald-300/80 tracking-wider">PLAYERS:</span>
            <div className="flex gap-1.5">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPlayerCount(n)}
                  className={`w-7 h-7 rounded-lg text-xs font-display transition-all cursor-pointer ${
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
              return (
                <div key={idx} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-emerald-950/70 border border-emerald-800/40">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ background: col.base, boxShadow: `0 0 6px ${col.glow}` }}
                  />
                  <input
                    type="text"
                    maxLength={12}
                    value={names[idx] ?? ''}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    placeholder={mode === 'solo' && idx > 0 ? `CPU ${idx}` : `Player ${idx + 1}`}
                    className="w-full bg-transparent text-xs font-bold text-emerald-100 outline-none placeholder:text-emerald-500"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Game Rules & Speed Settings */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-left text-xs">
          <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30">
            <span className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1">SPEED</span>
            <div className="flex gap-1">
              {(['normal', 'fast', 'turbo'] as GameSpeed[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`flex-1 py-1 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                    speed === s
                      ? 'bg-amber-400 text-stone-900'
                      : 'bg-emerald-900/50 text-emerald-300/80 hover:bg-emerald-800/50'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30">
            <span className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1">WIN RULE</span>
            <div className="flex gap-1">
              {(['exact', 'bounce'] as WinRule[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRule(r)}
                  className={`flex-1 py-1 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                    rule === r
                      ? 'bg-amber-400 text-stone-900'
                      : 'bg-emerald-900/50 text-emerald-300/80 hover:bg-emerald-800/50'
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
              className="text-[11px] font-bold text-amber-300 hover:text-amber-200 underline cursor-pointer"
            >
              View All (5)
            </button>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {(Object.values(THEMES) as BoardTheme[]).map((t) => {
              const isSelected = t.id === currentThemeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTheme(t.id)}
                  title={`${t.name}: ${t.tagline}`}
                  className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400/20 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)] ring-1 ring-amber-400/70 scale-[1.02]'
                      : 'bg-emerald-950/60 border-emerald-800/40 hover:border-emerald-700/70 hover:bg-emerald-900/30'
                  }`}
                >
                  <span className="text-lg sm:text-xl leading-none">{t.icon}</span>
                  <span className="text-[10px] font-bold text-center leading-tight truncate w-full text-emerald-100">
                    {t.name.split(' ')[0]}
                  </span>
                  <div className="flex gap-0.5 mt-0.5">
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
          <button type="button" onClick={handleLaunch} className="btn-theme w-full py-3.5 text-base sm:text-lg">
            START MATCH
          </button>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[10px] font-black tracking-wider text-emerald-200/70">
          <span className="px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-700/40">ROLL 6 = EXTRA TURN</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-700/40">LADDERS CLIMB ▲</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-700/40">SNAKES DROP ▼</span>
        </div>
        <p className="mt-3 text-[11px] text-emerald-300/50 font-bold">
          PC — SPACE / ENTER to roll &middot; M to mute &middot; S for speed
        </p>
      </div>
    </div>
  );
}

/* ---------------- win overlay ---------------- */

function WinOverlay({
  winner,
  players,
  rolls,
  ladders,
  snakes,
  sixes,
  onAgain,
  onMenu,
}: {
  winner: PlayerConfig;
  players: PlayerConfig[];
  rolls: number[];
  ladders: number[];
  snakes: number[];
  sixes: number[];
  onAgain: () => void;
  onMenu: () => void;
}) {
  const col = PLAYER_COLORS[winner.colorId % PLAYER_COLORS.length];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04100b]/80 p-4 fade-in">
      <div
        className="panel pop-in w-full max-w-md p-6 sm:p-8 text-center max-h-[92vh] overflow-y-auto"
        style={{ borderColor: col.base, boxShadow: `0 0 32px ${col.glow}` }}
      >
        <TrophyIcon className="w-16 h-16 mx-auto text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.7)]" />
        <h2
          className="font-display text-4xl drop-title mt-2"
          style={{ color: col.light, textShadow: `0 0 20px ${col.glow}` }}
        >
          {winner.name.toUpperCase()} WINS!
        </h2>
        <p className="mt-1 font-bold text-emerald-100/90 text-sm">
          Conquered square 100 in {rolls[winner.id] ?? 0} {(rolls[winner.id] ?? 0) === 1 ? 'roll' : 'rolls'}!
        </p>

        {/* Match breakdown stats */}
        <div className="mt-4 grid grid-cols-3 gap-2 p-3 rounded-xl bg-emerald-950/70 border border-amber-400/30 text-center">
          <div>
            <div className="text-[10px] font-black tracking-wider text-emerald-300/60">ROLLS</div>
            <div className="font-display text-xl text-amber-300 mt-0.5">{rolls[winner.id] ?? 0}</div>
          </div>
          <div>
            <div className="text-[10px] font-black tracking-wider text-emerald-300/60">LADDERS</div>
            <div className="font-display text-xl text-yellow-300 mt-0.5">🪜 {ladders[winner.id] ?? 0}</div>
          </div>
          <div>
            <div className="text-[10px] font-black tracking-wider text-emerald-300/60">SNAKES</div>
            <div className="font-display text-xl text-rose-300 mt-0.5">🐍 {snakes[winner.id] ?? 0}</div>
          </div>
        </div>

        {/* Full match score table */}
        <div className="mt-3 p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30 text-left">
          <div className="text-[10px] font-black text-emerald-300/60 uppercase mb-1.5">Match Summary</div>
          <div className="space-y-1 text-xs font-bold">
            {players.map((p) => {
              const pal = PLAYER_COLORS[p.colorId % PLAYER_COLORS.length];
              return (
                <div key={p.id} className="flex items-center justify-between py-0.5 text-emerald-100/90">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: pal.base }} />
                    <span>{p.name}</span>
                    {p.id === winner.id && <span className="text-[10px] text-amber-400">👑 WINNER</span>}
                  </div>
                  <div className="flex items-center gap-3 text-emerald-300/70 text-[11px]">
                    <span>{rolls[p.id]} rolls</span>
                    <span>{sixes[p.id]} sixes</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex gap-3 justify-center flex-wrap">
          <button type="button" className="btn-theme px-6 py-3" onClick={onAgain}>
            PLAY AGAIN (SPACE)
          </button>
          <button type="button" className={btnGhost} onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#04100b]/80 p-4 fade-in">
      <div className="panel pop-in w-full max-w-sm p-6 text-center border-amber-400/40">
        <h3 className="font-display text-2xl text-amber-300 drop-title">
          {action === 'restart' ? 'RESTART MATCH?' : 'RETURN TO MENU?'}
        </h3>
        <p className="mt-2 text-xs font-bold text-emerald-200/80">
          The current game progress will be lost. Are you sure?
        </p>
        <div className="mt-5 flex gap-3 justify-center">
          <button type="button" onClick={onConfirm} className="btn-theme px-6 py-3">
            YES, PROCEED
          </button>
          <button type="button" onClick={onCancel} className={btnGhost}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- app ---------------- */

export default function App() {
  const [showOnlineModal, setShowOnlineModal] = useState(() => {
    return window.location.hash.startsWith('#room=');
  });
  const [showThemeModal, setShowThemeModal] = useState(false);

  const gameRef = useRef<ReturnType<typeof useGame> | null>(null);

  const multiplayer = useMultiplayer({
    onGameStart: (players, speed, winRule) => {
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
      gameRef.current?.showToast('PLAYER LEFT', `${name} left. CPU bot took over.`, 'pink');
    },
    onPlayerReconnected: (_slot, name) => {
      gameRef.current?.showToast('PLAYER REJOINED', `${name} rejoined the match!`, 'cyan');
    },
    onPlayersUpdated: (updatedPlayers) => {
      gameRef.current?.updatePlayers(updatedPlayers);
    },
    onReconnected: (players, speed, winRule, gameState) => {
      setShowOnlineModal(false);
      gameRef.current?.startGame(players, speed, winRule);
      if (gameState) {
        setTimeout(() => {
          gameRef.current?.syncFromCheckpoint(gameState);
        }, 120);
      }
      gameRef.current?.showToast('RECONNECTED', 'Welcome back to your match!', 'info');
    },
    getGameStateSnapshot: () => {
      return gameRef.current?.getSnapshot();
    },
  });

  const game = useGame({
    isOnline: multiplayer.isOnline,
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

  // Keyboard shortcut T for theme picker
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 't' || e.key === 'T') {
        setShowThemeModal((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const hashRoomCode = window.location.hash.startsWith('#room=')
    ? window.location.hash.replace('#room=', '').trim()
    : '';

  const handleLeaveOnline = () => {
    multiplayer.leaveRoom();
    game.backToMenu();
  };

  const handleConfirm = () => {
    if (game.confirmAction === 'menu' && multiplayer.isOnline) {
      multiplayer.leaveRoom();
    }
    game.confirmPending();
  };

  const handleRestart = () => {
    if (multiplayer.isOnline) {
      if (multiplayer.isHost) {
        multiplayer.startGame();
      } else {
        game.showToast('HOST ONLY', 'Only the room host can restart an online match.', 'gold');
      }
    } else {
      game.requestRestart();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const isMyTurn = !multiplayer.isOnline || hud.turn === multiplayer.mySlot;

  const cardLabel = (idx: number) => {
    if (hud.turn !== idx || hud.mode !== 'playing') return undefined;
    if (hud.rolling) return 'ROLLING';
    if (hud.phase === 'moving') return 'HOPPING';
    if (hud.phase === 'sliding') return 'SLIDING';
    if (hud.phase === 'settling') return 'LANDED';
    const player = hud.players[idx];
    if (player?.isCpu) return 'THINKING...';
    if (multiplayer.isOnline) {
      return idx === multiplayer.mySlot ? 'YOUR TURN!' : 'WAITING...';
    }
    return 'YOUR TURN';
  };

  const rollButtonLabel = () => {
    if (hud.mode === 'over') return 'GAME FINISHED';
    if (hud.rolling) return 'ROLLING...';
    if (hud.phase === 'moving') return 'MOVING...';
    if (hud.phase === 'sliding') return 'SLIDING...';
    if (hud.phase === 'settling') return 'LANDED!';
    if (activePlayer?.isCpu) return `${activePlayer.name.toUpperCase()} THINKING...`;
    if (multiplayer.isOnline) {
      return isMyTurn ? 'ROLL DICE (YOUR TURN)' : `WAITING FOR ${activePlayer.name.toUpperCase()}...`;
    }
    return 'ROLL DICE';
  };

  const themeVars = {
    ['--theme-panel-bg' as string]: game.theme.ui.panelBg,
    ['--theme-panel-border' as string]: game.theme.ui.panelBorder,
    ['--theme-accent' as string]: game.theme.ui.accent,
    ['--theme-accent-glow' as string]: game.theme.ui.accentGlow,
    ['--theme-btn-bg' as string]: game.theme.ui.btnBg,
    ['--theme-btn-text' as string]: game.theme.ui.btnText,
    ['--theme-btn-border' as string]: game.theme.ui.btnBorder,
    ['--theme-btn-shadow' as string]: game.theme.ui.btnShadow,
  };

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
      <BgGlow bgGlow={game.theme.ui.bgGlow} />

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
            onJoinRoom={multiplayer.joinRoom}
            onReconnect={multiplayer.reconnectRoom}
            onChangeColor={multiplayer.changeColor}
            onToggleCpu={multiplayer.toggleCpuSlot}
            onUpdateRules={multiplayer.updateRoomRules}
            onStartGame={multiplayer.startGame}
            onLeaveRoom={multiplayer.leaveRoom}
            onCancel={() => {
              setShowOnlineModal(false);
              multiplayer.leaveRoom();
              if (window.location.hash.startsWith('#room=')) {
                window.history.replaceState(null, '', window.location.pathname);
              }
            }}
          />
        ) : (
          <StartScreen
            onStart={game.startGame}
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
                <div ref={game.wrapRef} className="w-full h-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden">
                  <canvas ref={game.canvasRef} className="drop-shadow-[0_18px_44px_rgba(0,0,0,0.6)]" />
                </div>
                <ToastView toast={game.toast} />

                {/* Floating latest move ticker on mobile/tablet */}
                {game.log[0] && (
                  <div className="landscape:hidden lg:hidden absolute top-1 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-2.5 py-0.5 rounded-full bg-slate-950/85 border border-amber-400/30 backdrop-blur-md text-[10px] font-bold text-emerald-100 shadow-lg flex items-center gap-1.5 max-w-[85%] truncate">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="truncate">{game.log[0].text}</span>
                  </div>
                )}

                {/* Hover inspection badge */}
                {game.hoveredSquare && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none px-3 py-1 rounded-full bg-slate-950/92 border border-amber-400/40 backdrop-blur-md text-xs font-bold shadow-2xl flex items-center gap-1.5">
                    <span className="text-amber-300 font-display tracking-wide">
                      Square {game.hoveredSquare}
                    </span>
                    {PORTALS[game.hoveredSquare]?.type === 'snake' && (
                      <span className="text-rose-400 flex items-center gap-1">
                        <span>🐍 Drops to {PORTALS[game.hoveredSquare].to}</span>
                        <span className="opacity-75 font-normal">
                          ({PORTALS[game.hoveredSquare].diff} squares)
                        </span>
                      </span>
                    )}
                    {PORTALS[game.hoveredSquare]?.type === 'ladder' && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span>🪜 Climbs to {PORTALS[game.hoveredSquare].to}</span>
                        <span className="opacity-75 font-normal">
                          (+{PORTALS[game.hoveredSquare].diff} squares)
                        </span>
                      </span>
                    )}
                    {!PORTALS[game.hoveredSquare] && game.hoveredSquare === 100 && (
                      <span className="text-amber-200">★ FINISH PODIUM ★</span>
                    )}
                    {!PORTALS[game.hoveredSquare] && game.hoveredSquare < 100 && (
                      <span className="text-slate-400 font-medium">
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
                <div className="text-[10px] font-black tracking-widest text-emerald-300/50 mb-1">GAME LOG</div>
                <ul className="space-y-1">
                  {game.log.slice(0, 5).map((e) => (
                    <li key={e.id} className="text-[11px] sm:text-[12px] font-bold flex items-center gap-2 text-emerald-100/90 truncate">
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
                    </li>
                  ))}
                </ul>
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
                  id: hud.winner,
                  name: `Player ${hud.winner + 1}`,
                  colorId: hud.winner,
                  isCpu: false,
                }
              }
              players={hud.players}
              rolls={hud.rolls}
              ladders={hud.laddersHit}
              snakes={hud.snakesHit}
              sixes={hud.sixesHit}
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

          {/* Theme Selector Modal */}
          {showThemeModal && (
            <ThemeModal
              currentThemeId={game.themeId}
              onSelectTheme={game.setTheme}
              onClose={() => setShowThemeModal(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

