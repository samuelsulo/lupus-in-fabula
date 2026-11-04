# Architecture

## Packages

| Package | Responsibility |
|---|---|
| `packages/core` | Pure TypeScript game logic: state machine, roles, rules. Deterministic (seeded RNG), no DOM, no network |
| `packages/net` | Rooms, host/client protocol, state sync, voice routing |
| `apps/web` | Vue 3 UI (lobby, overlays) and the three.js scene |
| `content/` | Settings (themes) and role presets as JSON, validated by a schema |

## Networking model

- Peer-to-peer over WebRTC. Free public relays are used only for the initial
  handshake, plus public STUN. TURN is optional and configurable.
- One host is authoritative: clients send intents, the host validates them
  against the rules and broadcasts results.
- Hidden information is never broadcast: the host sends each client only what
  that player may know.
- If the host leaves, the game ends cleanly (host migration is out of scope).

## Known limits

- Strict NATs (about 10-15% of connections) may need a TURN server.
- In automatic narrator mode the host can technically read the full state.

The wire format is described in [`../protocol/`](../protocol/README.md).
