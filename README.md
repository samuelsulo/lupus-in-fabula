# Lupus in Fabula

A browser-based 3D version of the classic social deduction game (Werewolf /
Mafia), for 4 to 10 players. Fully peer-to-peer: no game server, no install,
no accounts. Share a room code, sit in the circle, and talk.

> Work in progress. Nothing is playable yet.

## Features (planned)

- Players sit on chairs in a circle in a low-poly 3D scene, with day and night
  cycles.
- Proximity-free, phase-aware voice chat: at night only the awake roles hear
  each other.
- Human narrator or automatic narrator.
- Roles and settings (themes) defined as data, easy to extend.
- Runs on static hosting (GitHub Pages), peer-to-peer over WebRTC.

## Getting started

Tools are pinned with [mise](https://mise.jdx.dev):

```sh
mise install
lefthook install
```

See [`docs/development/`](./docs/development/README.md) for the full setup and
[`docs/`](./docs/README.md) for the documentation index.

## License

[MIT](./LICENSE)
