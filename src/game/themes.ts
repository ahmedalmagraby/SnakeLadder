export type ThemeId = 'jungle' | 'cyber' | 'desert' | 'cosmic' | 'candy';

export type ShadeKey =
  | '50'
  | '100'
  | '200'
  | '300'
  | '400'
  | '500'
  | '600'
  | '700'
  | '800'
  | '900'
  | '950';

/**
 * A full lightness ramp for one colour role. Values are CSS colours in any
 * format, but they are authored as `oklch()` so they can be hue-rotated cheaply
 * (see `rotateHue`) instead of hand-writing 10 near-identical values per theme.
 */
export type ShadeRamp = Record<ShadeKey, string>;

export const SHADE_KEYS: ShadeKey[] = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
];

/**
 * Tailwind v4's `emerald` and `amber` scales, verbatim.
 *
 * These are what the entire UI rendered *before* the theme ramps existed, so
 * reusing them as the Jungle defaults guarantees the default look is unchanged.
 */
const BASE_SURFACE_RAMP: ShadeRamp = {
  '50': 'oklch(97.9% 0.021 166.113)',
  '100': 'oklch(95% 0.052 163.051)',
  '200': 'oklch(90.5% 0.093 164.15)',
  '300': 'oklch(84.5% 0.143 164.978)',
  '400': 'oklch(76.5% 0.177 163.223)',
  '500': 'oklch(69.6% 0.17 162.48)',
  '600': 'oklch(59.6% 0.145 163.225)',
  '700': 'oklch(50.8% 0.118 165.612)',
  '800': 'oklch(43.2% 0.095 166.913)',
  '900': 'oklch(37.8% 0.077 168.94)',
  '950': 'oklch(26.2% 0.051 172.552)',
};

const BASE_ACCENT_RAMP: ShadeRamp = {
  '50': 'oklch(98.7% 0.022 95.277)',
  '100': 'oklch(96.2% 0.059 95.617)',
  '200': 'oklch(92.4% 0.12 95.746)',
  '300': 'oklch(87.9% 0.169 91.605)',
  '400': 'oklch(82.8% 0.189 84.429)',
  '500': 'oklch(76.9% 0.188 70.08)',
  '600': 'oklch(66.6% 0.179 58.318)',
  '700': 'oklch(55.5% 0.163 48.998)',
  '800': 'oklch(47.3% 0.137 46.201)',
  '900': 'oklch(41.4% 0.112 45.904)',
  '950': 'oklch(27.9% 0.077 45.635)',
};

const OKLCH_RE = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/;

/**
 * Rotates the hue of an `oklch()` ramp while preserving every step's
 * lightness and chroma, so the contrast relationships inside the ramp - and
 * therefore the whole UI's legibility - survive the theme change intact.
 */
function rotateHue(ramp: ShadeRamp, hue: number): ShadeRamp {
  const out = {} as ShadeRamp;
  for (const key of SHADE_KEYS) {
    const m = OKLCH_RE.exec(ramp[key]);
    out[key] = m ? `oklch(${m[1]}% ${m[2]} ${hue})` : ramp[key];
  }
  return out;
}

export interface ThemeRamps {
  /** Replaces Tailwind's `emerald-*` utilities (panels, chips, borders). */
  surface: ShadeRamp;
  /** Replaces Tailwind's `amber-*` utilities (accents, highlights, CTAs). */
  accent: ShadeRamp;
}

/** A slow-drifting ambient particle shown only on the board frame (C5). */
export interface AmbientMote {
  color: string;
  size: number;
  alpha: number;
  count: number;
  speed: number;
}

