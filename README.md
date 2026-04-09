# Baby Monitor

Smart baby monitor — turn two smartphones into a baby monitoring system.

**Parent station**: React Native app (installed on the parent's phone)
**Baby station**: Web app (opens in the browser of any old phone — zero install)

Audio streams peer-to-peer via WebRTC. The server only handles the initial handshake.

<p align="center">
  <img src="docs/screenshots/home-screen.jpeg" alt="Baby Monitor — Home Screen" width="280" />
</p>

## How it works

```
  Parent's phone                          Old phone in baby's room
  (React Native app)                      (Web browser)
  ┌───────────────────┐                   ┌───────────────────┐
  │                   │    WebRTC P2P     │                   │
  │  Tap "Sou o pai"  │◄────────────────►│  Enter room code  │
  │  Get room code    │  Audio + dB data  │  Microphone on    │
  │  See dB meter     │                   │  Screen dims      │
  │  Get alerts       │                   │                   │
  └─────────┬─────────┘                   └─────────┬─────────┘
            │          Socket.IO                    │
            └──────────┬────────────────────────────┘
                       │
              ┌────────▼────────┐
              │ Signaling Server │
              │  (handshake only)│
              └─────────────────┘
```

**Step by step:**
1. Open the mobile app on your phone → tap **"Sou o pai/mãe"** → you get a 6-character room code
2. On another phone, open the **web app** in the browser → enter the code → tap **Conectar**
3. The baby station starts streaming audio and dB levels directly to your phone (P2P)
4. If noise exceeds the threshold for 3+ consecutive readings → your phone vibrates and screen flashes red

## Quick start

### Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- iPhone with development build (for mobile app) or iOS Simulator
- A second device with a browser (for baby station)
- Both devices on the **same Wi-Fi network**

### Run

```bash
git clone <repo-url>
cd baby-monitor-mvp
./start
```

The `start` script will:
1. Detect your local IP address automatically
2. Kill any existing processes on ports 3003, 5175, 8081
3. Install dependencies if needed
4. Create `.env` from `.env.example` if missing
5. Start all services (server + web + mobile)
6. Print URLs with your local IP for easy access

### Test

After `./start`, the terminal shows your local IP and URLs:

```
   Server:  http://192.168.x.x:3003
   Web:     http://192.168.x.x:5175
   Mobile:  Metro on port 8081
```

1. **Parent (mobile app)**: Open on your phone via Expo development build
2. **Baby (web)**: Open `http://<your-ip>:5175` on another device's browser
3. Parent taps "Sou o pai/mãe" → gets a code
4. Baby enters the code → connection established

### Run services individually

```bash
pnpm dev:server   # http://localhost:3003
pnpm dev:web      # http://localhost:5175
pnpm dev:mobile   # Expo Dev Client on port 8081
```

## Mobile app setup (first time)

The mobile app uses Expo with a **development build** (not Expo Go) because it requires `react-native-webrtc`.

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to your Expo account
eas login

# Build for iOS device (first time only — takes a few minutes)
cd apps/mobile
npx expo run:ios --device

# After first build, just use ./start from the root
```

## Architecture

| Layer | Technology |
|-------|-----------|
| Mobile | React Native, Expo Dev Client, react-native-webrtc |
| Web | Vanilla HTML/TS, WebRTC API, Web Audio API |
| Server | Node.js, Express, Socket.IO |
| Shared | TypeScript, Turborepo monorepo |
| Design | Custom design tokens, dark-first theme |

### Clean Architecture

Each app follows domain → data → infrastructure → presentation layers:

```
baby-monitor-mvp/
├── apps/
│   ├── mobile/          # React Native (parent station)
│   ├── web/             # Vanilla TS (baby station)
│   └── server/          # Node.js signaling server
├── packages/
│   ├── shared-types/    # TypeScript interfaces & constants
│   ├── webrtc-config/   # ICE servers, audio constraints
│   └── design-tokens/   # Colors, spacing, typography
├── start                # One-command startup script
├── .env.example         # Environment template
└── turbo.json           # Monorepo orchestration
```

## Environment variables

| Variable | Default | Used by | Description |
|----------|---------|---------|-------------|
| `PORT` | `3003` | Server | Signaling server port |
| `CORS_ORIGIN` | `*` | Server | Allowed origins |
| `SIGNALING_URL` | auto-detected | Web, Mobile | Signaling server URL (set by `./start`) |
| `BABY_STATION_URL` | auto-detected | Mobile | Web app URL for pairing screen |
| `TURN_URL` | _(empty)_ | Web, Mobile | TURN server (optional, for different networks) |
| `TURN_USER` | _(empty)_ | Web, Mobile | TURN username |
| `TURN_PASS` | _(empty)_ | Web, Mobile | TURN password |

> **Note**: `SIGNALING_URL` and `BABY_STATION_URL` are auto-detected by the `./start` script using your local IP. You only need to set them manually if not using `./start`.

## Ports

| Service | Port |
|---------|------|
| Server (Express + Socket.IO) | 3003 |
| Web (Vite) | 5175 |
| Mobile (Metro) | 8081 |

## Commands

```bash
./start           # Start everything (recommended)
pnpm dev          # Start all services via Turborepo
pnpm build        # Build all apps
pnpm test         # Run all tests
pnpm typecheck    # Type check all packages
```

## Troubleshooting

### Mobile app shows blank screen / can't connect
- Make sure both devices are on the **same Wi-Fi network**
- Check that `./start` detected the correct IP
- The mobile app requires a **development build**, not Expo Go

### Web app shows "process is not defined"
- The Vite config defines process.env replacements — make sure you're running via `./start` or `pnpm dev:web`

### "EADDRINUSE" error
- A previous process is still using the port. Run `./start` which auto-kills old processes, or manually: `kill -9 $(lsof -ti:3003)`

### TURN server needed?
- If both devices are on the same Wi-Fi: **no** (STUN is enough)
- If devices are on different networks (e.g., 4G + Wi-Fi): **yes**, configure TURN in `.env`

## License

MIT
