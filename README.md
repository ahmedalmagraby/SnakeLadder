# 🎲 Snake & Ladder — Modern Cross-Device Web Game

[![Live Demo](https://img.shields.io/badge/Live_Demo-Play_Now-emerald?style=for-the-badge&logo=googlechrome)](https://ahmedalmagraby.github.io/SnakeLadder/)
[![Tests](https://img.shields.io/badge/Tests-164%20Passing-brightgreen?style=for-the-badge&logo=vitest&logoColor=white)](tests/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![WebRTC](https://img.shields.io/badge/WebRTC-PeerJS-FF6B6B?style=for-the-badge&logo=webrtc&logoColor=white)](https://peerjs.com/)

A modern, high-performance remake of the classic board game **Snake & Ladder** built from the ground up with **React 19**, **TypeScript**, **HTML5 Canvas**, and **WebRTC**. Features dynamic 3D dice physics, animated serpentine snakes, golden climbing ladders, procedural Web Audio sound effects, a hardened host-authoritative multiplayer protocol, full WCAG 2.1 AA accessibility, and cross-device real-time online play!

---

## 🎮 Play Live
Play directly in your browser without any installation:  
👉 **[https://ahmedalmagraby.github.io/SnakeLadder/](https://ahmedalmagraby.github.io/SnakeLadder/)**

---

## ✨ Features

### 🌐 Hardened Cross-Device Online Multiplayer
- **Real-Time P2P WebRTC**: Connect directly between devices (PC, Mac, iPhone, Android, iPad) using low-latency WebRTC DataChannels via PeerJS with public STUN servers.
- **Connection Admission State Machine**: Enforces a strict 4-stage lifecycle (`pending` ➔ `authenticated` ➔ `joined` ➔ `closed`) with 10-second unauthenticated timeouts and zero broadcast leakage to unadmitted peers.
- **Host-Authoritative Dice Rolling**: Dice outcomes are calculated and broadcast authoritatively by the host (`ROLL_REQUEST` ➔ `ROLL_RESULT`) with turn-bound deduplication, eliminating client-side roll manipulation or duplicate rolls.
- **Seat Reservation, Never AI Takeover**: If an opponent drops out, their seat is **reserved and held for that human** — no bot ever plays on their behalf, and the `(CPU)` badge is never applied to a real player. The match simply waits: the UI shows `WAITING FOR <NAME> TO RECONNECT...` and advances as soon as they return, restoring their exact square, score, and colour. The host may optionally fill a vacant lobby slot with a CPU bot, but bots are only ever created by an explicit host action in the waiting room — never automatically.
- **Host Session Persistence & Room Rejoin**: If the host refreshes or leaves the game, the existing room code identity, game state, player roster, and guest reconnect tokens are preserved in session storage. When the host returns or inputs the room code, the original room is restored instead of spawning a new code. Reserved guest seats are restored as **waiting-for-reconnect**, so the match pauses on the absent player's turn rather than being played by an AI.
- **Cryptographic Reconnection Tokens**: On joining, the host issues a 32-character cryptographically secure token stored in session storage. Reconnecting verifies the token directly, preventing impersonation or seat hijacking.
- **Strict Runtime Validation & Sanitization**: Comprehensive validation engine protecting against prototype pollution attacks (`__proto__`, `constructor`, `prototype`), packet size flooding (>16KB), oversized fields, and invalid numeric/enum payloads.
- **Role Permission Enforcement**: Guests are strictly confined to permitted actions (`JOIN_REQUEST`, `RECONNECT_REQUEST`, `COLOR_CHANGE_REQUEST`, `ROLL_REQUEST`, `EMOTE`, `PING`, `PONG`). Forged or unauthorized host-only packets immediately terminate the offending connection.
- **Synchronized Victory Celebrations**: Authoritative game-over checkpoints trigger simultaneous victory fanfares, fireworks, confetti, and post-game summary overlays for both host and guest players. Non-host players on the victory screen wait for the host to restart.
- **Floating Emoji Reactions**: Send rate-limited reaction emojis (`🐍`, `🪜`, `🎲`, `👑`, `😱`, `😂`, `🔥`, `🎯`) floating above your token.
- **Smart Mobile Share Link & LAN Manual Entry**: When hosting locally, shareable links support replacing `localhost` with your device's LAN IP address so phones on the same Wi-Fi network can join seamlessly.
- **Optional Standalone WebSocket Relay**: Includes an in-tree WebSocket relay server (`npm run relay` / `node server/relay.js`) for environments where direct P2P is restricted.

> [!NOTE]
> **NAT & Connectivity Details**: Direct WebRTC connections use Google and Twilio public STUN servers. Standard residential routers traverse NAT effortlessly. In restrictive corporate/enterprise environments or symmetric/carrier-grade NATs where STUN hole punching is blocked without TURN, connect over the same local Wi-Fi or run the in-tree relay server. If a host disconnects permanently without re-hosting, guests are gracefully notified and returned to the menu.

> [!IMPORTANT]
> **Dropped players are never replaced by AI.** A disconnected (or host-refreshed) seat stays bound to the original human: their `isCpu` flag remains `false`, their name keeps no `(CPU)` suffix, and their reconnect token is preserved so nobody else can claim the seat. The turn waits for them. If you *want* a bot in a vacant slot, add it yourself with **+ Add CPU** in the waiting room — that is the only path that creates a bot.

### ♿ Accessibility & Screen Readers (WCAG 2.1 AA)
- **Accessible Modal Dialogs**: All modals (Theme Picker, Online Lobby, Match Over, In-game Confirmation) use a reusable accessible `Dialog` featuring `aria-modal="true"`, dynamic `aria-labelledby`, focus trapping, initial focus targeting, focus restoration to previously active elements on close, Escape key dismissal, and background `#root` inertness (`inert` and `aria-hidden="true"`).
- **AriaLiveAnnouncer**: Screen-reader live region (`aria-live="polite"` and `assertive`) announces turns, dice roll outcomes, ladder climbs, snake slides, and game finishes in real time.
- **AccessibleBoardTable**: Fully semantic, screen-reader-accessible table detailing all 100 tiles, snake drops, ladder climbs, and current player positions (including the Start Bay).
- **Target Touch Sizes**: Interactive buttons, color swatches, reaction triggers, and header controls strictly adhere to minimum 44x44px touch targets.
- **Context-Aware Shortcuts**: Keyboard shortcuts are automatically suppressed whenever typing in inputs, textareas, selects, contenteditable elements, or when any modal dialog is open.

### 🤖 Game Modes
- **Solo vs CPU**: Challenge 1 to 3 AI bots with configurable speeds.
- **Pass & Play**: Play locally with up to 4 players on a single screen.
- **Online Multiplayer**: Host or join internet rooms across any device.
  - Bots are opt-in: a CPU bot only joins an online room when the host explicitly taps **+ Add CPU** in the waiting room. Connected humans are never swapped for a bot, even if they drop out.

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
- **Lucky 6 Rule**: Rolling a 6 grants an immediate extra roll! When on square 99 under the exact win rule, rolling a 6 preserves your turn and awards a bonus roll.
- **Speed Presets**: Normal, Fast, and Turbo modes.
- **Procedural Sound Engine**: Synthesized in real time using the **Web Audio API** (dice rattle, hop clatter, golden ladder chimes, snake hiss, and victory fanfares) with zero external audio assets.
- **Keyboard Shortcuts**:
  - `Space` / `Enter`: Roll dice (in-game) or Start match (menu)
  - `T`: Open theme picker modal
  - `M`: Toggle audio mute / unmute
  - `S`: Cycle game animation speed (Normal ➔ Fast ➔ Turbo)
  - `F`: Toggle fullscreen mode
  - `R`: Restart active match (with confirmation dialog)
  - `Esc`: Open in-game exit/menu confirmation modal

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| **React 19** | Modern functional UI with state-of-the-art hooks & portals |
| **TypeScript 5.9** | Strict type safety across game engine & network protocols |
| **Vite 7** | Next-generation bundler with instant HMR and single-file inlining |
| **Vitest** | Fast automated testing for protocol security, accessibility & game rules |
| **Tailwind CSS v4** | Modern responsive glassmorphism UI styles |
| **HTML5 Canvas 2D** | 60 FPS hardware-accelerated board & sprite rendering |
| **WebRTC & PeerJS** | Peer-to-peer real-time cross-device networking |
| **Web Audio API** | Procedural sound generation without audio files |
| **GitHub Actions** | Automated CI validation (typecheck, lint, test) and CD deployment |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (`^20.19.0` or `>=22.12.0`)
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

3. **Run code verification and automated tests**:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```

4. **Start the local development server**:
   ```bash
   npm run dev -- --host
   ```
   - Open [http://localhost:5173](http://localhost:5173) on your computer.
   - Open the displayed Network URL (e.g. `http://192.168.x.x:5173`) on your phone or tablet to test multiplayer!

5. **Start optional WebSocket relay server**:
   ```bash
   npm run relay
   ```

6. **Build for production**:
   ```bash
   npm run build
   ```
   The bundled single-file app will be output to the `dist/` directory.

---

## 🌐 Deploying to GitHub Pages

This repository includes a pre-configured GitHub Actions workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) that executes automated typechecks, linting, tests, and builds the single-file bundle.

To enable automatic deployment:
1. Push your code to the `main` branch:
   ```bash
   git push origin main
   ```
2. On GitHub, navigate to your repository:
   - Go to **Settings** ➔ **Pages**.
   - Under **Build and deployment** ➔ **Source**, select **GitHub Actions**.
3. GitHub Actions will automatically test, build, and publish your game to:
   `https://ahmedalmagraby.github.io/SnakeLadder/`

---

## 📁 Project Structure

```
SnakeLadder/
├── .github/
│   └── workflows/
│       └── deploy.yml              # GitHub Actions CI/CD (typecheck, lint, test, deploy)
├── server/
│   └── relay.js                    # Standalone WebSocket packet relay server
├── tests/
│   ├── accessibility.test.tsx      # Dialog a11y, focus trap, inert background & shortcuts
│   ├── canvasCorrectness.test.ts   # Wave spines, token anchoring & coordinate math
│   ├── lifecycle.test.ts           # Heartbeat deadlines, re-hosting & recovery
│   ├── multiplayer.test.ts         # Protocol validation, state machine & admission gate
│   ├── multiplayerBugFixes.test.tsx# Regressions: re-host roster, roll authority, kick & seat reservation
│   ├── relay.test.ts               # Standalone relay server packet distribution & rooms
│   ├── rosterSlots.test.ts         # Slot allocation, player roster & reconnect tokens
│   ├── rulesAndCoordinates.test.ts # Boustrophedon board math, portals & win rules
│   ├── sessionAndInvite.test.ts    # Session persistence, IP replacement & dismissal
│   ├── stateMachine.test.ts        # Turn transitions, dice mechanics & bonus rolls
│   ├── twoClientIntegration.test.ts# End-to-end host/guest multiplayer lifecycle
│   └── useGameRollFixes.test.tsx   # Regressions: slot-indexed rolls & guest roll-request gating
├── src/
│   ├── components/
│   │   ├── AccessibleBoardTable.tsx# Semantic screen reader board matrix (1-100)
│   │   ├── AriaLiveAnnouncer.tsx   # Live region announcer for game events
│   │   ├── Dialog.tsx              # Reusable accessible modal dialog with focus trap
│   │   ├── Die.tsx                 # 3D animated CSS die
│   │   ├── OnlineHudBar.tsx        # In-game multiplayer status bar & emoji bar
│   │   ├── OnlineLobby.tsx         # Waiting room, swatches & invite link modal
│   │   └── ThemeModal.tsx          # Visual board theme picker modal
│   ├── game/
│   │   ├── audio.ts                 # Procedural Web Audio sound synthesizer
│   │   ├── constants.ts             # Board dimensions, ladders, snakes, colors
│   │   ├── gameReducer.ts           # Pure game state reducer, roster + checkpoint actions
│   │   ├── render.ts                # Canvas rendering engine for boards, snakes & themes
│   │   ├── themes.ts                # 5 distinct visual theme definitions & palettes
│   │   ├── useGame.ts               # Core 60fps board engine, turn state machine & roll authority
│   │   └── network/
│   │       ├── peerManager.ts      # Connection admission state machine & WebRTC transport
│   │       ├── sessionStorage.ts   # Session persistence with cryptographic reconnect tokens
│   │       ├── types.ts            # Network packet definitions & size/rate limits
│   │       ├── useMultiplayer.ts   # Host-authoritative multiplayer hook & state sync
│   │       └── validation.ts       # Runtime packet validator & role permission engine
│   ├── App.tsx                     # Main layout, menus, responsive HUD & aside
│   ├── index.css                   # Theme CSS variables & custom animations
│   └── main.tsx                    # React root mount
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts                  # Vite + singlefile configuration
```

---

## 📜 License
This project is open source and available under the [MIT License](LICENSE).
