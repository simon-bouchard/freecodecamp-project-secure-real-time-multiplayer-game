# Coin Race

A small real-time multiplayer browser game. Pick a name and a colour, then race everyone in a
walled arena to the gold coin. Rounds last 60 seconds; the top scorer wins, and a new round
starts 8 seconds later.

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
- **Best runs**: every round's final score is saved. The panel beside the game shows Today,
  Month or All time, for Everyone (one row per player, their best) or Mine (your own runs and
  rank). New personal bests that reach a top 10 are announced on the round-over screen. Each
  browser is one player, identified by a random secret key stored in the browser.
- **Themes**: pick **Ninja**, **Classic** (the original yellow-vs-red smileys) or **Flat**
  (plain discs on dark slate) from the Theme menu on the join screen or under the scoreboard.
  It only changes your own screen and is remembered in your browser.

- **Sounds** (Ninja and Flat themes): Ninja uses wood, koto, shamisen, shakuhachi, taiko and
  bells; Flat uses clean blips, marimba and glass chimes. All generated in the browser with Web
  Audio, no audio files. You hear your own pickups, a slow that hits you,
  the round start, the last 5 seconds, the round end and new personal bests. The server lists
  each tick's pickups in the snapshot, so sounds follow what really happened. Toggle with the
  Sound button next to the Theme menu.
- **Controls**: arrow keys or WASD on a keyboard, Space to dash. On a phone or tablet, touch
  and hold where you want to go and your player walks there; drag to steer, double tap to dash.
  Mouse click-and-hold works too. Phones get a stacked layout in portrait and an arena sized to
  the screen in landscape.
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
- **Maps**: Open field, Pillars, Crossroads, Center ring, Lanes and Pinball (whose bumpers
  bounce you off). Obstacles are solid; knockback bounces off them and hitting one ends a dash.
  Players pick the map by vote: on the start screen (your pick is your vote when you join), in a
  10 s vote before the first round (it ends 2 s after everyone has voted) and on every round-over
  screen. Most votes wins; ties, no votes or Random pick at
  random. Collisions with obstacles are predicted, so moving along walls never rubber-bands.
- **Dash**: Space (or a double tap on the game) bursts you forward at 3x speed for 0.15 s, then
  needs 3 s to recharge (the ring around your own player empties and refills). Ramming someone with a dash
  shoves them hard. Your dash starts instantly on your screen; the server enforces the cooldown.
- **Bumping**: players are solid and bounce off each other. The one who gets hit is shoved
  away harder the faster the other was running into them (a speed boost hits harder), and the
  shove fades over 0.3 s and bounces off walls. The server decides every bump; your own client
  replays shoves you received, so they don't fight your prediction.
- **Boosts** appear every 8-12 seconds, up to 2 on the board at once (never two of the same
  kind), and last 10 seconds there: speed (1.5x for 5 s),
  magnet (pulls coins within 120 px for 6 s), double points (8 s) and slow others (everyone
  else at half speed for 3 s). Different boosts stack; active ones show as icons by your name.

## Credits

The Ninja bump sound uses three CC0 sword clash recordings from Freesound, trimmed and
level-matched: #326868 by JohnBuhr, #364531 by Christopherderp and #471095 by spycrah. Every other
sound is generated in the browser.

## How the netcode works

| Step                                                               | Where                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Shared rules (movement, walls, coin spawn, rank, input validation) | `src/shared/game.ts`, `src/shared/constants.ts`                |
| Wire format and typed socket events                                | `src/shared/protocol.ts`                                       |
| Authoritative simulation, 30 ticks per second                      | `src/server/world.ts`, `src/server/server.ts`                  |
| Keyboard and touch-to-move input                                   | `src/client/input.ts`, `src/client/steering.ts`                |
| Client-side prediction and reconciliation                          | `src/client/prediction.ts`                                     |
| Snapshot interpolation of other players                            | `src/client/interpolation.ts`                                  |
| Fixed 30 Hz client ticks, sending input, reconnects                | `src/client/session.ts`, `src/client/fixed-step.ts`            |
| Joining, rounds and rejoin tokens                                  | `src/server/world.ts`                                          |
| Join panel, scoreboard, saved profile                              | `src/client/ui.ts`, `src/client/storage.ts`                    |
| Best runs: SQLite store, recording, per-player views               | `src/server/scores/`                                           |
| Drawing order and frame view                                       | `src/client/render.ts`, wired together in `src/client/main.ts` |
| Visual themes (add one: implement `Theme`, register it, add CSS)   | `src/client/theme/`, ninja theme in `src/client/theme/ninja/`  |

1. **Input.** Each client tick (30 per second) while moving, the client sends a direction
   (length 0 to 1, from the keys or toward the touched spot) with an increasing sequence
   number. It never sends a position or score; the server clamps the length to 1.
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

## Self-hosting

### Deploying from your machine

`npm run deploy` runs the tests and typecheck, builds, copies `dist/` and the package files to
the server with rsync, runs `npm ci --omit=dev` there and restarts the systemd service. Copy
`deploy.env.example` to `deploy.env` (git-ignored) and set the SSH host, the service's folder
and its unit name first. It asks for your sudo password on the server to restart the service.
Use `npm run deploy -- --skip-checks` to skip the tests. The server needs Node 24+.

### Running it by hand

On the machine that runs the game:

```sh
npm install
npm run build
PORT=3000 npm start
```

- Best runs are stored in a SQLite file, `data/coin-race.db` by default (created on first
  start; `data/` is git-ignored). Set `COIN_RACE_DB=/path/to/file.db` to put it elsewhere.
- To back up the leaderboard, copy that file (plus any `-wal`/`-shm` files next to it) while
  the server is stopped, or use `sqlite3 data/coin-race.db ".backup backup.db"` while it runs.
- Node 24 may print a one-line "SQLite is an experimental feature" notice at startup; it is
  harmless.
