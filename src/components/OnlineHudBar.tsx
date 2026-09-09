import { useState } from 'react';
import type { NetworkPlayer } from '../game/network/types';
import { getShareUrl, isLocalhost } from '../game/network/sessionStorage';

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
    <div className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-950/85 border border-amber-400/30 backdrop-blur-md shadow-lg flex-wrap sm:flex-nowrap">
      {/* Left: Room Code & Ping */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleCopyLink}
          title="Click to copy invite link"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-400/15 border border-amber-400/40 text-amber-300 text-xs font-black tracking-wider hover:bg-amber-400/25 transition-all cursor-pointer"
        >
          <span className="text-[10px] opacity-80">
            {copied ? (isLocalhost() ? '✓ COPIED MOBILE LINK!' : '✓ COPIED LINK!') : '📋'}
          </span>
        </button>

        {ping > 0 && (
          <span className="text-[10px] font-bold text-emerald-400/80 bg-emerald-900/40 px-2 py-0.5 rounded-full border border-emerald-700/40">
            🟢 {ping}ms
          </span>
        )}
      </div>

      {/* Center: Real-Time Turn Status */}
      <div className="flex items-center justify-center">
        {isMyTurn ? (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400 text-amber-300 text-xs font-black animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.3)]">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>👉 YOUR TURN TO ROLL!</span>
          </div>
        ) : (
          <div className="text-xs font-bold text-emerald-200/80">
            Waiting for Player {currentTurn + 1} to roll...
          </div>
        )}
      </div>

      {/* Right: Quick Emote Bar & Exit */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center gap-1 bg-emerald-900/40 p-1 rounded-lg border border-emerald-700/30">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onSendEmote(emoji)}
              title={`React with ${emoji}`}
              className="text-base sm:text-lg hover:scale-130 active:scale-95 transition-transform cursor-pointer p-0.5 leading-none"
            >
              {emoji}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onLeaveRoom}
          title="Exit Room"
          className="text-xs font-black text-rose-300/80 hover:text-rose-200 bg-rose-950/40 px-2 py-1.5 rounded-lg border border-rose-800/40 hover:bg-rose-900/40 transition-all cursor-pointer"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
