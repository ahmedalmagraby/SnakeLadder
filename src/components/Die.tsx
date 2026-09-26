import { useEffect, useRef, useState } from 'react';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/* Final cube rotation to face the camera, per value */
const FACE_ROT: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

const FACES: { value: number; transform: string }[] = [
  { value: 1, transform: 'translateZ(31px)' },
  { value: 6, transform: 'rotateY(180deg) translateZ(31px)' },
  { value: 3, transform: 'rotateY(90deg) translateZ(31px)' },
  { value: 4, transform: 'rotateY(-90deg) translateZ(31px)' },
  { value: 2, transform: 'rotateX(90deg) translateZ(31px)' },
  { value: 5, transform: 'rotateX(-90deg) translateZ(31px)' },
];

export default function Die({
  value,
  rolling,
  onRoll,
  canRoll,
  rollMs = 950,
  activeColor = '#06b6d4',
  compact = false,
}: {
  value: number;
  rolling: boolean;
  onRoll: () => void;
  canRoll: boolean;
  rollMs?: number;
  activeColor?: string;
  compact?: boolean;
}) {
  const currentRot = useRef({ x: 0, y: 0 });
  const prevFace = useRef<[number, number]>([0, 0]);
  const [tf, setTf] = useState('rotateX(0deg) rotateY(0deg)');
  const [isLanded, setIsLanded] = useState(false);

  useEffect(() => {
    if (rolling && value > 0) {
      setIsLanded(false);
      const targetFace = FACE_ROT[value] ?? FACE_ROT[1];
      const extraSpinsX = 720;
      const extraSpinsY = 1080;

      const diffX = targetFace[0] - prevFace.current[0];
      const diffY = targetFace[1] - prevFace.current[1];

      const nextX = currentRot.current.x + extraSpinsX + diffX;
      const nextY = currentRot.current.y + extraSpinsY + diffY;

      currentRot.current = { x: nextX, y: nextY };
      prevFace.current = targetFace;

      setTf(`rotateX(${nextX}deg) rotateY(${nextY}deg)`);

      const t = window.setTimeout(() => {
        setIsLanded(true);
      }, rollMs);
      return () => window.clearTimeout(t);
    }
  }, [rolling, value, rollMs]);

  return (
    <div className={`flex flex-col items-center shrink-0 ${compact ? 'gap-0' : 'gap-1.5'}`}>
      <button
        type="button"
        aria-label="Roll the dice"
        onClick={onRoll}
        disabled={!canRoll}
        className={`die-stage select-none outline-none relative group ${
          compact ? 'scale-[0.72] origin-center -my-2' : ''
        } ${rolling ? 'rolling' : ''} ${isLanded && !rolling ? 'landed' : ''} ${
          isLanded && !rolling && value === 6 ? 'lucky-six' : ''
        } ${canRoll ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}`}
        style={{
          filter: canRoll ? `drop-shadow(0 0 12px ${activeColor}55)` : 'none',
        }}
      >
        <div className={`die-shadow ${rolling ? 'scale-75 opacity-50' : 'scale-100 opacity-90'}`} />
        <div
          className="die-cube"
          style={{
            transform: tf,
            transition: rolling
              ? `transform ${rollMs}ms cubic-bezier(0.16, 0.95, 0.28, 1.02)`
              : 'none',
          }}
        >
          {FACES.map((f) => (
            <div key={f.value} className="die-face" style={{ transform: f.transform }}>
              {Array.from({ length: 9 }, (_, i) => (
                <span
                  key={i}
                  className={PIPS[f.value].includes(i) ? 'die-pip' : ''}
                  style={
                    PIPS[f.value].includes(i) && f.value === 1
                      ? { transform: 'scale(1.25)' }
                      : undefined
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </button>

      {/* Pop badge showing rolled number on settle */}
      <div className={`flex items-center justify-center ${compact ? 'h-4' : 'h-5'}`}>
        {value > 0 && isLanded && !rolling ? (
          <div
            className={`pop-in flex items-center gap-1 px-2 py-0.5 rounded-full font-black text-[10px] leading-none transition-all ${
              value === 6
                ? 'bg-amber-500/25 border border-amber-300 text-amber-200 shadow-[0_0_12px_var(--theme-accent-glow)] animate-pulse'
                : 'bg-emerald-950/90 border border-amber-400/40 text-amber-300'
            }`}
          >
            <span>ROLLED {value}</span>
            {value === 6 && <span className="text-cyan-300">★ +1</span>}
          </div>
        ) : (
          <span className={`font-bold text-emerald-300/40 tracking-wider leading-none ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
            {rolling ? 'ROLLING' : canRoll ? 'TAP TO ROLL' : 'WAIT'}
          </span>
        )}
      </div>
    </div>
  );
}

