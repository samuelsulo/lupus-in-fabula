# Protocol

To be written alongside `packages/net`. Principles:

- Versioned message schema, validated at runtime.
- Clients send intents; the host sends results and per-player views.
- Unknown or out-of-phase messages are rejected.
