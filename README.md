# 🎲 Snake & Ladder

[![Live Demo](https://img.shields.io/badge/Play_Live-GitHub_Pages-10b981?style=for-the-badge&logo=googlechrome&logoColor=white)](https://ahmedalmagraby.github.io/SnakeLadder/)
[![Tests](https://img.shields.io/badge/Tests-246_Passing-22c55e?style=for-the-badge&logo=vitest&logoColor=white)](tests/)
[![Security Audit](https://img.shields.io/badge/Audit-0_Vulnerabilities-22c55e?style=for-the-badge)](https://github.com/ahmedalmagraby/SnakeLadder/actions)
[![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript 5.9](https://img.shields.io/badge/TypeScript_5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 7](https://img.shields.io/badge/Vite_7-646CFF?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)
[![WebRTC](https://img.shields.io/badge/WebRTC-PeerJS-FF6B6B?style=for-the-badge&logo=webrtc&logoColor=white)](https://peerjs.com/)

A fast, single-bundle web remake of **Snake & Ladder** built with **React 19**, **TypeScript**, **HTML5 Canvas**, and **WebRTC**. Play solo against CPU bots, pass-and-play on one device, or host real-time online rooms across phones, tablets, and desktops—with zero backend servers or asset downloads.

👉 **Play now in your browser:** **[https://ahmedalmagraby.github.io/SnakeLadder/](https://ahmedalmagraby.github.io/SnakeLadder/)**

---

## ✨ What's Inside

| Category | Highlights |
| :--- | :--- |
| **🎮 Game Modes** | **Solo vs CPU** (1–3 bots), **Pass & Play** (2–4 players on one screen), and **Online Multiplayer** (up to 4 players via 6-character room codes or invite links). |
| **🌐 Online Play** | Host-authoritative P2P protocol over WebRTC DataChannels with **automatic WebSocket relay fallback** (`wss://0.peerjs.com:443`) and custom TURN support so rooms work across Wi-Fi, 4G/5G mobile data (CGNAT), and strict firewalls. |
| **🎨 5 Visual Themes** | *Jungle Safari*, *Cyber Neon*, *Desert Pharaoh*, *Cosmic Galaxy*, and *Candy Kingdom*—each with custom Canvas board art, animated snakes, and ladders. |
| **🔊 Procedural Audio** | Real-time synthesized sound effects (dice rattle, tile hops, ladder chimes, snake slides, and victory fanfare) built on the Web Audio API with zero external audio files. |
| **📱 Mobile-First UI** | Responsive portrait & zero-scroll landscape layouts, safe-area support, 44×44px touch targets, and tap-to-inspect board squares. |
| **♿ Accessibility** | WCAG 2.1 AA compliant dialogs with focus trapping, `aria-live` turn announcements, and a full semantic 100-square screen-reader board table. |

---

## 🌐 Online Multiplayer Architecture

Online rooms run directly between browsers using PeerJS and WebRTC DataChannels, backed by a hardened host-authoritative protocol:

- **Cross-Network Connectivity (WebRTC P2P + Automatic WebSocket Relay Fallback):**
  - **Same Wi-Fi / LAN & Home Broadband:** Connects directly peer-to-peer via WebRTC DataChannels and STUN hole punching.
  - **Mobile Data (4G/5G CGNAT) & Strict Firewalls:** If symmetric NAT or carrier firewalls block direct UDP WebRTC DataChannels for 2.5 seconds, `PeerManager` automatically falls back to relaying packets over the encrypted PeerJS WebSocket channel (`wss://0.peerjs.com:443`)—requiring zero external accounts or API keys.
  - **Custom TURN Support:** Optionally supply private TURN credentials at build time via `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL`, or at runtime via `localStorage.setItem('snkladr_turn_config', JSON.stringify({ urls, username, credential }))`.
- **Reserved Seats & Reconnection:**
  - Joining guests receive a 32-character cryptographic reconnect token stored in `localStorage`.
  - If a player briefly switches mobile apps (e.g., sharing the room code on WhatsApp) or drops connection, their seat is **held and reserved for them**—never handed over to an AI bot.
  - If the host refreshes, the room code, board state, and all player seats are restored automatically.
- **Host-Authoritative Security:**
  - All dice rolls are generated authoritatively by the host (`ROLL_REQUEST` ➔ `ROLL_RESULT`) with per-turn deduplication and rate limiting.
  - Every inbound packet is schema-validated on both host and guest (size limits, prototype-pollution guards, role permissions, and protocol version checks).

---

## 🎲 Game Rules & Controls

### Match Rules
- **Win Condition:** Choose between **Exact 100** (must roll the exact number needed to land on 100) or **Bounce Back** (overshooting 100 bounces backward by the remaining steps).
- **Lucky 6:** Rolling a `6` grants an immediate bonus roll.
- **Speed Presets:** Switch between **Normal**, **Fast**, and **Turbo** animation speeds at any time.

### Keyboard Shortcuts

| Key | Action |
| :---: | :--- |
| `Space` / `Enter` | Roll dice (in-game) or Start match (menu) |
| `T` | Open visual theme picker |
| `M` | Toggle audio mute / unmute |
| `S` | Cycle animation speed (`Normal` ➔ `Fast` ➔ `Turbo`) |
| `F` | Toggle fullscreen mode |
| `R` | Restart active match (with confirmation) |
| `Esc` | Open exit confirmation or close active modal |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** `^20.19.0` or `>=22.12.0`
- **npm**

### Setup & Development

```bash
# 1. Clone the repository
git clone https://github.com/ahmedalmagraby/SnakeLadder.git
cd SnakeLadder

# 2. Install dependencies
npm install

# 3. Start local dev server (exposes LAN URL for mobile testing)
npm run dev -- --host
```

### Verification & Build Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Vite development server with HMR |
| `npm test` | Run all 17 Vitest test suites (246 tests) |
| `npm run typecheck` | Run TypeScript compiler checks (`tsc --noEmit`) |
| `npm run lint` | Run ESLint across the codebase |
| `npm run check:configs` | Verify `package.json` and `tsconfig.json` have no duplicate keys |
| `npm run audit` | Check dependencies for high/critical security advisories |
| `npm run build` | Bundle the app into a single self-contained `dist/index.html` |
| `npm run verify` | Run the full CI gate (`audit` + `check:configs` + `typecheck` + `lint` + `test` + `build`) |

---

## 📁 Project Structure

```text
SnakeLadder/
├── .github/workflows/deploy.yml   # CI/CD pipeline (audit, lint, typecheck, test, single-file build & deploy)
├── public/                        # Favicon, PWA manifest & OpenGraph social card
├── scripts/                       # JSON config validator & self-tests
├── src/
│   ├── components/
│   │   ├── AccessibleBoardTable.tsx # Screen-reader 100-tile matrix
│   │   ├── AriaLiveAnnouncer.tsx    # Live region announcer for turns & events
│   │   ├── Dialog.tsx               # Accessible modal dialog with focus trap
│   │   ├── Die.tsx                  # 3D animated CSS die
│   │   ├── ErrorBoundary.tsx        # Top-level crash recovery boundary
│   │   ├── OnlineHudBar.tsx         # In-game multiplayer status & emoji bar
│   │   ├── OnlineLobby.tsx          # Host/join lobby, room codes & invite links
│   │   └── ThemeModal.tsx           # Board theme selector modal
│   ├── game/
│   │   ├── network/
│   │   │   ├── peerManager.ts       # WebRTC transport, STUN/TURN config & admission state machine
│   │   │   ├── sessionStorage.ts    # Session persistence & cryptographic reconnect tokens
│   │   │   ├── types.ts             # Wire protocol types, limits & versioning
│   │   │   ├── useMultiplayer.ts    # Host-authoritative multiplayer hook & state sync
│   │   │   └── validation.ts        # Runtime packet schema & role validator
│   │   ├── audio.ts                 # Procedural Web Audio synthesizer
│   │   ├── constants.ts             # Board geometry, snakes, ladders & palettes
│   │   ├── gameReducer.ts           # Pure game state reducer
│   │   ├── render.ts                # 60 FPS HTML5 Canvas board & sprite renderer
│   │   ├── themes.ts                # 5 visual board theme definitions
│   │   └── useGame.ts               # Core game loop, animations & roll authority
│   ├── utils/                       # Clipboard & class-name helpers
│   ├── App.tsx                      # Main responsive layout, menus & HUD
│   ├── index.css                    # Tailwind CSS v4 styles & animations
│   └── main.tsx                     # Application entry point
└── tests/                           # 17 unit, integration & accessibility test suites
```

---

## 🤝 Contributing & Security

- See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture boundaries and development guidelines.
- See [SECURITY.md](SECURITY.md) for the peer-to-peer threat model and vulnerability reporting instructions.

## 📜 License

Released under the [MIT License](LICENSE).
