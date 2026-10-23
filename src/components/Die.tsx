import { useRef } from 'react';

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
  /* Compute 3D cube rotation synchronously during render so the CSS transition
   * and target transform commit in the exact same frame with zero two-render hitch. */
  const rotState = useRef({
    x: 0,
    y: 0,
    faceX: 0,
    faceY: 0,
    wasRolling: false,
  });

  const s = rotState.current;
  if (rolling && value > 0 && !s.wasRolling) {
    const targetFace = FACE_ROT[value] ?? FACE_ROT[1];
    const diffX = targetFace[0] - s.faceX;
    const diffY = targetFace[1] - s.faceY;
    s.x += 720 + diffX;
    s.y += 1080 + diffY;
    s.faceX = targetFace[0];
    s.faceY = targetFace[1];
    s.wasRolling = true;
  } else if (!rolling) {
    s.wasRolling = false;
    if (value > 0) {
      const targetFace = FACE_ROT[value] ?? FACE_ROT[1];
      if (s.faceX !== targetFace[0] || s.faceY !== targetFace[1]) {
        s.x += targetFace[0] - s.faceX;
        s.y += targetFace[1] - s.faceY;
        s.faceX = targetFace[0];
        s.faceY = targetFace[1];
      }
    }
  }

  const tf = `rotateX(${s.x}deg) rotateY(${s.y}deg)`;
  const isLanded = !rolling && value > 0;

  return (
    <div className={`flex flex-col items-center shrink-0 ${compact ? 'gap-0' : 'gap-1.5'}`}>
      <button
        type="button"
        aria-label="Roll the dice"
        onClick={onRoll}
        disabled={!canRoll}
        className={`die-stage select-none outline-none relative group ${
          compact ? 'scale-[0.72] origin-center -my-2' : ''
        } ${rolling ? 'rolling' : ''} ${isLanded ? 'landed' : ''} ${
          isLanded && value === 6 ? 'lucky-six' : ''
        } ${canRoll ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}`}
      >
        <div
          className={`die-shadow ${rolling ? 'scale-75 opacity-50' : 'scale-100 opacity-90'}`}
          style={
            canRoll && !(isLanded && value === 6)
              ? { boxShadow: `0 0 18px 4px ${activeColor}66` }
              : undefined
          }
        />
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
              {PIPS[f.value].map((pipIdx) => (
                <span
                  key={pipIdx}
                  className="die-pip"
                  style={{
                    gridRow: Math.floor(pipIdx / 3) + 1,
                    gridColumn: (pipIdx % 3) + 1,
                    ...(f.value === 1 ? { transform: 'scale(1.25)' } : undefined),
                  }}
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

