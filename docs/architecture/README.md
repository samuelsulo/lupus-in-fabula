# Architecture

## Packages

| Package         | Responsibility                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/core` | Pure TypeScript game logic: state machine, roles, rules. Deterministic (seeded RNG), no DOM, no network |
| `packages/net`  | Rooms, host/client protocol, state sync, voice routing                                                  |
| `apps/web`      | Vue 3 UI (lobby, overlays) and the three.js scene                                                       |
| `content/`      | Settings (themes) and role presets as JSON                                                              |

## Networking model

- Peer-to-peer over WebRTC. Free public relays are used only for the initial
  handshake, plus public STUN. TURN is optional and configurable.
- One host is authoritative: clients send intents, the host validates them
  against the rules and broadcasts results.
- Hidden information is never broadcast: the host sends each client only what
  that player may know.
- If the host leaves, a game in progress tries to recover (see below) instead of ending at once.

## The client

- `apps/web/src/scene/`: the three.js cabin. `room.ts` and `furniture.ts` build
  the static room, `avatar.ts` the people (seated and standing), and
  `cozy-scene.ts` runs it: seating, walking, lighting and picking with the mouse
  or a finger.
- `i18n.ts`: every visible string, in English and Italian. Code, comments and
  docs stay in English.
- `ambience.ts` (sound) and `narration.ts` (spoken lines) use only browser APIs.

## When the host leaves

All the state lives in the host's browser, so the game has two ways to survive it.
Both avoid giving the hidden state to anybody who should not see it.

- **The host comes back (reload, crash).** The host keeps a snapshot of the game
  in its own `localStorage`, up to date after every change. On the home screen it
  offers "Resume the game". The game restarts **paused**; every player's browser
  keeps a secret token (in `sessionStorage`), and when they say hello again the
  host recognises them even though their connection id changed (all ids in the
  state are rewritten). The game continues when everybody is back, or when the
  host presses "Continue without them".
- **A human narrator takes over.** The narrator already sees every role, so the
  host sends them the same snapshot after each change. If the host disappears,
  the guests show "connection lost" and, after a few seconds, the narrator
  becomes the host with the game exactly where it was, and announces it. Guests
  only believe that announcement when it comes from the narrator.
- If both happen, the returning host notices someone else already runs the game
  and rejoins as a player, with its token.
- Without a human narrator and without the host coming back within a minute,
  the game ends. The snapshot sent to the narrator contains the players' tokens,
  which is acceptable because the narrator is trusted with the whole game.

## Performance

The game barely moves, so the client spends as little as it can:

- The render loop is capped at 30 frames per second, and does nothing in a
  background tab.
- Furniture matrices are frozen, and the shadow map is redrawn only when
  somebody moves or sits.
- Geometries shared by all people are built once; a vote count only swaps a
  label instead of rebuilding a person.
- The pixel ratio is capped at 1.5, and antialiasing is skipped on dense
  screens.
- The host sends a player's view only when it changed, and the seating only
  when it changed. Voice is mono. Ambient sound does no work when muted or hidden.
- three.js loads only when a game starts, so the home page stays small.

## Known limits

- Strict NATs (about 10-15% of connections) may need a TURN server.
- In automatic narrator mode the host can technically read the full state.
- With a human narrator who is not the host, the host machine still holds the full state.
- A returning host or a narrator takeover is not seamless: players see "connection lost" for a few seconds.

The wire format is described in [`../protocol/`](../protocol/README.md).
