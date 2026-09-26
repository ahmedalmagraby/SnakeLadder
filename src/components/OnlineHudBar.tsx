import { useState } from 'react';
import type { NetworkPlayer } from '../game/network/types';
import { getShareUrl } from '../game/network/sessionStorage';
import { copyToClipboard } from '../utils/clipboard';

interface OnlineHudBarProps {
  roomCode: string;
  mySlot: number;
  currentTurn: number;
  players: NetworkPlayer[];
  ping: number;
  onSendEmote: (emoji: string) => void;
  onLeaveRoom: () => void;
}

const REACTION_EMOJIS = ['🐍', '🪜', '🎲', '👑', '😱', '😂', '🔥', '🎯'];

/**
 * (J2) Latency colour ramp.
 *
 * The badge used to print a literal "🟢 {ping}ms", so a 900ms round-trip looked
 * identical to a 20ms one. The dot is now a plain span tinted by threshold, and
 * the emoji is gone - which also means it renders the same on every platform
 * instead of depending on the OS emoji font (same reasoning as F2/F4).
 */
function pingTone(ping: number): { dot: string; text: string; label: string } {
  if (ping <= 120) {
    return { dot: '#4ade80', text: 'text-emerald-300', label: 'Excellent' };
  }
  if (ping <= 300) {
    return { dot: '#fbbf24', text: 'text-amber-300', label: 'Fair' };
  }
  return { dot: '#fb7185', text: 'text-rose-300', label: 'Poor' };
}

export default function OnlineHudBar({
  roomCode,
  mySlot,
  currentTurn,
  players,
  ping,
  onSendEmote,
  onLeaveRoom,
}: OnlineHudBarProps) {
  const [copied, setCopied] = useState(false);
  const activePlayer = players[currentTurn];
  const isMyTurn = activePlayer ? activePlayer.slotIndex === mySlot : currentTurn === mySlot;

  const handleCopyLink = async () => {
    const url = getShareUrl(roomCode);
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-emerald-950/85 border border-amber-400/30 backdrop-blur-md shadow-lg text-xs">
      {/* Left: Room Code & Ping */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleCopyLink}
          aria-label="Copy room invite link"
          title="Click to copy invite link"
          className="min-h-[36px] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[11px] font-black tracking-wider hover:bg-amber-400/25 transition-all cursor-pointer"
        >
          <span>{copied ? '✓ COPIED' : `ROOM ${roomCode}`}</span>
        </button>

        {ping > 0 && (
          <span
            className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-900/40 px-1.5 py-0.5 rounded-full border border-emerald-700/40 ${pingTone(ping).text}`}
            title={`Connection quality: ${pingTone(ping).label}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: pingTone(ping).dot }}
              aria-hidden="true"
            />
            <span className="tnum">{ping}ms</span>
          </span>
        )}
      </div>

      {/* Center: Real-Time Turn Status */}
      <div className="flex-1 min-w-0 flex items-center justify-center px-1">
        {isMyTurn ? (
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400 text-amber-300 text-[11px] font-black animate-pulse truncate shadow-[0_0_12px_var(--theme-glow-strong)]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
            <span className="truncate">YOUR TURN!</span>
          </div>
        ) : (
          <div className="text-[11px] font-bold text-emerald-200/80 truncate text-center">
            {activePlayer?.name || `Player ${(activePlayer?.slotIndex ?? currentTurn) + 1}`}&apos;s turn...
          </div>
        )}
      </div>

      {/* Right: Quick Emote Bar & Exit */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="flex items-center gap-0.5 bg-emerald-900/40 p-0.5 rounded-lg border border-emerald-700/30 max-w-[110px] sm:max-w-none overflow-x-auto" role="group" aria-label="Quick reactions">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSendEmote(emoji)}
              aria-label={`Send ${emoji} reaction`}
              title={`React with ${emoji}`}
              className="min-w-[32px] min-h-[32px] flex items-center justify-center text-sm sm:text-base hover:scale-125 active:scale-95 transition-transform cursor-pointer p-0.5 leading-none shrink-0"
            >
              {emoji}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onLeaveRoom}
          aria-label="Exit room"
          title="Exit Room"
          className="min-h-[36px] text-[11px] font-black text-rose-300/80 hover:text-rose-200 bg-rose-950/40 px-2 py-1 rounded-lg border border-rose-800/40 hover:bg-rose-900/40 transition-all cursor-pointer shrink-0"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
