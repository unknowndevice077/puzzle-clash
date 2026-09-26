# Puzzle Clash

Real-time PvP jigsaw race. Both players get the **same picture cut into the same pieces**. Drag pieces onto the board, and each one clicks in when it's close to its spot. Your opponent's progress bar climbs live next to yours, and the first to place the last piece wins the round. A match is best of 1, 3 or 5.

- **Play a friend:** a private room with a 5-letter code and a QR code. Works over your home Wi-Fi.
- **Quick match:** get paired with anyone online.
- **Solo practice:** beat your best time. The fastest solves go on the leaderboard.
- **Difficulties:** Easy (12 pieces, faded picture on the board), Medium (20, piece outlines), Hard (35, nothing).
- **Picture packs:**
  - **Studio Ghibli:** 300 scene stills from 12 films.
  - **Nature & places:** 263 Unsplash photos.
  - **Our own pictures:** the friend-room host uploads images for that room only. They're deleted when the room closes.
- Built for phones and desktop: touch and mouse dragging, and a portrait or landscape table depending on the screen.

Same stack and structure as Copy Cat Clash:

- `shared/`: types, zod schemas, typed socket events, and the jigsaw generator
- `server/`: Express + Socket.IO + SQLite. The server referees every match.
- `client/`: React + Vite + Tailwind + Zustand + Framer Motion

## Run it

```bash
cd puzzle-clash
npm install
npm run dev          # client http://localhost:5174 (server on :5070)
```

Production-style, as one server:

```bash
npm run build
cd server && node dist/index.js      # http://localhost:5070
```

### Play on your local network (phones)

Start the server as above. On any device, open `http://<this-PC's-LAN-IP>:5070`, then tap **Create room** and let the other phone scan the QR code. The QR code points at the PC's network address automatically, even if you opened the game on `localhost`.

Why port 5070: browsers refuse to open some ports. 5060 is one of them (reserved for SIP phone calls), so don't use it.

### Testing two players in one browser

Add `?profile=a` and `?profile=b` to the URL in two tabs. Each profile is a separate player.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server (watch mode) and client together |
| `npm run build` | Builds the client and bundles the server |
| `npm run typecheck` | Strict TypeScript for all packages |
| `npm run photos:ghibli` | Downloads the Studio Ghibli stills and keeps the 25 most colourful per film |
| `npm run photos:fetch` | Downloads the Unsplash photos listed in `server/photos/sources.json`, then writes `photos.json` with both packs |
| `npm run test:jigsaw` | Checks that puzzles are deterministic and that every tab fits its neighbour (`-- --svg out.svg` writes a preview) |

The pictures are already downloaded into `server/photos/`. The scripts only matter if you want to rebuild or extend the packs.

## How the game stays fair

- The server sends one seed per round. Both clients generate the identical cut and the identical starting scatter from it (`shared/src/jigsaw.ts`).
- Each round's picture is delivered through a player-bound URL, and only at the countdown, so nobody sees the next picture early.
- Every placement is checked by the server: the right round, the piece not already placed, a drop within the tolerance of its true slot, and a minimum time between placements. The server alone decides finish times, round winners and forfeits.
- If a player disconnects, they have 30 seconds to come back before forfeiting.

## Picture licensing

- **Studio Ghibli:** stills from the studio's official gallery. The studio released them for free use "within the bounds of common sense" ([notice, 2020-09-18](https://www.ghibli.jp/info/013344/)). Every round credits the film and Studio Ghibli.
- **Nature & places:** Unsplash photos under the Unsplash License. The photographers are credited in `server/photos/sources.json`.
- **Our own pictures:** uploaded by the room host for private play. They're validated as JPEG, PNG or WebP by their file contents, re-encoded, kept only for that room, and deleted when it closes. The public packs don't include frames from other shows or anime, because those are copyrighted.

## Deploy (Render)

`render.yaml` in this folder is a Render Blueprint: one Docker web service with a 1 GB disk for players and best times. No secrets are needed.

1. Push this folder to its own GitHub repo.
2. In Render, go to **New → Blueprint** and pick the repo, then deploy.

The disk needs a paid instance (Starter). On the free plan, delete the `disk:` block; players and best times then reset on every deploy.

With plain Docker:

```bash
docker compose up --build      # http://localhost:5070
```

## Environment

See `.env.example`. The important settings are `PORT` (5070), `TRUST_PROXY` (true behind Render or Nginx), `HTTPS`, and `DATA_DIR`. `HTTPS` defaults on in production; set it to `false` when serving over plain http on a LAN.
