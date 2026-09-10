import { useState, useEffect } from 'react';
import { PLAYER_COLORS, type GameSpeed, type WinRule } from '../game/constants';
import type { NetworkPlayer, ConnectionStatus } from '../game/network/types';
import {
  clearSession,
  getLanIp,
  getShareUrl,
  isLocalhost,
  setLanIp,
  type SavedSession,
} from '../game/network/sessionStorage';

interface OnlineLobbyProps {
  isOnline: boolean;
  isHost: boolean;
  roomCode: string;
  mySlot: number;
  status: ConnectionStatus;
  statusDetail: string;
  players: NetworkPlayer[];
  speed: GameSpeed;
  winRule: WinRule;
  maxPlayers: number;
  ping: number;
  savedSession?: SavedSession | null;
  defaultHostName?: string;
  defaultGuestName?: string;
  initialRoomCode?: string;
  onCreateRoom: (hostName: string, colorId: number, maxPlayers: number, speed: GameSpeed, winRule: WinRule) => Promise<string>;
  onJoinRoom: (roomCode: string, guestName: string, colorId: number) => Promise<void>;
  onReconnect: (roomCode?: string) => Promise<any>;
  onChangeColor: (slotIndex: number, colorId: number) => void;
  onToggleCpu: (slotIndex: number) => void;
  onUpdateRules: (speed: GameSpeed, winRule: WinRule) => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onCancel: () => void;
}

