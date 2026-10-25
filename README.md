# Coin Race

A small real-time multiplayer browser game. Pick a name and a colour, then race everyone in a
walled arena to the gold coin. Rounds last 60 seconds; the top scorer wins, and a new round
starts 8 seconds later.

#### [Deployed project link](https://freecodecamp-project-secure-real-time.onrender.com)

Started as the freeCodeCamp "Secure Real Time Multiplayer Game" project, now rewritten in
TypeScript with a server-authoritative game loop.

## Running it

Requires Node 24+.

```sh
npm install
npm run dev        # game server on :3000 + Vite on :5173; play on http://localhost:5173
npm test           # Vitest
npm run typecheck
npm run build      # client to dist/client, server to dist/server
npm start          # serves the built game on $PORT (default 3000)
```

Open the game in two tabs to play against yourself. During `npm run dev`, port 3000 only links
to the Vite page, so you never play against a stale build; Vite refuses to start if 5173 is
busy.

## Features

- **Ninja look**: headband ninjas on a sandy training ground. Grab narutomaki slices (1 point)
  and the steaming ramen bowl (5 points); boosts are paper tags. An original, ninja-inspired
  design, not based on any franchise artwork.

- **Join panel** with a name (1-12 characters) and one of 12 colours. Each colour can be used
  by one player, so a game holds up to 12 players. Your last name and colour are remembered.
  Until you join you watch the game as a spectator.
- **Rounds** of 60 seconds, then a results screen with the winner (or a tie) for 8 seconds.
  Scores reset each round.
- **Scoreboard** beside the game, sorted by score, with your row highlighted.
- **Reconnects take your player back.** A successful join returns a secret token; if your
  connection drops, the client rejoins with it and keeps your colour, position and score.
- **Big coins** worth 5 appear every 20-30 seconds and vanish after 5 seconds (they blink
  before they go).
- **Boosts** appear one at a time and last 10 seconds on the board: speed (1.5x for 5 s),
  magnet (pulls coins within 120 px for 6 s), double points (8 s) and slow others (everyone
  else at half speed for 3 s). Different boosts stack; active ones show as icons by your name.

## How the netcode works

| Step                                                               | Where                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Shared rules (movement, walls, coin spawn, rank, input validation) | `src/shared/game.ts`, `src/shared/constants.ts`                |
| Wire format and typed socket events                                | `src/shared/protocol.ts`                                       |
| Authoritative simulation, 30 ticks per second                      | `src/server/world.ts`, `src/server/server.ts`                  |
| Keyboard input                                                     | `src/client/input.ts`                                          |
| Client-side prediction and reconciliation                          | `src/client/prediction.ts`                                     |
| Snapshot interpolation of other players                            | `src/client/interpolation.ts`                                  |
| Fixed 30 Hz client ticks, sending input, reconnects                | `src/client/session.ts`, `src/client/fixed-step.ts`            |
| Joining, rounds and rejoin tokens                                  | `src/server/world.ts`                                          |
| Join panel, scoreboard, saved profile                              | `src/client/ui.ts`, `src/client/storage.ts`                    |
| Drawing order and frame view                                       | `src/client/render.ts`, wired together in `src/client/main.ts` |
| Visual themes (all art; add a theme by implementing `Theme`)       | `src/client/theme/`, ninja theme in `src/client/theme/ninja/`  |

1. **Input.** Each client tick (30 per second) while a key is held, the client sends its key
   state with an increasing sequence number. It never sends a position or score.
2. **Server tick.** The server applies each player's queued inputs in order, moves them with
   the shared movement code, keeps them inside the walls and checks the coin. Only the
   server awards points, so a coin can only be collected once. A credit system limits each
   player to one input per tick on average, so flooding messages does not make you faster.
3. **Snapshots.** After every tick the server broadcasts all players, the coin and, per
   player, the last input sequence it applied.
4. **Prediction.** Your own player moves the moment you press a key: the client runs the same
   movement code locally and remembers inputs the server has not confirmed yet.
5. **Reconciliation.** On each snapshot the client starts from the server's position for
   you, drops confirmed inputs and replays the rest. Small differences are smoothed out
   visually; big ones snap.
6. **Interpolation.** Other players are drawn 100 ms in the past, blended between the two
   snapshots around that time, so they move smoothly even though updates arrive 30 times a
   second.
7. **Boosted prediction.** Snapshots carry each effect's end time. The server applies one
   input per tick, so when replaying, the i-th unconfirmed input only gets effects with more
   than i ticks left. A speed boost therefore ends on the same input on both sides, with no
   correction. Coins and boosts are interpolated like other players, so magnet pulls glide.

## Deploying on Render

Use a Node web service with:

- Build command: `npm install && npm run build`
- Start command: `npm start`

Render sets `PORT` automatically.