export interface BoardTheme {
  id: ThemeId;
  name: string;
  tagline: string;
  icon: string;
  /** Colours used for the small swatch chips. Mirrors `board`/`ui` exactly. */
  previewColors: {
    frame: string;
    tileDark: string;
    tileLight: string;
    accent: string;
  };
  ui: {
    bgGlow: string;
    panelBg: string;
    panelBorder: string;
    accent: string;
    accentGlow: string;
    btnBg: string;
    btnText: string;
    btnBorder: string;
    btnShadow: string;

    /* --- added: full ramps + structural chrome so the whole UI follows the theme --- */
    ramps: ThemeRamps;
    /** Page background behind the panels. */
    bodyBg: string;
    /** Modal scrim behind dialogs. */
    scrim: string;
    /** Soft drop shadow used by `.panel`. */
    shadow: string;
    /** Text-selection highlight. */
    selection: string;
    /** Colours driven by the `pulseGlow` keyframes. */
    pulseRing: string;
    pulseBlur: string;
    /**
     * Low-alpha accent glows for decorative box-shadows on selected cards and
     * buttons. Split by strength because the original UI used four different
     * alphas inline; folding them into one value would change the Jungle look.
     */
    ringGlowSoft: string;
    ringGlow: string;
    ringGlowStrong: string;
    /** Custom scrollbar track / thumb / thumb-hover. */
    scrollbarTrack: string;
    scrollbarThumb: string;
    scrollbarThumbHover: string;
    /** Confetti + firework palette (E1). */
    celebrate: string[];
    /** Colour of the dust puff and spark particles (E5). */
    particleDust: string;
    particleSpark: string;
    particleLadderSpark: string;
    particleSnakeSpark: string;
    /* --- 3D dice (J4) ---------------------------------------------------
     * The die used to be a hardcoded ivory cube with red pips in all five
     * themes, so it was the one object on screen that never changed with the
     * board. These four values replace the literals in `.die-face`/`.die-pip`
     * in index.css. Jungle's are the *exact* CSS that was there before, so the
     * default look is unchanged and the other four themes are a pure win. */
    /** Face fill (a gradient). */
    dieFace: string;
    /** Face border colour. */
    dieEdge: string;
    /** Inset shadow colour cast into the face. */
    dieInner: string;
    /** Pip fill (a gradient). */
    diePip: string;
    /* --- (V4) centre-screen toasts ---------------------------------------
     * The six big toasts ("LUCKY SIX!", "SNAKE BITE!", ...) were six
     * hardcoded jungle literals in App.tsx, so they stayed gold/red/mint on
     * the Cyber, Cosmic and Candy boards while everything around them
     * followed the theme. These are keyed by *semantic role*, not by hue, so
     * "reward" and "snake" keep their meaning in all five palettes.
     *
     * Jungle's values are the exact literals that were there before, so the
     * default look is unchanged. */
    toast: {
      /** Rewards: lucky six, golden ladder. */
      gold: string;
      /** Snake bite. */
      red: string;
      /** Bounced back off 100. */
      pink: string;
      /** Opening-turn announcement. */
      cyan: string;
      /** Neutral rules reminder. */
      info: string;
      /** Positive/green variant. */
      lime: string;
    };
  };
  board: {
    frameGrad: [string, string, string, string];
    framePattern: 'wood' | 'circuits' | 'sandstone' | 'stars' | 'frosting';
    /** Stroke/fill colours for `framePattern` (were hardcoded per theme). */
    framePatternColors: string[];
    bezelOuter: string;
    bezelInner: string;
    cornerType: 'brass' | 'cyber' | 'pharaoh' | 'astral' | 'peppermint';
    cornerColors: [string, string, string];
    /** Groove colour inside the 'brass' corner studs (was hardcoded to jungle). */
    cornerGroove: string;

    tileDark: string;
    tileLight: string;
    tileSheen: string;
    tileBorder: string;
    /** Strength of the fine per-tile grain overlay, 0 disables it (B2). */
    tileGrain: number;
    /** Colour of the soft inner shadow around the play area (C4). */
    vignette: string;
    /** Number of notch marks on the frame at the 25/50/75% bands (B4). */
    guideNotch: string;

    ladderStyle: 'wood' | 'neon' | 'gold' | 'starlight' | 'candycane';
    ladderRailCore: string;
    ladderRailPolish: string;
    ladderRailHighlight: string;
    ladderRailShadow: string;
    ladderRungColor: string;
    ladderRungShadow: string;
    ladderRungHighlight: string;
    ladderRivetColor: string;
    /** Ambient glow bled out behind the rails (C3). */
    ladderAmbientGlow: string;
    /** Extra glow colour for glow-heavy styles (was hardcoded to #818cf8). */
    ladderGlowColor: string;

    snakeStyle: 'natural' | 'cyber' | 'pharaoh' | 'cosmic' | 'gummy';
    snakePalette: [string, string][];
    snakeOutline: string;
    snakeDropShadow: string;
    snakeSpecular: string;
    /** Accent + glow used by the style-specific spine overlays. */
    snakeDetailA: string;
    snakeDetailB: string;
    snakeDetailGlow: string;
    /** Dark mouth colour when a snake is mid-bite (was hardcoded to #450a0a). */
    snakeMouth: string;
    eyeSclera: string;
    eyePupil: string;
    eyeScleraActive: string;
    eyePupilActive: string;
    tongueColor: string;
    activeTongueColor: string;
    activeAuraColor: string;

    podiumTitle: string;
    podiumSubtitle: string;
    podiumBgGrad: [string, string, string, string];
    podiumRibbonGrad: [string, string, string];
    podiumRibbonText: string;
    podiumCupColors: [string, string, string, string];
    podiumAura: string;
    podiumSunburst: string;

    startBayTitle: string;
    startBaySub: string;
    startBayBgGrad: [string, string, string];
    startBayBorder: string;
    startBayTitleBg: string;
    startBayTitleText: string;
    startBaySubText: string;
    startBayDockGrad: [string, string, string];

    numberBgSnake: string;
    numberBgLadder: string;
    numberBgNormal: string;
    numberBorderSnake: string;
    numberBorderLadder: string;
    numberBorderNormal: string;
    numberTextSnake: string;
    numberTextLadder: string;
    numberTextNormal: string;
    badgeLadderBg: string;
    badgeLadderBorder: string;
    badgeLadderText: string;
    badgeSnakeBg: string;
    badgeSnakeBorder: string;
    badgeSnakeText: string;

    /** Colour of the hover-inspection ring (was hardcoded to jungle amber). */
    hoverRing: string;
    hoverRingGlow: string;
    /** Drifting motes shown on the frame only, never over the play area. */
    ambientMote: AmbientMote;
  };
}

