# Development

## Setup

```sh
mise install        # node, pnpm, cocogitto, lefthook, gh, gitleaks
lefthook install    # git hooks
pnpm install
```

## Commands

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `pnpm dev`          | Starts the web client with hot reload                |
| `pnpm test`         | Unit tests of every package                          |
| `pnpm lint:check`   | ESLint                                               |
| `pnpm format:check` | Prettier (use `pnpm format` to fix)                  |
| `pnpm type-check`   | TypeScript and vue-tsc                               |
| `pnpm build`        | Production build of the web client (`apps/web/dist`) |

## Git hooks

- `pre-commit`: ESLint and Prettier on staged files (fixes are re-staged), then type-check.
- `commit-msg`: validates the message with `cog verify`.
- `pre-push`: runs `cog check` on the history.

## Trying a game locally

Open several browser windows (use separate profiles or private windows) on the dev
server: one creates a room, the others join with the code. The peers connect through
public relays even on localhost. Use at least 4 windows to start a game.

## Conventions

Commit format, naming and language rules are defined once in
[`CLAUDE.md`](../../CLAUDE.md).
