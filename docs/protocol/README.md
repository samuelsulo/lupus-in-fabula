# Protocol

Peers talk over a single Trystero action (`msg`) carrying JSON. Every message has a
version `v` (currently `1`) and a `type`. The schemas live in
[`packages/net/src/protocol.ts`](../../packages/net/src/protocol.ts).

## Client to host

Validated at runtime with zod: the host never trusts a client. Invalid, unknown or
out-of-phase messages are dropped.

| Type     | Payload                                                                     | Meaning                                                                                |
| -------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `hello`  | `name`                                                                      | A guest asks to join the lobby. Sent to every peer that appears; only the host answers |
| `intent` | `night-action` with `target`, or `vote` with `target` (nullable to abstain) | A player's action. The game rules decide if it is valid                                |

## Host to clients

| Type       | Payload                          | Meaning                                                            |
| ---------- | -------------------------------- | ------------------------------------------------------------------ |
| `lobby`    | `hostId`, `players`, `voice`     | Current lobby. Guests pin the sender as host on the first one      |
| `view`     | `view`, `voice`, `phaseEndsInMs` | The game as one player may see it, plus the time left in the phase |
| `rejected` | `reason`                         | The join was refused (`game-in-progress`, `room-full`)             |

`view` is the only game information a client ever receives: its own role, the roles
that are public, role-specific knowledge (the pack for werewolves, inspections for
the seer) and the action it may take now. See `viewFor` in
[`packages/core`](../../packages/core/src/view.ts).

## Voice permissions

Every `lobby` and `view` carries `voice: { speakTo, hearFrom }`, computed from the
game phase (rules in [game design](../game-design/README.md)). A client sends its
microphone stream only to `speakTo` and mutes audio from peers not in `hearFrom`.

## Timers

The host runs the narrator timers ([`timing.ts`](../../packages/net/src/timing.ts)) and
sends `phaseEndsInMs` (a duration, not a timestamp, so clock skew does not matter).