export const THEMES: Record<ThemeId, BoardTheme> = {
  jungle: {
    id: 'jungle',
    name: 'Jungle Safari',
    tagline: 'Lush rainforest, golden bamboo ladders, emerald tiles',
    icon: '🌴',
    previewColors: {
      frame: '#78350f',
      tileDark: '#0a3d31',
      tileLight: '#04241c',
      accent: '#fbbf24',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(251,191,36,0.16), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(7,60,44,0.5), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(17, 46, 35, 0.94), rgba(8, 24, 18, 0.94))',
      panelBorder: 'rgba(251, 191, 36, 0.18)',
      accent: '#fbbf24',
      accentGlow: 'rgba(251, 191, 36, 0.35)',
      btnBg: 'linear-gradient(180deg, #fde047 0%, #fbbf24 50%, #f59e0b 100%)',
      btnText: '#3a2302',
      btnBorder: '#b45309',
      btnShadow: 'rgba(251, 191, 36, 0.35)',

      ramps: { surface: BASE_SURFACE_RAMP, accent: BASE_ACCENT_RAMP },
      bodyBg: '#06120d',
      scrim: 'rgba(0, 0, 0, 0.8)',
      shadow: 'rgba(0, 0, 0, 0.35)',
      selection: 'rgba(251, 191, 36, 0.28)',
      pulseRing: 'rgba(251, 191, 36, 0.45)',
      pulseBlur: 'rgba(251, 191, 36, 0.28)',
      ringGlowSoft: 'rgba(251, 191, 36, 0.2)',
      ringGlow: 'rgba(251, 191, 36, 0.25)',
      ringGlowStrong: 'rgba(251, 191, 36, 0.3)',
      scrollbarTrack: 'rgba(6, 18, 13, 0.6)',
      scrollbarThumb: 'rgba(251, 191, 36, 0.25)',
      scrollbarThumbHover: 'rgba(251, 191, 36, 0.5)',
      celebrate: ['#fbbf24', '#22d3ee', '#f43f5e', '#a3e635', '#ffffff', '#fb923c', '#e879f9'],
      particleDust: '#a7f3d0',
      particleSpark: '#ffd75e',
      particleLadderSpark: '#fde047',
      particleSnakeSpark: '#f87171',
      /* (J4) Verbatim the pre-existing `.die-face` / `.die-pip` CSS. */
      dieFace: 'linear-gradient(145deg, #fffef7, #ede2c8)',
      dieEdge: '#d4c49b',
      dieInner: 'rgba(160, 120, 50, 0.32)',
      diePip: 'radial-gradient(circle at 35% 30%, #ef4444, #991b1b 75%, #7f1d1d)',
      /* (V4) Verbatim the six hardcoded literals from App.tsx's TOAST_COLORS. */
      toast: {
        gold: '#fbbf24',
        red: '#fb7185',
        pink: '#f9a8d4',
        cyan: '#67e8f9',
        info: '#a7f3d0',
        lime: '#a3e635',
      },
    },
    board: {
      frameGrad: ['#78350f', '#92400e', '#713f12', '#451a03'],
      framePattern: 'wood',
      framePatternColors: ['rgba(40, 20, 5, 0.22)'],
      bezelOuter: 'rgba(0, 0, 0, 0.65)',
      bezelInner: 'rgba(251, 191, 36, 0.45)',
      cornerType: 'brass',
      cornerColors: ['#fef08a', '#eab308', '#713f12'],
      cornerGroove: '#451a03',

      // (B1) The two jungle greens were only ~5 L* apart, so the checkerboard
      // was effectively invisible. The light tile is pushed darker (same hue
      // family, so the board stays exactly as dark and green as before) which
      // roughly doubles the separation.
      tileDark: '#0a3d31',
      tileLight: '#04241c',
      tileSheen: 'rgba(255, 255, 255, 0.08)',
      tileBorder: 'rgba(0, 0, 0, 0.45)',
      tileGrain: 0.035,
      vignette: 'rgba(0, 0, 0, 0.34)',
      guideNotch: 'rgba(251, 191, 36, 0.5)',

      ladderStyle: 'wood',
      ladderRailCore: '#4a2508',
      ladderRailPolish: '#d97706',
      ladderRailHighlight: 'rgba(254, 240, 138, 0.7)',
      ladderRailShadow: 'rgba(25, 12, 4, 0.75)',
      ladderRungColor: '#f59e0b',
      ladderRungShadow: 'rgba(25, 12, 4, 0.75)',
      ladderRungHighlight: '#fef08a',
      ladderRivetColor: '#fef08a',
      ladderAmbientGlow: 'rgba(217, 119, 6, 0.16)',
      ladderGlowColor: '#d97706',

      snakeStyle: 'natural',
      snakePalette: [
        ['#ef4444', '#7f1d1d'],
        ['#f97316', '#7c2d12'],
        ['#a3e635', '#3f6212'],
        ['#22d3ee', '#155e75'],
        ['#e879f9', '#701a75'],
        ['#facc15', '#854d0e'],
        ['#4ade80', '#14532d'],
        ['#fb7185', '#881337'],
        ['#38bdf8', '#075985'],
        ['#fbbf24', '#92400e'],
      ],
      snakeOutline: 'rgba(5, 25, 18, 0.95)',
      snakeDropShadow: 'rgba(2, 12, 8, 0.62)',
      snakeSpecular: 'rgba(255, 255, 255, 0.45)',
      snakeDetailA: 'rgba(255, 255, 255, 0.45)',
      snakeDetailB: 'rgba(255, 255, 255, 0.45)',
      snakeDetailGlow: 'rgba(255, 255, 255, 0)',
      snakeMouth: '#450a0a',
      eyeSclera: '#fef08a',
      eyePupil: '#111827',
      eyeScleraActive: '#fee2e2',
      eyePupilActive: '#ef4444',
      tongueColor: '#f43f5e',
      activeTongueColor: '#ef4444',
      activeAuraColor: '#ef4444',

      podiumTitle: '★ FINISH ★',
      podiumSubtitle: 'VICTORY PODIUM',
      podiumBgGrad: ['#fffbeb', '#fde047', '#d97706', '#78350f'],
      podiumRibbonGrad: ['#b91c1c', '#dc2626', '#991b1b'],
      podiumRibbonText: '★ FINISH ★',
      podiumCupColors: ['#d97706', '#fef08a', '#f59e0b', '#92400e'],
      podiumAura: 'rgba(255, 255, 255, 0.45)',
      podiumSunburst: 'rgba(255, 255, 255, 0.18)',

      startBayTitle: '★ START ★',
      startBaySub: 'BAY • SQ 0 ➔',
      startBayBgGrad: ['#2d1307', '#451a03', '#1e0b04'],
      startBayBorder: 'rgba(251, 191, 36, 0.85)',
      startBayTitleBg: 'rgba(6, 26, 18, 0.94)',
      startBayTitleText: '#fde047',
      startBaySubText: '#86efac',
      startBayDockGrad: ['#040d08', '#0a1d14', '#1b3527'],

      numberBgSnake: 'rgba(40, 10, 14, 0.92)',
      numberBgLadder: 'rgba(14, 36, 18, 0.92)',
      numberBgNormal: 'rgba(6, 22, 16, 0.86)',
      numberBorderSnake: 'rgba(239, 68, 68, 0.65)',
      numberBorderLadder: 'rgba(245, 158, 11, 0.65)',
      numberBorderNormal: 'rgba(251, 191, 36, 0.35)',
      numberTextSnake: '#fee2e2',
      numberTextLadder: '#fef08a',
      numberTextNormal: '#fef9c3',
      badgeLadderBg: 'rgba(15, 23, 42, 0.88)',
      badgeLadderBorder: '#f59e0b',
      badgeLadderText: '#fde047',
      badgeSnakeBg: 'rgba(15, 23, 42, 0.88)',
      badgeSnakeBorder: '#ef4444',
      badgeSnakeText: '#f87171',

      hoverRing: 'rgba(251, 191, 36, 1)',
      hoverRingGlow: '#f59e0b',
      ambientMote: { color: '#a3e635', size: 2.2, alpha: 0.5, count: 16, speed: 0.06 },
    },
  },

  cyber: {
    id: 'cyber',
    name: 'Cyber Neon',
    tagline: 'Synthwave matrix, holographic energy bridges, cyber data-serpents',
    icon: '⚡',
    previewColors: {
      frame: '#0f172a',
      tileDark: '#0c1633',
      tileLight: '#060b1b',
      accent: '#06b6d4',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(6,182,212,0.24), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(236,72,153,0.22), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(15,23,42,0.85), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(14, 23, 48, 0.95), rgba(7, 12, 26, 0.95))',
      panelBorder: 'rgba(6, 182, 212, 0.3)',
      accent: '#06b6d4',
      accentGlow: 'rgba(6, 182, 212, 0.45)',
      btnBg: 'linear-gradient(180deg, #67e8f9 0%, #06b6d4 50%, #0891b2 100%)',
      btnText: '#04202c',
      btnBorder: '#0e7490',
      btnShadow: 'rgba(6, 182, 212, 0.42)',

      ramps: {
        surface: rotateHue(BASE_SURFACE_RAMP, 268),
        accent: rotateHue(BASE_ACCENT_RAMP, 205),
      },
      bodyBg: '#04060f',
      scrim: 'rgba(0, 0, 0, 0.82)',
      shadow: 'rgba(0, 0, 0, 0.45)',
      selection: 'rgba(6, 182, 212, 0.32)',
      pulseRing: 'rgba(6, 182, 212, 0.5)',
      pulseBlur: 'rgba(6, 182, 212, 0.32)',
      ringGlowSoft: 'rgba(6, 182, 212, 0.2)',
      ringGlow: 'rgba(6, 182, 212, 0.25)',
      ringGlowStrong: 'rgba(6, 182, 212, 0.3)',
      scrollbarTrack: 'rgba(2, 6, 23, 0.7)',
      scrollbarThumb: 'rgba(6, 182, 212, 0.32)',
      scrollbarThumbHover: 'rgba(6, 182, 212, 0.6)',
      celebrate: ['#67e8f9', '#06b6d4', '#ec4899', '#a855f7', '#ffffff', '#38bdf8', '#f472b6'],
      particleDust: '#a5f3fc',
      particleSpark: '#67e8f9',
      particleLadderSpark: '#a5f3fc',
      particleSnakeSpark: '#ec4899',
      /* (J4) Holographic cyan face with neon-magenta pips - the synthwave
         counterpart to the board's pink/cyan serpents. */
      dieFace: 'linear-gradient(145deg, #ecfeff, #a5f3fc)',
      dieEdge: '#0e7490',
      dieInner: 'rgba(8, 145, 178, 0.34)',
      diePip: 'radial-gradient(circle at 35% 30%, #f472b6, #be185d 75%, #4c0519)',
      /* (V4) Synthwave cyan "reward", neon magenta "snake". */
      toast: {
        gold: '#67e8f9',
        red: '#f472b6',
        pink: '#ec4899',
        cyan: '#22d3ee',
        info: '#a5f3fc',
        lime: '#4ade80',
      },
    },
    board: {
      frameGrad: ['#090d16', '#1e1b4b', '#0f172a', '#020617'],
      framePattern: 'circuits',
      framePatternColors: ['rgba(6, 182, 212, 0.28)', 'rgba(236, 72, 153, 0.5)'],
      bezelOuter: 'rgba(0, 0, 0, 0.85)',
      bezelInner: 'rgba(6, 182, 212, 0.65)',
      cornerType: 'cyber',
      cornerColors: ['#a5f3fc', '#06b6d4', '#0e7490'],
      cornerGroove: '#0e7490',

      // Left at the original pair: measured L* separation is already ~7 here
      // (the cyan tileBorder does the rest of the work), and nudging the light
      // tile darker was measured to make it *worse*.
      tileDark: '#0c1633',
      tileLight: '#060b1b',
      tileSheen: 'rgba(6, 182, 212, 0.12)',
      tileBorder: 'rgba(6, 182, 212, 0.28)',
      tileGrain: 0.03,
      vignette: 'rgba(0, 0, 0, 0.45)',
      guideNotch: 'rgba(6, 182, 212, 0.6)',

      ladderStyle: 'neon',
      ladderRailCore: '#0891b2',
      ladderRailPolish: '#06b6d4',
      ladderRailHighlight: 'rgba(165, 243, 252, 0.95)',
      ladderRailShadow: 'rgba(6, 182, 212, 0.45)',
      ladderRungColor: '#38bdf8',
      ladderRungShadow: 'rgba(14, 116, 144, 0.6)',
      ladderRungHighlight: '#cffafe',
      ladderRivetColor: '#ec4899',
      ladderAmbientGlow: 'rgba(6, 182, 212, 0.22)',
      ladderGlowColor: '#06b6d4',

      snakeStyle: 'cyber',
      snakePalette: [
        ['#ec4899', '#831843'],
        ['#a855f7', '#581c87'],
        ['#06b6d4', '#155e75'],
        ['#f43f5e', '#881337'],
        ['#3b82f6', '#1e3a8a'],
        ['#10b981', '#064e3b'],
        ['#f59e0b', '#78350f'],
        ['#e879f9', '#701a75'],
      ],
      snakeOutline: 'rgba(2, 6, 23, 0.98)',
      snakeDropShadow: 'rgba(6, 182, 212, 0.45)',
      snakeSpecular: 'rgba(236, 72, 153, 0.7)',
      snakeDetailA: '#67e8f9',
      snakeDetailB: '#ec4899',
      snakeDetailGlow: '#06b6d4',
      snakeMouth: '#1e0b2e',
      eyeSclera: '#67e8f9',
      eyePupil: '#020617',
      eyeScleraActive: '#f43f5e',
      eyePupilActive: '#ffffff',
      tongueColor: '#06b6d4',
      activeTongueColor: '#f43f5e',
      activeAuraColor: '#06b6d4',

      podiumTitle: '★ SINGULARITY ★',
      podiumSubtitle: 'QUANTUM PODIUM',
      podiumBgGrad: ['#cffafe', '#06b6d4', '#6366f1', '#1e1b4b'],
      podiumRibbonGrad: ['#831843', '#ec4899', '#be185d'],
      podiumRibbonText: '★ SINGULARITY ★',
      podiumCupColors: ['#06b6d4', '#a5f3fc', '#8b5cf6', '#312e81'],
      podiumAura: 'rgba(165, 243, 252, 0.45)',
      podiumSunburst: 'rgba(255, 255, 255, 0.2)',

      startBayTitle: '★ CYBER BAY ★',
      startBaySub: 'GRID • SQ 0 ➔',
      startBayBgGrad: ['#061126', '#0d1e3d', '#040b1a'],
      startBayBorder: 'rgba(6, 182, 212, 0.85)',
      startBayTitleBg: 'rgba(2, 8, 20, 0.95)',
      startBayTitleText: '#67e8f9',
      startBaySubText: '#f472b6',
      startBayDockGrad: ['#020617', '#08142c', '#0f2952'],

      numberBgSnake: 'rgba(38, 8, 24, 0.94)',
      numberBgLadder: 'rgba(8, 32, 45, 0.94)',
      numberBgNormal: 'rgba(4, 14, 28, 0.9)',
      numberBorderSnake: 'rgba(236, 72, 153, 0.75)',
      numberBorderLadder: 'rgba(6, 182, 212, 0.75)',
      numberBorderNormal: 'rgba(6, 182, 212, 0.35)',
      numberTextSnake: '#fbcfe8',
      numberTextLadder: '#a5f3fc',
      numberTextNormal: '#e0f2fe',
      badgeLadderBg: 'rgba(3, 15, 30, 0.9)',
      badgeLadderBorder: '#06b6d4',
      badgeLadderText: '#67e8f9',
      badgeSnakeBg: 'rgba(30, 5, 20, 0.9)',
      badgeSnakeBorder: '#ec4899',
      badgeSnakeText: '#f472b6',

      hoverRing: 'rgba(6, 182, 212, 1)',
      hoverRingGlow: '#06b6d4',
      ambientMote: { color: '#67e8f9', size: 1.8, alpha: 0.55, count: 20, speed: 0.09 },
    },
  },

  desert: {
    id: 'desert',
    name: 'Desert Pharaoh',
    tagline: 'Warm sandstone, royal lapis lazuli, golden cobras & ancient obelisks',
    icon: '🏛️',
    previewColors: {
      frame: '#92400e',
      tileDark: '#351f0b',
      tileLight: '#0f1a30',
      accent: '#f59e0b',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(245,158,11,0.22), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(37,99,235,0.2), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(46,24,6,0.65), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(46, 27, 10, 0.95), rgba(24, 14, 5, 0.95))',
      panelBorder: 'rgba(245, 158, 11, 0.28)',
      accent: '#f59e0b',
      accentGlow: 'rgba(245, 158, 11, 0.4)',
      btnBg: 'linear-gradient(180deg, #fde68a 0%, #f59e0b 50%, #d97706 100%)',
      btnText: '#3b1d03',
      btnBorder: '#92400e',
      btnShadow: 'rgba(245, 158, 11, 0.38)',

      ramps: {
        surface: rotateHue(BASE_SURFACE_RAMP, 62),
        accent: rotateHue(BASE_ACCENT_RAMP, 70),
      },
      bodyBg: '#140c04',
      scrim: 'rgba(12, 6, 2, 0.82)',
      shadow: 'rgba(0, 0, 0, 0.42)',
      selection: 'rgba(245, 158, 11, 0.3)',
      pulseRing: 'rgba(245, 158, 11, 0.48)',
      pulseBlur: 'rgba(245, 158, 11, 0.3)',
      ringGlowSoft: 'rgba(245, 158, 11, 0.2)',
      ringGlow: 'rgba(245, 158, 11, 0.25)',
      ringGlowStrong: 'rgba(245, 158, 11, 0.3)',
      scrollbarTrack: 'rgba(24, 14, 5, 0.7)',
      scrollbarThumb: 'rgba(245, 158, 11, 0.3)',
      scrollbarThumbHover: 'rgba(245, 158, 11, 0.58)',
      celebrate: ['#fbbf24', '#fde68a', '#f97316', '#38bdf8', '#ffffff', '#fbbf24', '#fdba74'],
      particleDust: '#fde68a',
      particleSpark: '#fbbf24',
      particleLadderSpark: '#fde68a',
      particleSnakeSpark: '#fb923c',
      /* (J4) Sun-bleached sandstone face with lapis lazuli pips, matching the
         board's brown/lapis tomb palette. */
      dieFace: 'linear-gradient(145deg, #fffbeb, #fcd9a4)',
      dieEdge: '#b45309',
      dieInner: 'rgba(180, 83, 9, 0.3)',
      diePip: 'radial-gradient(circle at 35% 30%, #60a5fa, #1d4ed8 75%, #1e3a8a)',
      /* (V4) Sunlit gold "reward", lapis blue for neutral reads. */
      toast: {
        gold: '#fbbf24',
        red: '#fca5a5',
        pink: '#fdba74',
        cyan: '#60a5fa',
        info: '#bae6fd',
        lime: '#84cc16',
      },
    },
    board: {
      frameGrad: ['#78350f', '#b45309', '#92400e', '#451a03'],
      framePattern: 'sandstone',
      framePatternColors: ['rgba(245, 158, 11, 0.18)'],
      bezelOuter: 'rgba(30, 15, 5, 0.85)',
      bezelInner: 'rgba(245, 158, 11, 0.6)',
      cornerType: 'pharaoh',
      cornerColors: ['#fde68a', '#f59e0b', '#1d4ed8'],
      cornerGroove: '#451a03',

      // (B1) `tileDark` (#351f0b) and `tileLight` (#192841) were within 1 L* of
      // each other, so the checker was invisible. The lapis-blue tile is pushed
      // darker instead, preserving the brown/blue "tomb" pairing.
      tileDark: '#351f0b',
      tileLight: '#0f1a30',
      tileSheen: 'rgba(253, 230, 138, 0.12)',
      tileBorder: 'rgba(217, 119, 6, 0.35)',
      tileGrain: 0.045,
      vignette: 'rgba(0, 0, 0, 0.4)',
      guideNotch: 'rgba(245, 158, 11, 0.55)',

      ladderStyle: 'gold',
      ladderRailCore: '#78350f',
      ladderRailPolish: '#d97706',
      ladderRailHighlight: 'rgba(254, 240, 138, 0.85)',
      ladderRailShadow: 'rgba(30, 15, 5, 0.75)',
      ladderRungColor: '#fbbf24',
      ladderRungShadow: 'rgba(30, 15, 5, 0.65)',
      ladderRungHighlight: '#fde68a',
      ladderRivetColor: '#2563eb',
      ladderAmbientGlow: 'rgba(251, 191, 36, 0.18)',
      ladderGlowColor: '#d97706',

      snakeStyle: 'pharaoh',
      snakePalette: [
        ['#d97706', '#451a03'],
        ['#2563eb', '#1e3a8a'],
        ['#0d9488', '#134e4a'],
        ['#dc2626', '#7f1d1d'],
        ['#eab308', '#713f12'],
        ['#9333ea', '#581c87'],
        ['#f97316', '#7c2d12'],
      ],
      snakeOutline: 'rgba(30, 15, 5, 0.95)',
      snakeDropShadow: 'rgba(30, 15, 5, 0.6)',
      snakeSpecular: 'rgba(254, 240, 138, 0.6)',
      snakeDetailA: '#fbbf24',
      snakeDetailB: '#2563eb',
      snakeDetailGlow: 'rgba(0, 0, 0, 0)',
      snakeMouth: '#450a0a',
      eyeSclera: '#fef08a',
      eyePupil: '#7f1d1d',
      eyeScleraActive: '#fee2e2',
      eyePupilActive: '#dc2626',
      tongueColor: '#dc2626',
      activeTongueColor: '#b91c1c',
      activeAuraColor: '#f59e0b',

      podiumTitle: '★ RA TEMPLE ★',
      podiumSubtitle: 'PHARAOH PYRAMID',
      podiumBgGrad: ['#fef3c7', '#fde047', '#d97706', '#78350f'],
      podiumRibbonGrad: ['#1e3a8a', '#2563eb', '#1d4ed8'],
      podiumRibbonText: '★ RA ASCENT ★',
      podiumCupColors: ['#d97706', '#fef08a', '#2563eb', '#78350f'],
      podiumAura: 'rgba(254, 240, 138, 0.45)',
      podiumSunburst: 'rgba(255, 255, 255, 0.2)',

      startBayTitle: '★ SUN GATE ★',
      startBaySub: 'TOMB • SQ 0 ➔',
      startBayBgGrad: ['#3b1b05', '#552508', '#241003'],
      startBayBorder: 'rgba(245, 158, 11, 0.85)',
      startBayTitleBg: 'rgba(20, 10, 3, 0.95)',
      startBayTitleText: '#fde047',
      startBaySubText: '#60a5fa',
      startBayDockGrad: ['#0c1a2e', '#132847', '#1e3d6b'],

      numberBgSnake: 'rgba(42, 12, 10, 0.94)',
      numberBgLadder: 'rgba(12, 28, 48, 0.94)',
      numberBgNormal: 'rgba(26, 15, 6, 0.9)',
      numberBorderSnake: 'rgba(220, 38, 38, 0.7)',
      numberBorderLadder: 'rgba(245, 158, 11, 0.7)',
      numberBorderNormal: 'rgba(245, 158, 11, 0.35)',
      numberTextSnake: '#fee2e2',
      numberTextLadder: '#fef08a',
      numberTextNormal: '#fef3c7',
      badgeLadderBg: 'rgba(10, 22, 40, 0.9)',
      badgeLadderBorder: '#f59e0b',
      badgeLadderText: '#fde68a',
      badgeSnakeBg: 'rgba(35, 10, 10, 0.9)',
      badgeSnakeBorder: '#dc2626',
      badgeSnakeText: '#fca5a5',

      hoverRing: 'rgba(245, 158, 11, 1)',
      hoverRingGlow: '#f59e0b',
      ambientMote: { color: '#fde68a', size: 2, alpha: 0.4, count: 18, speed: 0.05 },
    },
  },

  cosmic: {
    id: 'cosmic',
    name: 'Cosmic Galaxy',
    tagline: 'Deep space nebulas, pulsar starlight beams, celestial star serpents',
    icon: '🌌',
    previewColors: {
      frame: '#1e1b4b',
      tileDark: '#181442',
      tileLight: '#070518',
      accent: '#8b5cf6',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(139,92,246,0.25), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(56,189,248,0.22), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(15,23,42,0.85), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(22, 18, 52, 0.95), rgba(9, 7, 26, 0.95))',
      panelBorder: 'rgba(139, 92, 246, 0.32)',
      accent: '#8b5cf6',
      accentGlow: 'rgba(139, 92, 246, 0.45)',
      btnBg: 'linear-gradient(180deg, #c4b5fd 0%, #8b5cf6 50%, #6366f1 100%)',
      btnText: '#190533',
      btnBorder: '#4f46e5',
      btnShadow: 'rgba(139, 92, 246, 0.42)',

      ramps: {
        surface: rotateHue(BASE_SURFACE_RAMP, 288),
        accent: rotateHue(BASE_ACCENT_RAMP, 295),
      },
      bodyBg: '#050417',
      scrim: 'rgba(3, 2, 14, 0.84)',
      shadow: 'rgba(0, 0, 0, 0.5)',
      selection: 'rgba(139, 92, 246, 0.34)',
      pulseRing: 'rgba(139, 92, 246, 0.5)',
      pulseBlur: 'rgba(139, 92, 246, 0.32)',
      ringGlowSoft: 'rgba(139, 92, 246, 0.2)',
      ringGlow: 'rgba(139, 92, 246, 0.25)',
      ringGlowStrong: 'rgba(139, 92, 246, 0.3)',
      scrollbarTrack: 'rgba(9, 7, 26, 0.75)',
      scrollbarThumb: 'rgba(139, 92, 246, 0.34)',
      scrollbarThumbHover: 'rgba(139, 92, 246, 0.62)',
      celebrate: ['#c4b5fd', '#a78bfa', '#38bdf8', '#f472b6', '#ffffff', '#818cf8', '#f0abfc'],
      particleDust: '#c4b5fd',
      particleSpark: '#c4b5fd',
      particleLadderSpark: '#bae6fd',
      particleSnakeSpark: '#f472b6',
      /* (J4) Pale starlight face with violet pips. */
      dieFace: 'linear-gradient(145deg, #eef2ff, #a5b4fc)',
      dieEdge: '#4338ca',
      dieInner: 'rgba(67, 56, 202, 0.32)',
      diePip: 'radial-gradient(circle at 35% 30%, #e879f9, #7c3aed 75%, #2e1065)',
      /* (V4) Starlight violet "reward", pulsar blue for neutral reads. */
      toast: {
        gold: '#c4b5fd',
        red: '#fda4af',
        pink: '#f0abfc',
        cyan: '#38bdf8',
        info: '#e0e7ff',
        lime: '#34d399',
      },
    },
    board: {
      frameGrad: ['#030712', '#1e1b4b', '#0f172a', '#020617'],
      framePattern: 'stars',
      framePatternColors: ['#38bdf8', '#c084fc', '#ffffff'],
      bezelOuter: 'rgba(0, 0, 0, 0.85)',
      bezelInner: 'rgba(139, 92, 246, 0.55)',
      cornerType: 'astral',
      cornerColors: ['#e0e7ff', '#818cf8', '#312e81'],
      cornerGroove: '#312e81',

      // (B1) Lifted the indigo tile so the starfield checker reads against the
      // near-black violet tile.
      tileDark: '#181442',
      tileLight: '#070518',
      tileSheen: 'rgba(139, 92, 246, 0.14)',
      tileBorder: 'rgba(129, 140, 248, 0.28)',
      tileGrain: 0.025,
      vignette: 'rgba(0, 0, 0, 0.48)',
      guideNotch: 'rgba(139, 92, 246, 0.6)',

      ladderStyle: 'starlight',
      ladderRailCore: '#4338ca',
      ladderRailPolish: '#6366f1',
      ladderRailHighlight: 'rgba(224, 231, 255, 0.92)',
      ladderRailShadow: 'rgba(79, 70, 229, 0.45)',
      ladderRungColor: '#38bdf8',
      ladderRungShadow: 'rgba(30, 27, 75, 0.7)',
      ladderRungHighlight: '#bae6fd',
      ladderRivetColor: '#c084fc',
      ladderAmbientGlow: 'rgba(129, 140, 248, 0.22)',
      ladderGlowColor: '#818cf8',

      snakeStyle: 'cosmic',
      snakePalette: [
        ['#8b5cf6', '#3b0764'],
        ['#06b6d4', '#164e63'],
        ['#f43f5e', '#881337'],
        ['#6366f1', '#1e1b4b'],
        ['#ec4899', '#701a75'],
        ['#10b981', '#022c22'],
        ['#f59e0b', '#78350f'],
      ],
      snakeOutline: 'rgba(3, 7, 18, 0.98)',
      snakeDropShadow: 'rgba(99, 102, 241, 0.45)',
      snakeSpecular: 'rgba(224, 231, 255, 0.75)',
      snakeDetailA: '#ffffff',
      snakeDetailB: '#c084fc',
      snakeDetailGlow: '#8b5cf6',
      snakeMouth: '#1e0b2e',
      eyeSclera: '#e0e7ff',
      eyePupil: '#030712',
      eyeScleraActive: '#f43f5e',
      eyePupilActive: '#ffffff',
      tongueColor: '#38bdf8',
      activeTongueColor: '#f43f5e',
      activeAuraColor: '#8b5cf6',

      podiumTitle: '★ SUPERNOVA ★',
      podiumSubtitle: 'ASTRAL PODIUM',
      podiumBgGrad: ['#f5f3ff', '#c084fc', '#6366f1', '#1e1b4b'],
      podiumRibbonGrad: ['#312e81', '#4f46e5', '#3730a3'],
      podiumRibbonText: '★ SUPERNOVA ★',
      podiumCupColors: ['#6366f1', '#e0e7ff', '#a855f7', '#1e1b4b'],
      podiumAura: 'rgba(224, 231, 255, 0.45)',
      podiumSunburst: 'rgba(255, 255, 255, 0.22)',

      startBayTitle: '★ LAUNCH BAY ★',
      startBaySub: 'ORBIT • SQ 0 ➔',
      startBayBgGrad: ['#0a0824', '#14113b', '#060416'],
      startBayBorder: 'rgba(139, 92, 246, 0.85)',
      startBayTitleBg: 'rgba(3, 2, 14, 0.95)',
      startBayTitleText: '#c4b5fd',
      startBaySubText: '#38bdf8',
      startBayDockGrad: ['#040312', '#0c0a2a', '#171447'],

      numberBgSnake: 'rgba(36, 10, 36, 0.94)',
      numberBgLadder: 'rgba(14, 18, 50, 0.94)',
      numberBgNormal: 'rgba(10, 8, 28, 0.9)',
      numberBorderSnake: 'rgba(244, 63, 94, 0.7)',
      numberBorderLadder: 'rgba(139, 92, 246, 0.7)',
      numberBorderNormal: 'rgba(129, 140, 248, 0.35)',
      numberTextSnake: '#fecdd3',
      numberTextLadder: '#e0e7ff',
      numberTextNormal: '#f5f3ff',
      badgeLadderBg: 'rgba(12, 14, 42, 0.9)',
      badgeLadderBorder: '#8b5cf6',
      badgeLadderText: '#c4b5fd',
      badgeSnakeBg: 'rgba(32, 8, 30, 0.9)',
      badgeSnakeBorder: '#f43f5e',
      badgeSnakeText: '#fda4af',

      hoverRing: 'rgba(139, 92, 246, 1)',
      hoverRingGlow: '#8b5cf6',
      ambientMote: { color: '#c4b5fd', size: 1.6, alpha: 0.6, count: 24, speed: 0.04 },
    },
  },

  candy: {
    id: 'candy',
    name: 'Candy Kingdom',
    tagline: 'Chocolate cookie frame, peppermint ladders, rainbow gummy worms',
    icon: '🍭',
    previewColors: {
      frame: '#5c2c16',
      tileDark: '#401627',
      tileLight: '#0b1f1c',
      accent: '#f43f5e',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(244,63,94,0.22), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(52,211,153,0.2), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(46,16,30,0.65), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(48, 18, 32, 0.95), rgba(26, 9, 18, 0.95))',
      panelBorder: 'rgba(244, 63, 94, 0.3)',
      accent: '#f43f5e',
      accentGlow: 'rgba(244, 63, 94, 0.45)',
      btnBg: 'linear-gradient(180deg, #fda4af 0%, #f43f5e 50%, #e11d48 100%)',
      btnText: '#3d0315',
      btnBorder: '#be185d',
      btnShadow: 'rgba(244, 63, 94, 0.42)',

      ramps: {
        surface: rotateHue(BASE_SURFACE_RAMP, 352),
        accent: rotateHue(BASE_ACCENT_RAMP, 12),
      },
      bodyBg: '#1a0a10',
      scrim: 'rgba(20, 6, 12, 0.82)',
      shadow: 'rgba(0, 0, 0, 0.4)',
      selection: 'rgba(244, 63, 94, 0.3)',
      pulseRing: 'rgba(244, 63, 94, 0.48)',
      pulseBlur: 'rgba(244, 63, 94, 0.3)',
      ringGlowSoft: 'rgba(244, 63, 94, 0.2)',
      ringGlow: 'rgba(244, 63, 94, 0.25)',
      ringGlowStrong: 'rgba(244, 63, 94, 0.3)',
      scrollbarTrack: 'rgba(26, 9, 18, 0.7)',
      scrollbarThumb: 'rgba(244, 63, 94, 0.32)',
      scrollbarThumbHover: 'rgba(244, 63, 94, 0.6)',
      celebrate: ['#fda4af', '#f43f5e', '#fbbf24', '#34d399', '#ffffff', '#fb7185', '#a78bfa'],
      particleDust: '#fecdd3',
      particleSpark: '#fda4af',
      particleLadderSpark: '#fde68a',
      particleSnakeSpark: '#fb7185',
      /* (J4) Icing face with mint pips - the sweet counterpart to the
         berry/mint board. */
      dieFace: 'linear-gradient(145deg, #fff1f2, #fecdd3)',
      dieEdge: '#be185d',
      dieInner: 'rgba(190, 24, 93, 0.28)',
      diePip: 'radial-gradient(circle at 35% 30%, #34d399, #059669 75%, #064e3b)',
      /* (V4) Butterscotch "reward", mint for neutral reads. */
      toast: {
        gold: '#fbbf24',
        red: '#fda4af',
        pink: '#f9a8d4',
        cyan: '#67e8f9',
        info: '#a7f3d0',
        lime: '#4ade80',
      },
    },
    board: {
      frameGrad: ['#5c2c16', '#78350f', '#451a03', '#2d1205'],
      framePattern: 'frosting',
      framePatternColors: ['#f43f5e', '#34d399', '#38bdf8', '#fbbf24', '#ffffff'],
      bezelOuter: 'rgba(30, 10, 5, 0.85)',
      bezelInner: 'rgba(251, 146, 60, 0.55)',
      cornerType: 'peppermint',
      cornerColors: ['#ffffff', '#ef4444', '#b91c1c'],
      cornerGroove: '#b91c1c',

      // (B1) The plum and mint tiles were only ~1 L* apart, so the checker read
      // as noise. Both are nudged apart while keeping the berry/mint pairing.
      tileDark: '#401627',
      tileLight: '#0b1f1c',
      tileSheen: 'rgba(255, 255, 255, 0.12)',
      tileBorder: 'rgba(244, 63, 94, 0.3)',
      tileGrain: 0.03,
      vignette: 'rgba(0, 0, 0, 0.4)',
      guideNotch: 'rgba(244, 63, 94, 0.55)',

      ladderStyle: 'candycane',
      ladderRailCore: '#dc2626',
      ladderRailPolish: '#ef4444',
      ladderRailHighlight: 'rgba(255, 255, 255, 0.95)',
      ladderRailShadow: 'rgba(60, 15, 10, 0.7)',
      ladderRungColor: '#fbbf24',
      ladderRungShadow: 'rgba(60, 15, 10, 0.6)',
      ladderRungHighlight: '#fef08a',
      ladderRivetColor: '#ec4899',
      ladderAmbientGlow: 'rgba(239, 68, 68, 0.2)',
      ladderGlowColor: '#ef4444',

      snakeStyle: 'gummy',
      snakePalette: [
        ['#f43f5e', '#881337'],
        ['#10b981', '#064e3b'],
        ['#06b6d4', '#155e75'],
        ['#f59e0b', '#78350f'],
        ['#a855f7', '#581c87'],
        ['#fb7185', '#9f1239'],
        ['#eab308', '#713f12'],
      ],
      snakeOutline: 'rgba(35, 10, 20, 0.95)',
      snakeDropShadow: 'rgba(244, 63, 94, 0.35)',
      snakeSpecular: 'rgba(255, 255, 255, 0.65)',
      snakeDetailA: 'rgba(255, 255, 255, 0.7)',
      snakeDetailB: 'rgba(251, 191, 36, 0.7)',
      snakeDetailGlow: 'rgba(0, 0, 0, 0)',
      snakeMouth: '#4c0519',
      eyeSclera: '#fff1f2',
      eyePupil: '#381324',
      eyeScleraActive: '#fee2e2',
      eyePupilActive: '#dc2626',
      tongueColor: '#fb7185',
      activeTongueColor: '#ef4444',
      activeAuraColor: '#f43f5e',

      podiumTitle: '★ SWEET CROWN ★',
      podiumSubtitle: 'CANDY PODIUM',
      podiumBgGrad: ['#fff1f2', '#fda4af', '#f43f5e', '#9f1239'],
      podiumRibbonGrad: ['#9d174d', '#db2777', '#be185d'],
      podiumRibbonText: '★ SWEET CROWN ★',
      podiumCupColors: ['#f43f5e', '#fff1f2', '#fbbf24', '#881337'],
      podiumAura: 'rgba(255, 241, 242, 0.45)',
      podiumSunburst: 'rgba(255, 255, 255, 0.2)',

      startBayTitle: '★ SWEET START ★',
      startBaySub: 'TRAY • SQ 0 ➔',
      startBayBgGrad: ['#351421', '#4d1c30', '#260c17'],
      startBayBorder: 'rgba(244, 63, 94, 0.85)',
      startBayTitleBg: 'rgba(20, 6, 12, 0.95)',
      startBayTitleText: '#fda4af',
      startBaySubText: '#6ee7b7',
      startBayDockGrad: ['#12060b', '#240c17', '#3d1627'],

      numberBgSnake: 'rgba(46, 14, 28, 0.94)',
      numberBgLadder: 'rgba(14, 38, 32, 0.94)',
      numberBgNormal: 'rgba(28, 10, 18, 0.9)',
      numberBorderSnake: 'rgba(244, 63, 94, 0.7)',
      numberBorderLadder: 'rgba(52, 211, 153, 0.7)',
      numberBorderNormal: 'rgba(244, 63, 94, 0.35)',
      numberTextSnake: '#ffe4e6',
      numberTextLadder: '#d1fae5',
      numberTextNormal: '#fff1f2',
      badgeLadderBg: 'rgba(10, 30, 25, 0.9)',
      badgeLadderBorder: '#34d399',
      badgeLadderText: '#a7f3d0',
      badgeSnakeBg: 'rgba(38, 10, 22, 0.9)',
      badgeSnakeBorder: '#f43f5e',
      badgeSnakeText: '#fda4af',

      hoverRing: 'rgba(244, 63, 94, 1)',
      hoverRingGlow: '#f43f5e',
      ambientMote: { color: '#fda4af', size: 2.4, alpha: 0.45, count: 18, speed: 0.05 },
    },
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'jungle';

