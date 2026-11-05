# Lupus in Fabula

A browser-based 3D version of the classic social deduction game (Werewolf /
Mafia), for 4 to 10 players. Fully peer-to-peer: no game server, no install,
no accounts. Share a room code, sit by the fire in a cozy log cabin, and talk.
Works on desktop and on phones held sideways.

## Features

- **A cozy 3D cabin**: a fireplace, a rug, sofas, armchairs, chairs and a
  stool. Daylight through the windows, firelight at night. Players can stand
  up, walk around and sit somewhere else.
- **Phase-aware voice and text chat**: at night only the awake roles (and the
  narrator) hear each other; the dead have a ghost channel of their own.
- **Two narrators**: an automatic one (timers, spoken lines, host can skip), or
  a human narrator who sees everything, wakes the roles and talks to them in
  private. The narrator can choose who plays which role, with validity checks.
- **Survives disconnections**: if the narrator leaves, a dead player or the
  automatic narrator takes over; if the host reloads, the game resumes; if the
  host disappears, the human narrator takes over.
- **Roles**: werewolf, villager, seer, doctor, hunter, bodyguard.
- **Easy to follow**: a big phase title with a colour and icon, a one-line
  "what to do now" for every player, a banner on each change of scene, a
  role card at the start, and a live board of who votes for whom.
- **Sound**: crackling fire, crickets and a howl at night, synthesised in the
  browser (no audio files).
- **English and Italian**, chosen on the home screen.
- **Light on resources**: 30 frames per second, shadows redrawn only when
  somebody moves, shared geometry, and no message sent twice.
- Hidden information is never broadcast: each player only receives their own view.
- Runs on static hosting (GitHub Pages), peer-to-peer over WebRTC.

## Roadmap

- Medium role (roles now stay hidden after death, so it makes sense).
- More roles (possessed, mason, hamster werewolf, thief) and more settings
  (themes) defined as data.
- Smoother recovery: today a returning host or a narrator takeover shows a few
  seconds of "connection lost", and a game with no narrator and no returning
  host ends.

## Known issues (beta)

- A **VPN** (NordVPN and similar) or a strict network can block the peer-to-peer
  connection. Turn the VPN off for the page, or exclude the browser from it, and
  switch off any WebRTC protection. From `v0.1.0-beta.4` a free relay (TURN)
  server is used when a direct connection fails (see
  [deployment](./docs/deployment/README.md)); its monthly quota is small, and
  a VPN can still block it.
- Without a human narrator and without the host coming back, the game ends when
  the host leaves. See the [architecture notes](./docs/architecture/README.md).
- Tested in Chrome; not yet on real phones.

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
