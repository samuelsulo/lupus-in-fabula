# Lupus in Fabula

A browser-based 3D version of the classic social deduction game (Werewolf /
Mafia), for 4 to 10 players. Fully peer-to-peer: no game server, no install,
no accounts. Share a room code, sit in the circle, and talk.

> Early version: a full game (lobby, roles, night, day, vote, voice) works between browsers.
> Automatic narrator only, four roles, one setting. See the roadmap below.

## Features

- Players sit on chairs in a circle in a low-poly 3D scene, with day and night
  cycles.
- Phase-aware voice chat: at night only the awake roles hear each other, the dead
  cannot be heard by the living.
- Automatic narrator with timers (the host can skip them).
- Roles: werewolf, villager, seer, doctor.
- Hidden information is never broadcast: each player only receives their own view.
- Runs on static hosting (GitHub Pages), peer-to-peer over WebRTC.

## Roadmap

- Human narrator mode.
- More roles (hunter, medium, bodyguard, possessed, mason).
- More settings (themes) defined as data, and sound.
- Reconnection of players, host migration.

## Getting started

Tools are pinned with [mise](https://mise.jdx.dev):

```sh
mise install
lefthook install
pnpm install
pnpm dev
```

See [`docs/development/`](./docs/development/README.md) for the full setup and
[`docs/`](./docs/README.md) for the documentation index.

## License

[MIT](./LICENSE)