/**
 * Builds the complete set of `--theme-*` custom properties for a theme.
 *
 * These are injected onto the app root in App.tsx and consumed by:
 *   - `index.css` (`.panel`, `.btn-theme`, scrollbar, selection, keyframes)
 *   - the `@theme inline` remap, which repoints Tailwind's `emerald-*` and
 *     `amber-*` utilities at the surface/accent ramps.
 */
export function themeCssVars(theme: BoardTheme): Record<string, string> {
  const ui = theme.ui;
  const vars: Record<string, string> = {
    '--theme-panel-bg': ui.panelBg,
    '--theme-panel-border': ui.panelBorder,
    '--theme-accent': ui.accent,
    '--theme-accent-glow': ui.accentGlow,
    '--theme-btn-bg': ui.btnBg,
    '--theme-btn-text': ui.btnText,
    '--theme-btn-border': ui.btnBorder,
    '--theme-btn-shadow': ui.btnShadow,
    '--theme-btn-glow': ui.btnShadow,
    '--theme-body-bg': ui.bodyBg,
    '--theme-scrim': ui.scrim,
    '--theme-shadow': ui.shadow,
    '--theme-selection': ui.selection,
    '--theme-pulse-ring': ui.pulseRing,
    '--theme-pulse-blur': ui.pulseBlur,
    '--theme-glow-soft': ui.ringGlowSoft,
    '--theme-glow': ui.ringGlow,
    '--theme-glow-strong': ui.ringGlowStrong,
    '--theme-scrollbar-track': ui.scrollbarTrack,
    '--theme-scrollbar-thumb': ui.scrollbarThumb,
    '--theme-scrollbar-thumb-hover': ui.scrollbarThumbHover,
    /* (J4) 3D dice. */
    '--theme-die-face': ui.dieFace,
    '--theme-die-edge': ui.dieEdge,
    '--theme-die-inner': ui.dieInner,
    '--theme-die-pip': ui.diePip,
    /* (V4) Centre-screen toasts. */
    '--theme-toast-gold': ui.toast.gold,
    '--theme-toast-red': ui.toast.red,
    '--theme-toast-pink': ui.toast.pink,
    '--theme-toast-cyan': ui.toast.cyan,
    '--theme-toast-info': ui.toast.info,
    '--theme-toast-lime': ui.toast.lime,
    /* (V13) The little snake glyph in the wordmark. It was hardcoded to
       `text-red-400`, which put a red snake next to a cyan/violet/pink board.
       Reusing the board's own snake-badge colour keeps the "red = snake"
       *semantics* while letting each palette speak for itself. Jungle's is
       #f87171, which is exactly what `text-red-400` resolved to. */
    '--theme-snake-glyph': theme.board.badgeSnakeText,
  };
  for (const key of SHADE_KEYS) {
    vars[`--theme-surface-${key}`] = ui.ramps.surface[key];
    vars[`--theme-accent-${key}`] = ui.ramps.accent[key];
  }
  return vars;
}

export function getSavedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem('snake_ladder_theme') as ThemeId | null;
    if (saved && saved in THEMES) return saved;
  } catch {
    // Fallback if localStorage is inaccessible
  }
  return DEFAULT_THEME_ID;
}

export function saveTheme(themeId: ThemeId): void {
  try {
    localStorage.setItem('snake_ladder_theme', themeId);
  } catch {
    // Ignore
  }
}
