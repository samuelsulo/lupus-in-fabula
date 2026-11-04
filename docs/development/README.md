# Development

## Setup

```sh
mise install        # node, pnpm, cocogitto, lefthook, gh, gitleaks
lefthook install    # git hooks
```

## Git hooks

- `commit-msg`: validates the message with `cog verify`.
- `pre-push`: runs `cog check` on the history.

Lint, format, type-check and test hooks are added together with the first
packages.

## Conventions

Commit format, naming and language rules are defined once in
[`CLAUDE.md`](../../CLAUDE.md).