export default function OnlineLobby({
  isOnline,
  isHost,
  roomCode,
  mySlot,
  status,
  statusDetail,
  players,
  speed,
  winRule,
  maxPlayers,
  ping,
  savedSession,
  defaultHostName = 'You',
  defaultGuestName = 'Friend',
  initialRoomCode = '',
  onCreateRoom,
  onJoinRoom,
  onReconnect,
  onChangeColor,
  onToggleCpu,
  onUpdateRules,
  onStartGame,
  onLeaveRoom,
  onCancel,
}: OnlineLobbyProps) {
  const [tab, setTab] = useState<'host' | 'join'>('host');
  const [hostName, setHostName] = useState(defaultHostName);
  const [guestName, setGuestName] = useState(defaultGuestName);
  const [inputCode, setInputCode] = useState(initialRoomCode);
  const [selectedColor, setSelectedColor] = useState(0);
  const [roomCapacity, setRoomCapacity] = useState(maxPlayers || 4);
  const [localSpeed, setLocalSpeed] = useState<GameSpeed>(speed);
  const [localRule, setLocalRule] = useState<WinRule>(winRule);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lanIp, setLocalLanIp] = useState(getLanIp);
  const [editingIp, setEditingIp] = useState(false);

  // Pre-fill if room code in hash
  useEffect(() => {
    if (initialRoomCode) {
      setInputCode(initialRoomCode.toUpperCase());
      setTab('join');
    }
  }, [initialRoomCode]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied('code');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = getShareUrl(roomCode);
      await navigator.clipboard.writeText(url);
      setCopied('link');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCreate = async () => {
    if (isSubmitting) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await onCreateRoom(hostName, selectedColor, roomCapacity, localSpeed, localRule);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (isSubmitting || !inputCode.trim()) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await onJoinRoom(inputCode.trim(), guestName, selectedColor);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect to room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResume = async () => {
    if (isSubmitting || !savedSession) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      await onReconnect(savedSession.roomCode);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not rejoin room.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---------------- Active Waiting Room View ---------------- */
  if (isOnline && roomCode) {
    const readyCount = players.length;
    const canStart = isHost && readyCount >= 2;
    const shareUrl = getShareUrl(roomCode);

    return (
      <div className="relative z-10 h-full w-full overflow-y-auto p-2.5 sm:p-6 flex flex-col items-center justify-start sm:justify-center">
        <div className="relative w-full max-w-xl panel p-4 sm:p-8 text-center border-amber-400/30 my-1 sm:my-auto shrink-0">
          {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-800/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-black tracking-wider text-emerald-300">
              {isHost ? 'HOST LOBBY' : 'PLAYER LOBBY'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {ping > 0 && (
              <span className="text-[11px] font-bold text-emerald-400/80 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/50">
                🟢 {ping}ms
              </span>
            )}
            <button
              type="button"
              onClick={onLeaveRoom}
              className="text-xs font-black text-rose-300/80 hover:text-rose-200 bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-800/40 cursor-pointer"
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* Big Room Code Display */}
        <div className="my-4 p-4 rounded-2xl bg-gradient-to-b from-amber-500/10 to-amber-900/20 border border-amber-400/40">
          <span className="text-[11px] font-black tracking-widest text-amber-300/80 block uppercase">
            ROOM INVITE CODE
          </span>
          <div className="mt-1 font-display text-4xl sm:text-5xl text-amber-300 tracking-widest drop-title select-all">
            {roomCode}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopyCode}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-amber-400/20 text-amber-200 border border-amber-400/40 hover:bg-amber-400/30 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>📋</span>
              <span>{copied === 'code' ? 'COPIED CODE!' : 'COPY CODE'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>🔗</span>
              <span>{copied === 'link' ? (isLocalhost() ? 'COPIED MOBILE LINK!' : 'COPIED LINK!') : 'COPY INVITE LINK'}</span>
            </button>
          </div>

          {/* Localhost IP Info / Configuration */}
          {isLocalhost() && (
            <div className="mt-3 text-left p-2.5 rounded-xl bg-emerald-950/80 border border-amber-400/20 text-xs">
              <div className="flex items-center justify-between text-amber-300 font-bold mb-1">
                <span className="flex items-center gap-1.5 text-[11px]">
                  <span>📱</span>
                  <span>Mobile / Cross-Device Link (Wi-Fi)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setEditingIp((v) => !v)}
                  className="text-[10px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                >
                  {editingIp ? 'Save IP' : 'Edit Host IP'}
                </button>
              </div>
              {editingIp ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-emerald-300/70 text-[11px]">Host IP:</span>
                  <input
                    type="text"
                    value={lanIp}
                    onChange={(e) => {
                      setLocalLanIp(e.target.value);
                      setLanIp(e.target.value);
                    }}
                    placeholder="192.168.1.11"
                    className="px-2 py-0.5 rounded bg-emerald-900/90 border border-amber-400/50 text-xs text-amber-200 outline-none w-36 font-mono"
                  />
                  <span className="text-[10px] text-emerald-400/60">Phone can reach this address</span>
                </div>
              ) : (
                <div className="text-[11px] text-emerald-200/90 font-mono truncate select-all">
                  {shareUrl}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Connected Players Grid */}
        <div className="text-left mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-emerald-300/80 tracking-wider">
              CONNECTED PLAYERS ({readyCount}/{maxPlayers}):
            </span>
            <span className="text-[11px] font-bold text-emerald-400/70">
              {canStart ? 'Ready to play!' : 'Waiting for more players...'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {Array.from({ length: maxPlayers }, (_, slotIdx) => {
              const player = players.find((p) => p.slotIndex === slotIdx);
              const isMe = player && slotIdx === mySlot;
              const canEditColor = isMe || (isHost && player?.isCpu);

              if (player) {
                const col = PLAYER_COLORS[player.colorId % PLAYER_COLORS.length];
                const takenColors = new Set(
                  players.filter((p) => p.slotIndex !== slotIdx).map((p) => p.colorId)
                );

                return (
                  <div
                    key={slotIdx}
                    className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700/50 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ background: col.base, boxShadow: `0 0 8px ${col.glow}` }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-display text-emerald-100 truncate">
                            {player.name} {isMe && <span className="text-amber-300">(You)</span>}
                          </div>
                          <div className="text-[10px] font-bold text-emerald-400/70">
                            {player.isHost ? '👑 Host' : player.isCpu ? '🤖 Bot' : '🟢 Ready'}
                          </div>
                        </div>
                      </div>

                      {isHost && !player.isHost && (
                        <button
                          type="button"
                          onClick={() => onToggleCpu(slotIdx)}
                          className="text-[10px] font-bold text-rose-400 hover:text-rose-300 ml-1 shrink-0 cursor-pointer"
                        >
                          Kick
                        </button>
                      )}
                    </div>

                    {/* Color Swatch Picker */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-emerald-800/30">
                      <span className="text-[9px] font-black text-emerald-300/60 uppercase">COLOR:</span>
                      <div className="flex gap-1.5">
                        {PLAYER_COLORS.map((c) => {
                          const isCurrent = player.colorId === c.id;
                          const isTaken = takenColors.has(c.id);

                          return (
                            <button
                              key={c.id}
                              type="button"
                              disabled={!canEditColor || (isTaken && !isCurrent)}
                              onClick={() => canEditColor && onChangeColor(slotIdx, c.id)}
                              title={
                                isCurrent
                                  ? 'Selected'
                                  : isTaken
                                  ? 'Color taken by another player'
                                  : canEditColor
                                  ? 'Select color'
                                  : undefined
                              }
                              className={`w-5 h-5 rounded-full transition-all relative ${
                                isCurrent
                                  ? 'scale-115 ring-2 ring-amber-300 shadow-md'
                                  : isTaken
                                  ? 'opacity-20 cursor-not-allowed saturate-0'
                                  : canEditColor
                                  ? 'opacity-65 hover:opacity-100 hover:scale-110 cursor-pointer'
                                  : 'opacity-40 cursor-default'
                              }`}
                              style={{ background: c.base }}
                            >
                              {isTaken && !isCurrent && (
                                <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/70 font-black">
                                  ✕
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }

              // Empty slot
              return (
                <div
                  key={slotIdx}
                  className="p-3 rounded-xl bg-emerald-950/30 border border-dashed border-emerald-800/40 flex items-center justify-between text-emerald-500/70"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border border-dashed border-emerald-700/50 shrink-0" />
                    <span className="text-xs font-bold">Slot {slotIdx + 1}: Open</span>
                  </div>

                  {isHost && (
                    <button
                      type="button"
                      onClick={() => onToggleCpu(slotIdx)}
                      className="text-[11px] font-black text-amber-300 hover:text-amber-200 bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/30 cursor-pointer"
                    >
                      + Add CPU
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Room Rules Summary or Config */}
        {isHost ? (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/30 flex items-center justify-between text-left">
            <span className="text-xs font-black text-emerald-300/80 uppercase">Match Rules:</span>
            <div className="flex gap-2">
              <div className="flex gap-1">
                {(['normal', 'fast', 'turbo'] as GameSpeed[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setLocalSpeed(s);
                      onUpdateRules(s, winRule);
                    }}
                    className={`flex-1 py-1 px-2 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                      speed === s
                        ? 'bg-amber-400 text-stone-900'
                        : 'bg-emerald-900/50 text-emerald-300/80 hover:bg-emerald-800/50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex gap-1">
                {(['exact', 'bounce'] as WinRule[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setLocalRule(r);
                      onUpdateRules(speed, r);
                    }}
                    className={`flex-1 py-1 px-2 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                      winRule === r
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
        ) : (
          <div className="mt-4 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/30 text-xs text-emerald-300/80 flex items-center justify-center gap-4">
            <span>⚡ Speed: <strong>{speed.toUpperCase()}</strong></span>
            <span>🎯 Rule: <strong>{winRule === 'exact' ? 'Exact 100' : 'Bounce Back'}</strong></span>
          </div>
        )}

        {/* Start Game / Waiting Action */}
        <div className="mt-5">
          {isHost ? (
            <button
              type="button"
              disabled={!canStart}
              onClick={onStartGame}
              className={`w-full font-display text-lg tracking-wider py-3.5 rounded-xl transition-all ${
                canStart
                  ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 text-[#3a2302] border-b-4 border-amber-700 shadow-[0_8px_24px_rgba(251,191,36,0.35)] hover:brightness-105 active:translate-y-0.5 cursor-pointer'
                  : 'bg-emerald-900/40 text-emerald-500/50 border border-emerald-800/40 cursor-not-allowed'
              }`}
            >
              {canStart ? '🚀 START MATCH' : 'WAITING FOR 1 MORE PLAYER...'}
            </button>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-900/30 border border-emerald-700/40 text-emerald-200 text-sm font-bold flex items-center justify-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <span>Waiting for host to launch the match...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

  /* ---------------- Create / Join Screen View ---------------- */
  return (
    <div className="relative z-10 h-full w-full overflow-y-auto p-2.5 sm:p-6 flex flex-col items-center justify-start sm:justify-center">
      <div className="relative w-full max-w-lg panel p-4 sm:p-8 text-center border-amber-400/30 my-1 sm:my-auto shrink-0">
        <div className="flex items-center justify-center gap-2 mb-2">
        <span className="text-2xl">🌐</span>
        <h2 className="font-display text-3xl sm:text-4xl text-amber-300 drop-title">
          ONLINE MULTIPLAYER
        </h2>
      </div>
      <p className="text-emerald-200/80 text-xs sm:text-sm font-bold mb-4">
        Play with friends on phones, tablets, or laptops over the Internet
      </p>

      {/* Resume Recent Active Match Banner */}
      {savedSession && (
        <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-emerald-900/40 to-amber-500/20 border border-amber-400/60 flex items-center justify-between text-left">
          <div>
            <div className="text-xs font-display text-amber-300 flex items-center gap-1.5">
              <span>🔄</span>
              <span>RESUME RECENT MATCH</span>
            </div>
            <div className="text-[11px] text-emerald-200/80 font-bold">
              Room: <strong className="text-amber-200">{savedSession.roomCode}</strong> as {savedSession.playerName}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleResume}
              className="px-3 py-1 rounded-lg text-xs font-black bg-amber-400 text-stone-900 hover:bg-amber-300 transition-all cursor-pointer shadow"
            >
              {isSubmitting ? 'RECONNECTING...' : 'REJOIN'}
            </button>
            <button
              type="button"
              onClick={() => {
                clearSession();
                window.location.reload();
              }}
              title="Dismiss session"
              className="px-2 py-1 text-xs text-emerald-400/60 hover:text-rose-300 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Tabs: Host vs Join */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-emerald-950/70 border border-emerald-800/40 mb-4">
        <button
          type="button"
          onClick={() => {
            setTab('host');
            setErrorMsg('');
          }}
          className={`py-2 rounded-lg text-xs font-black tracking-wider transition-all cursor-pointer ${
            tab === 'host'
              ? 'bg-amber-400 text-stone-900 shadow'
              : 'text-emerald-300/70 hover:text-emerald-200'
          }`}
        >
          👑 HOST NEW GAME
        </button>

        <button
          type="button"
          onClick={() => {
            setTab('join');
            setErrorMsg('');
          }}
          className={`py-2 rounded-lg text-xs font-black tracking-wider transition-all cursor-pointer ${
            tab === 'join'
              ? 'bg-amber-400 text-stone-900 shadow'
              : 'text-emerald-300/70 hover:text-emerald-200'
          }`}
        >
          🎮 JOIN A ROOM
        </button>
      </div>

      {(errorMsg || (status !== 'idle' && statusDetail)) && (
        <div
          className={`mb-4 p-2.5 rounded-xl border text-xs font-bold text-center ${
            status === 'error' || errorMsg
              ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
              : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
          }`}
        >
          {errorMsg ? `⚠️ ${errorMsg}` : `ℹ️ ${statusDetail}`}
        </div>
      )}

      {/* HOST SUB-PANEL */}
      {tab === 'host' ? (
        <div className="space-y-3.5 text-left">
          {/* Host Name & Color */}
          <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30">
            <label className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1 uppercase">
              YOUR PLAYER NAME
            </label>
            <input
              type="text"
              maxLength={14}
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Your Name"
              className="w-full px-3 py-2 rounded-lg bg-emerald-950/90 border border-emerald-700/50 text-sm font-bold text-emerald-100 outline-none focus:border-amber-400"
            />

            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[10px] font-black text-emerald-300/70 tracking-wider">YOUR COLOR:</span>
              <div className="flex gap-2">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.id)}
                    className={`w-6 h-6 rounded-full transition-all cursor-pointer ${
                      selectedColor === c.id ? 'scale-125 ring-2 ring-amber-300' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ background: c.base, boxShadow: `0 0 6px ${c.glow}` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Player Capacity & Rules */}
          <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-emerald-300/70 tracking-wider uppercase">
                PLAYER CAPACITY:
              </span>
              <div className="flex gap-1.5">
                {[2, 3, 4].map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => setRoomCapacity(cap)}
                    className={`w-7 h-7 rounded-lg text-xs font-display transition-all cursor-pointer ${
                      roomCapacity === cap
                        ? 'bg-amber-400 text-stone-900 font-black'
                        : 'bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800/60'
                    }`}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <span className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1 uppercase">
                  SPEED
                </span>
                <div className="flex gap-1">
                  {(['normal', 'fast', 'turbo'] as GameSpeed[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setLocalSpeed(s)}
                      className={`flex-1 py-1 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                        localSpeed === s
                          ? 'bg-amber-400 text-stone-900'
                          : 'bg-emerald-900/50 text-emerald-300/80 hover:bg-emerald-800/50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1 uppercase">
                  WIN RULE
                </span>
                <div className="flex gap-1">
                  {(['exact', 'bounce'] as WinRule[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setLocalRule(r)}
                      className={`flex-1 py-1 rounded text-[10px] font-black uppercase transition-all cursor-pointer ${
                        localRule === r
                          ? 'bg-amber-400 text-stone-900'
                          : 'bg-emerald-900/50 text-emerald-300/80 hover:bg-emerald-800/50'
                      }`}
                    >
                      {r === 'exact' ? 'Exact' : 'Bounce'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleCreate}
            className="w-full font-display text-lg tracking-wider py-3 rounded-xl bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 text-[#3a2302] border-b-4 border-amber-700 shadow-[0_8px_20px_rgba(251,191,36,0.28)] hover:brightness-105 active:translate-y-0.5 cursor-pointer"
          >
            {isSubmitting ? 'CREATING ROOM...' : '👑 CREATE ROOM & GET INVITE CODE'}
          </button>
        </div>
      ) : (
        /* JOIN SUB-PANEL */
        <div className="space-y-3.5 text-left">
          {/* Guest Name & Desired Color */}
          <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30">
            <label className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1 uppercase">
              YOUR PLAYER NAME
            </label>
            <input
              type="text"
              maxLength={14}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Your Name"
              className="w-full px-3 py-2 rounded-lg bg-emerald-950/90 border border-emerald-700/50 text-sm font-bold text-emerald-100 outline-none focus:border-amber-400"
            />

            <div className="mt-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-emerald-300/70 tracking-wider block">PREFERRED COLOR:</span>
                <span className="text-[9px] text-emerald-400/60 font-medium">Auto-adjusted if already taken</span>
              </div>
              <div className="flex gap-2">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.id)}
                    className={`w-6 h-6 rounded-full transition-all cursor-pointer ${
                      selectedColor === c.id ? 'scale-125 ring-2 ring-amber-300' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ background: c.base, boxShadow: `0 0 6px ${c.glow}` }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Room Code Input */}
          <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/30">
            <label className="text-[10px] font-black text-emerald-300/70 tracking-wider block mb-1 uppercase">
              ENTER 6-LETTER ROOM CODE
            </label>
            <input
              type="text"
              maxLength={8}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="e.g. JGL842"
              className="w-full text-center tracking-widest text-2xl font-display uppercase px-3 py-2 rounded-lg bg-emerald-950/90 border border-emerald-700/50 text-amber-300 outline-none focus:border-amber-400 placeholder:text-emerald-600/50"
            />
          </div>

          <button
            type="button"
            disabled={isSubmitting || !inputCode.trim()}
            onClick={handleJoin}
            className={`w-full font-display text-lg tracking-wider py-3 rounded-xl transition-all ${
              inputCode.trim()
                ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 text-[#3a2302] border-b-4 border-amber-700 shadow-[0_8px_20px_rgba(251,191,36,0.28)] hover:brightness-105 active:translate-y-0.5 cursor-pointer'
                : 'bg-emerald-900/40 text-emerald-500/50 border border-emerald-800/40 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? 'CONNECTING...' : '🎮 JOIN ROOM'}
          </button>
        </div>
      )}

      {/* Back to main menu */}
      <div className="mt-4 border-t border-emerald-800/30 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-bold text-emerald-300/70 hover:text-emerald-200 cursor-pointer"
        >
          ← Back to Main Menu
        </button>
      </div>
    </div>
  </div>
);
}
