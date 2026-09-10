# 🎲 Snake & Ladder — Modern Cross-Device Web Game

[![Live Demo](https://img.shields.io/badge/Live_Demo-Play_Now-emerald?style=for-the-badge&logo=googlechrome)](https://ahmedalmagraby.github.io/SnakeLadder/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![WebRTC](https://img.shields.io/badge/WebRTC-PeerJS-FF6B6B?style=for-the-badge&logo=webrtc&logoColor=white)](https://peerjs.com/)

A modern, high-performance remake of the classic board game **Snake & Ladder** built from the ground up with **React 19**, **TypeScript**, **HTML5 Canvas**, and **WebRTC**. Features dynamic 3D dice physics, animated serpentine snakes, golden climbing ladders, procedural Web Audio sound effects, and real-time cross-device online multiplayer!

---

## 🎮 Play Live
Play directly in your browser without any installation:  
👉 **[https://ahmedalmagraby.github.io/SnakeLadder/](https://ahmedalmagraby.github.io/SnakeLadder/)**

---

## ✨ Features

### 🌐 Cross-Device Online Multiplayer
- **Real-Time P2P WebRTC**: Connect directly between devices (PC, Mac, iPhone, Android, iPad) using low-latency WebRTC DataChannels via PeerJS.
- **Instant Room Codes**: Host creates a match and shares a clean 6-character room code or one-click invite link.
- **Session Persistence & Auto-Reconnection**: Accidental tab closure or page refresh? The game restores your seat and syncs the current board state automatically!
- **Color Conflict Prevention**: Unique token colors are enforced with real-time swatches in the waiting lobby.
- **Auto-Bot Takeover**: If an opponent drops out or disconnects, an intelligent AI bot immediately takes over their seat so the match continues uninterrupted.
- **Floating Emoji Reactions**: Send real-time emoji reactions (`🐍`, `🪜`, `🎲`, `👑`, `😱`, `😂`, `🔥`, `🎯`) floating above your token.
- **Smart Mobile Share Link**: Automatic detection of local Wi-Fi IP when hosting locally, making it effortless for phones on the same network to join.

### 🤖 Game Modes
- **Solo vs CPU**: Challenge 1 to 3 AI bots.
- **Pass & Play**: Play locally with up to 4 players on a single screen.
- **Online Multiplayer**: Host or join internet rooms across any device.

### 🎨 Multiple Board Themes
- **5 Distinct Visual Themes**:
  - 🌴 **Jungle Safari**: Lush rainforest glow, golden bamboo ladders, emerald checkered tiles, and natural serpents.
  - ⚡ **Cyber Neon**: Synthwave matrix, circuit board frame, holographic energy bridges, and cyber data-serpents.
  - 🏛️ **Desert Pharaoh**: Ancient sandstone, royal lapis lazuli accents, golden cobras, and obelisk finish podium.
  - 🌌 **Cosmic Galaxy**: Deep space nebulas, pulsar starlight beams, celestial star serpents, and astral finish line.
  - 🍭 **Candy Kingdom**: Chocolate cookie frame, peppermint candy-cane ladders, and rainbow gummy worms.
- **Full Palette & Sprite Customization**: Each theme features custom board frame gradients, corner embellishments, tile sheen, ladder styles, snake skins, and finish podiums.
- **Theme Selector Modal**: Interactive modal with live color preview swatches, accessible via header button, start screen, or pressing `T`.
- **Theme Persistence**: Chosen theme is automatically remembered across game sessions using `localStorage`.

### 📱 Optimized Mobile Experience
- **Maximized Board Real Estate**: Board canvas dynamically expands to fill 100% of available viewport space (`Math.min(width, height)`) with subpixel crispness.
- **Ergonomic Portrait HUD**: Single-row player chip strip frees up maximum vertical space for the board, with a thumb-friendly roll deck pinned at the bottom.
- **Zero-Scroll Landscape Mode**: Specialized compact landscape deck keeps all player cards, 3D die, and action buttons in view without vertical scrolling.
- **Touch-to-Inspect**: Tap any square to instantly see snake drops, ladder climbs, or distance to cell 100, with auto-dismissing badges.
- **Safe Area Aware**: Full compatibility with notches, dynamic islands, and home indicator bars via `env(safe-area-inset-*)`.

### ⚙️ Rules & Quality of Life
- **Win Rules**:
  - **Exact 100**: You must roll the exact number required to hit square 100.
  - **Bounce Back**: Overshooting square 100 bounces backward by the remaining count.
- **Lucky 6**: Rolling a 6 grants an immediate extra roll!
- **Speed Presets**: Normal, Fast, and Turbo modes.
- **Procedural Sound Engine**: Synthesized in real time using the **Web Audio API** (dice rattle, hop clatter, golden ladder chimes, snake hiss, and victory fanfares) with zero external audio assets.
- **Keyboard Shortcuts**: Space / Enter to roll, `T` to open theme picker, `M` to toggle sound, `S` to toggle speed, `F` for fullscreen, and `Esc` for menu.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **React 19** | Modern functional UI with state-of-the-art hooks |
| **TypeScript 5.9** | Strict type safety across game engine & network protocols |
| **Vite 7** | Next-generation bundler with instant HMR and single-file inlining |
| **Tailwind CSS v4** | Modern responsive glassmorphism UI styles |
| **HTML5 Canvas 2D** | 60 FPS hardware-accelerated board & sprite rendering |
| **WebRTC & PeerJS** | Peer-to-peer real-time cross-device networking |
| **Web Audio API** | Procedural sound generation without audio files |
| **GitHub Actions** | Automated CI/CD deployment to GitHub Pages |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- [npm](https://www.npmjs.com/) or `pnpm`

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ahmedalmagraby/SnakeLadder.git
   cd SnakeLadder
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev -- --host
   ```
   - Open [http://localhost:5173](http://localhost:5173) on your computer.
   - Open the displayed Network URL (e.g. `http://192.168.x.x:5173`) on your phone or tablet to test multiplayer!

4. **Build for production**:
   ```bash
   npm run build
   ```
   The bundled single-file app will be output to the `dist/` directory.

---

## 🌐 Deploying to GitHub Pages

This repository includes a pre-configured GitHub Actions workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

To enable automatic deployment:
1. Push your code to the `main` branch:
   ```bash
   git push origin main
   ```
2. On GitHub, navigate to your repository:
   - Go to **Settings** ➔ **Pages**.
   - Under **Build and deployment** ➔ **Source**, select **GitHub Actions**.
3. GitHub Actions will automatically build and publish your game to:
   `https://ahmedalmagraby.github.io/SnakeLadder/`

---

## 📁 Project Structure

```
SnakeLadder/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions Pages deployment
├── src/
│   ├── components/
│   │   ├── Die.tsx             # 3D animated CSS die
│   │   ├── OnlineHudBar.tsx    # In-game multiplayer status bar & emoji bar
│   │   ├── OnlineLobby.tsx     # Waiting room, swatches & invite link modal
│   │   └── ThemeModal.tsx      # Visual board theme picker modal
│   ├── game/
│   │   ├── constants.ts        # Board dimensions, ladders, snakes, colors
│   │   ├── render.ts           # Canvas rendering engine for boards, snakes & themes
│   │   ├── sfx.ts              # Procedural Web Audio sound synthesizer
│   │   ├── themes.ts           # 5 distinct visual theme definitions & palettes
│   │   ├── useGame.ts          # Core 60fps board engine & turn state machine
│   │   └── network/
│   │       ├── peerManager.ts  # WebRTC peer coordinator & star relay
│   │       ├── sessionStorage.ts # LocalStorage session persistence & LAN IP
│   │       ├── types.ts        # Network packet definitions
│   │       └── useMultiplayer.ts # Multiplayer game hook & state sync
│   ├── App.tsx                 # Main layout, menus, responsive HUD & aside
│   ├── index.css               # Theme CSS variables & custom animations
│   └── main.tsx                # React root mount
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts              # Vite + singlefile configuration
```

---

## 📜 License
This project is open source and available under the [MIT License](LICENSE).
