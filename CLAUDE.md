# CLAUDE.md: Project Guardrails

This file instructs whoever works on this repository (human or AI assistant)
on how to operate within this project. If a request seems to require
deviating from the rules below, stop and flag it instead of proceeding
autonomously.

Game rules live in [`docs/game-design/`](./docs/game-design/README.md),
architecture in [`docs/architecture/`](./docs/architecture/README.md), the
network protocol in [`docs/protocol/`](./docs/protocol/README.md). Do not
duplicate them here: each concept has a single place it is documented, and
everything else refers to it.

## 1. Repository Structure

Top-level folders are fixed: `packages/`, `apps/`, `content/`, `docs/`,
`.github/`. Do not rename or move them. Add content inside the existing
`docs/` subfolders; flag it first before adding new top-level documentation
categories.

- `packages/core`: pure game logic, no DOM, no network, no three.js.
- `packages/net`: rooms, host/client protocol, state sync, voice routing.
- `apps/web`: Vue + three.js client.
- `content/`: settings (themes) and role presets as JSON.

## 2. Hard Constraints

- No game server of our own. Peer-to-peer only (WebRTC), with free public
  infrastructure for the initial handshake and public STUN. A TURN server is
  optional and configurable, never required.
- Hosting is GitHub Pages only. No paid services, no AWS, no backend.
- No analytics, tracking, accounts or cookies beyond what is strictly needed.
  No personal data leaves the players' browsers.
- No credentials or secrets in the repository or in CI. The one exception is
  the login of a free-tier TURN relay: it is stored as GitHub Actions secrets
  and a variable (`TURN_USERNAME`, `TURN_CREDENTIAL`, `TURN_URLS`), never in
  the repository, and it still ends up in the public bundle (see
  [deployment](./docs/deployment/README.md)). Use a plan without a card, so
  the worst case is an exhausted quota.
- Hidden information (roles, night actions) is never broadcast: the host sends
  each client only what that player may know.

## 3. Versioning

A single version for the whole project, tagged `vX.Y.Z`. Tags, the changelog
and commit message validation are managed with
[cocogitto](https://docs.cocogitto.io) (see [`cog.toml`](./cog.toml)).

## 4. Documentation

Keep `docs/` up to date whenever a change makes it outdated, not only at the
end. Do not restate the same concept in more than one place: document it once,
in the file and section it belongs to, and link to it from elsewhere.

## 5. General Conventions

- **Language**: English for everything in the repository: code, comments,
  configuration, commit messages, Markdown files.
- **No reference to the generative AI tool used for development**, in code,
  comments, configuration, commit messages or pull request descriptions. No
  `Co-Authored-By` trailers. The only exception is the name of this file,
  imposed by the tooling.
- **Punctuation**: never use the em dash in any text in the repository. Use
  comma, period, colon, semicolon, parentheses, or a short hyphen surrounded by
  spaces for asides.
- Commit messages in English, imperative mood, conforming to
  [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(core): add seer night action`).
- File and folder names in kebab-case.
- TypeScript in strict mode. No dead code, no speculative abstractions.
- Do not push, tag, force-push or change repository settings without explicit
  confirmation from the owner.
