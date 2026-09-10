export type ThemeId = 'jungle' | 'cyber' | 'desert' | 'cosmic' | 'candy';

export interface BoardTheme {
  id: ThemeId;
  name: string;
  tagline: string;
  icon: string;
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
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
    btnClass: string;
    btnBg: string;
    btnText: string;
    btnBorder: string;
    btnShadow: string;
  };
  board: {
    frameGrad: [string, string, string, string];
    framePattern: 'wood' | 'circuits' | 'sandstone' | 'stars' | 'frosting';
    bezelOuter: string;
    bezelInner: string;
    cornerType: 'brass' | 'cyber' | 'pharaoh' | 'astral' | 'peppermint';
    cornerColors: [string, string, string];

    tileDark: string;
    tileLight: string;
    tileSheen: string;
    tileBorder: string;

    ladderStyle: 'wood' | 'neon' | 'gold' | 'starlight' | 'candycane';
    ladderRailCore: string;
    ladderRailPolish: string;
    ladderRailHighlight: string;
    ladderRailShadow: string;
    ladderRungColor: string;
    ladderRungShadow: string;
    ladderRungHighlight: string;
    ladderRivetColor: string;

    snakeStyle: 'natural' | 'cyber' | 'pharaoh' | 'cosmic' | 'gummy';
    snakePalette: [string, string][];
    snakeOutline: string;
    snakeDropShadow: string;
    snakeSpecular: string;
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
      tileLight: '#062d24',
      accent: '#fbbf24',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(16,185,129,0.18), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(251,191,36,0.16), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(7,60,44,0.5), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(17, 46, 35, 0.94), rgba(8, 24, 18, 0.94))',
      panelBorder: 'rgba(251, 191, 36, 0.18)',
      accent: '#fbbf24',
      accentGlow: 'rgba(251, 191, 36, 0.35)',
      badgeBg: 'bg-emerald-950/80',
      badgeBorder: 'border-emerald-700/40',
      badgeText: 'text-emerald-300/80',
      btnClass:
        'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 border-amber-700 text-[#3a2302] shadow-[0_8px_20px_rgba(251,191,36,0.28)]',
      btnBg: 'linear-gradient(180deg, #fde047 0%, #fbbf24 50%, #f59e0b 100%)',
      btnText: '#3a2302',
      btnBorder: '#b45309',
      btnShadow: 'rgba(251, 191, 36, 0.35)',
    },
    board: {
      frameGrad: ['#78350f', '#92400e', '#713f12', '#451a03'],
      framePattern: 'wood',
      bezelOuter: 'rgba(0, 0, 0, 0.65)',
      bezelInner: 'rgba(251, 191, 36, 0.45)',
      cornerType: 'brass',
      cornerColors: ['#fef08a', '#eab308', '#713f12'],

      tileDark: '#0a3d31',
      tileLight: '#062d24',
      tileSheen: 'rgba(255, 255, 255, 0.08)',
      tileBorder: 'rgba(0, 0, 0, 0.45)',

      ladderStyle: 'wood',
      ladderRailCore: '#4a2508',
      ladderRailPolish: '#d97706',
      ladderRailHighlight: 'rgba(254, 240, 138, 0.7)',
      ladderRailShadow: 'rgba(25, 12, 4, 0.75)',
      ladderRungColor: '#f59e0b',
      ladderRungShadow: 'rgba(25, 12, 4, 0.75)',
      ladderRungHighlight: '#fef08a',
      ladderRivetColor: '#fef08a',

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
    },
  },

  cyber: {
    id: 'cyber',
    name: 'Cyber Neon',
    tagline: 'Synthwave matrix, holographic energy bridges, cyber data-serpents',
    icon: '⚡',
    previewColors: {
      frame: '#0f172a',
      tileDark: '#0b1329',
      tileLight: '#050a18',
      accent: '#06b6d4',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(6,182,212,0.24), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(236,72,153,0.22), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(15,23,42,0.85), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(14, 23, 48, 0.95), rgba(7, 12, 26, 0.95))',
      panelBorder: 'rgba(6, 182, 212, 0.3)',
      accent: '#06b6d4',
      accentGlow: 'rgba(6, 182, 212, 0.45)',
      badgeBg: 'bg-cyan-950/80',
      badgeBorder: 'border-cyan-700/40',
      badgeText: 'text-cyan-300/90',
      btnClass:
        'bg-gradient-to-b from-cyan-300 via-cyan-400 to-cyan-500 border-cyan-700 text-[#04202c] shadow-[0_8px_20px_rgba(6,182,212,0.32)]',
      btnBg: 'linear-gradient(180deg, #67e8f9 0%, #06b6d4 50%, #0891b2 100%)',
      btnText: '#04202c',
      btnBorder: '#0e7490',
      btnShadow: 'rgba(6, 182, 212, 0.42)',
    },
    board: {
      frameGrad: ['#090d16', '#1e1b4b', '#0f172a', '#020617'],
      framePattern: 'circuits',
      bezelOuter: 'rgba(0, 0, 0, 0.85)',
      bezelInner: 'rgba(6, 182, 212, 0.65)',
      cornerType: 'cyber',
      cornerColors: ['#a5f3fc', '#06b6d4', '#0e7490'],

      tileDark: '#0c1633',
      tileLight: '#060b1b',
      tileSheen: 'rgba(6, 182, 212, 0.12)',
      tileBorder: 'rgba(6, 182, 212, 0.28)',

      ladderStyle: 'neon',
      ladderRailCore: '#0891b2',
      ladderRailPolish: '#06b6d4',
      ladderRailHighlight: 'rgba(165, 243, 252, 0.95)',
      ladderRailShadow: 'rgba(6, 182, 212, 0.45)',
      ladderRungColor: '#38bdf8',
      ladderRungShadow: 'rgba(14, 116, 144, 0.6)',
      ladderRungHighlight: '#cffafe',
      ladderRivetColor: '#ec4899',

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
      tileLight: '#1e293b',
      accent: '#f59e0b',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(245,158,11,0.22), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(37,99,235,0.2), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(46,24,6,0.65), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(46, 27, 10, 0.95), rgba(24, 14, 5, 0.95))',
      panelBorder: 'rgba(245, 158, 11, 0.28)',
      accent: '#f59e0b',
      accentGlow: 'rgba(245, 158, 11, 0.4)',
      badgeBg: 'bg-amber-950/80',
      badgeBorder: 'border-amber-700/40',
      badgeText: 'text-amber-300/90',
      btnClass:
        'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 border-amber-700 text-[#3b1d03] shadow-[0_8px_20px_rgba(245,158,11,0.3)]',
      btnBg: 'linear-gradient(180deg, #fde68a 0%, #f59e0b 50%, #d97706 100%)',
      btnText: '#3b1d03',
      btnBorder: '#92400e',
      btnShadow: 'rgba(245, 158, 11, 0.38)',
    },
    board: {
      frameGrad: ['#78350f', '#b45309', '#92400e', '#451a03'],
      framePattern: 'sandstone',
      bezelOuter: 'rgba(30, 15, 5, 0.85)',
      bezelInner: 'rgba(245, 158, 11, 0.6)',
      cornerType: 'pharaoh',
      cornerColors: ['#fde68a', '#f59e0b', '#1d4ed8'],

      tileDark: '#351f0b',
      tileLight: '#192841',
      tileSheen: 'rgba(253, 230, 138, 0.12)',
      tileBorder: 'rgba(217, 119, 6, 0.35)',

      ladderStyle: 'gold',
      ladderRailCore: '#78350f',
      ladderRailPolish: '#d97706',
      ladderRailHighlight: 'rgba(254, 240, 138, 0.85)',
      ladderRailShadow: 'rgba(30, 15, 5, 0.75)',
      ladderRungColor: '#fbbf24',
      ladderRungShadow: 'rgba(30, 15, 5, 0.65)',
      ladderRungHighlight: '#fde68a',
      ladderRivetColor: '#2563eb',

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
    },
  },

  cosmic: {
    id: 'cosmic',
    name: 'Cosmic Galaxy',
    tagline: 'Deep space nebulas, pulsar starlight beams, celestial star serpents',
    icon: '🌌',
    previewColors: {
      frame: '#1e1b4b',
      tileDark: '#120f33',
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
      badgeBg: 'bg-purple-950/80',
      badgeBorder: 'border-purple-700/40',
      badgeText: 'text-purple-300/90',
      btnClass:
        'bg-gradient-to-b from-purple-300 via-purple-400 to-indigo-500 border-purple-700 text-[#190533] shadow-[0_8px_20px_rgba(139,92,246,0.32)]',
      btnBg: 'linear-gradient(180deg, #c4b5fd 0%, #8b5cf6 50%, #6366f1 100%)',
      btnText: '#190533',
      btnBorder: '#4f46e5',
      btnShadow: 'rgba(139, 92, 246, 0.42)',
    },
    board: {
      frameGrad: ['#030712', '#1e1b4b', '#0f172a', '#020617'],
      framePattern: 'stars',
      bezelOuter: 'rgba(0, 0, 0, 0.85)',
      bezelInner: 'rgba(139, 92, 246, 0.55)',
      cornerType: 'astral',
      cornerColors: ['#e0e7ff', '#818cf8', '#312e81'],

      tileDark: '#120f33',
      tileLight: '#070518',
      tileSheen: 'rgba(139, 92, 246, 0.14)',
      tileBorder: 'rgba(129, 140, 248, 0.28)',

      ladderStyle: 'starlight',
      ladderRailCore: '#4338ca',
      ladderRailPolish: '#6366f1',
      ladderRailHighlight: 'rgba(224, 231, 255, 0.92)',
      ladderRailShadow: 'rgba(79, 70, 229, 0.45)',
      ladderRungColor: '#38bdf8',
      ladderRungShadow: 'rgba(30, 27, 75, 0.7)',
      ladderRungHighlight: '#bae6fd',
      ladderRivetColor: '#c084fc',

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
    },
  },

  candy: {
    id: 'candy',
    name: 'Candy Kingdom',
    tagline: 'Chocolate cookie frame, peppermint ladders, rainbow gummy worms',
    icon: '🍭',
    previewColors: {
      frame: '#5c2c16',
      tileDark: '#381324',
      tileLight: '#132824',
      accent: '#f43f5e',
    },
    ui: {
      bgGlow:
        'radial-gradient(950px 620px at 10% -5%, rgba(244,63,94,0.22), transparent 60%), radial-gradient(850px 620px at 92% 105%, rgba(52,211,153,0.2), transparent 60%), radial-gradient(1300px 900px at 50% 50%, rgba(46,16,30,0.65), transparent 75%)',
      panelBg: 'linear-gradient(180deg, rgba(48, 18, 32, 0.95), rgba(26, 9, 18, 0.95))',
      panelBorder: 'rgba(244, 63, 94, 0.3)',
      accent: '#f43f5e',
      accentGlow: 'rgba(244, 63, 94, 0.45)',
      badgeBg: 'bg-rose-950/80',
      badgeBorder: 'border-rose-700/40',
      badgeText: 'text-rose-300/90',
      btnClass:
        'bg-gradient-to-b from-rose-300 via-rose-400 to-pink-500 border-rose-700 text-[#3d0315] shadow-[0_8px_20px_rgba(244,63,94,0.3)]',
      btnBg: 'linear-gradient(180deg, #fda4af 0%, #f43f5e 50%, #e11d48 100%)',
      btnText: '#3d0315',
      btnBorder: '#be185d',
      btnShadow: 'rgba(244, 63, 94, 0.42)',
    },
    board: {
      frameGrad: ['#5c2c16', '#78350f', '#451a03', '#2d1205'],
      framePattern: 'frosting',
      bezelOuter: 'rgba(30, 10, 5, 0.85)',
      bezelInner: 'rgba(251, 146, 60, 0.55)',
      cornerType: 'peppermint',
      cornerColors: ['#ffffff', '#ef4444', '#b91c1c'],

      tileDark: '#381324',
      tileLight: '#132824',
      tileSheen: 'rgba(255, 255, 255, 0.12)',
      tileBorder: 'rgba(244, 63, 94, 0.3)',

      ladderStyle: 'candycane',
      ladderRailCore: '#dc2626',
      ladderRailPolish: '#ef4444',
      ladderRailHighlight: 'rgba(255, 255, 255, 0.95)',
      ladderRailShadow: 'rgba(60, 15, 10, 0.7)',
      ladderRungColor: '#fbbf24',
      ladderRungShadow: 'rgba(60, 15, 10, 0.6)',
      ladderRungHighlight: '#fef08a',
      ladderRivetColor: '#ec4899',

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
    },
  },
};

export const DEFAULT_THEME_ID: ThemeId = 'jungle';

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
