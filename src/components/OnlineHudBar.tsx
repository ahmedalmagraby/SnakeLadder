import { useState } from 'react';
import type { NetworkPlayer } from '../game/network/types';
import { getShareUrl } from '../game/network/sessionStorage';

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

export default function OnlineHudBar({
  roomCode,
  mySlot,
  currentTurn,
  ping,
  onSendEmote,
  onLeaveRoom,
}: OnlineHudBarProps) {
  const [copied, setCopied] = useState(false);
  const isMyTurn = currentTurn === mySlot;

  const handleCopyLink = async () => {
    try {
      const url = getShareUrl(roomCode);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-emerald-950/85 border border-amber-400/30 backdrop-blur-md shadow-lg text-xs">
      {/* Left: Room Code & Ping */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleCopyLink}
          title="Click to copy invite link"
          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[11px] font-black tracking-wider hover:bg-amber-400/25 transition-all cursor-pointer"
        >
          <span>{copied ? '✓ COPIED' : `ROOM ${roomCode}`}</span>
        </button>

        {ping > 0 && (
          <span className="hidden sm:inline-block text-[10px] font-bold text-emerald-400/80 bg-emerald-900/40 px-1.5 py-0.5 rounded-full border border-emerald-700/40">
            🟢 {ping}ms
          </span>
        )}
      </div>

      {/* Center: Real-Time Turn Status */}
      <div className="flex-1 min-w-0 flex items-center justify-center px-1">
        {isMyTurn ? (
          <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400 text-amber-300 text-[11px] font-black animate-pulse truncate shadow-[0_0_12px_rgba(251,191,36,0.3)]">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="truncate">YOUR TURN!</span>
          </div>
        ) : (
          <div className="text-[11px] font-bold text-emerald-200/80 truncate text-center">
            Player {currentTurn + 1}&apos;s turn...
          </div>
        )}
      </div>

      {/* Right: Quick Emote Bar & Exit */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="flex items-center gap-0.5 bg-emerald-900/40 p-0.5 rounded-lg border border-emerald-700/30 max-w-[110px] sm:max-w-none overflow-x-auto">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSendEmote(emoji)}
              title={`React with ${emoji}`}
              className="text-sm sm:text-base hover:scale-125 active:scale-95 transition-transform cursor-pointer p-0.5 leading-none shrink-0"
            >
              {emoji}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onLeaveRoom}
          title="Exit Room"
          className="text-[11px] font-black text-rose-300/80 hover:text-rose-200 bg-rose-950/40 px-1.5 py-1 rounded-lg border border-rose-800/40 hover:bg-rose-900/40 transition-all cursor-pointer shrink-0"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
