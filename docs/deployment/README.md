# Deployment

The game is a static site served by GitHub Pages under
`https://samuelsulo.github.io/lupus-in-fabula/`, over HTTPS (required for
microphone access).

## One-time setup

In the repository settings: **Settings, Pages, Source: GitHub Actions**.

## How it is published

The workflow [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) builds the
site and publishes it with the official Pages actions, only after the CI workflow
succeeded on a push to `main`. No credentials are stored: Pages uses the built-in
token of the workflow. The Vite base path is set to `/<repo-name>/` through the
`VITE_BASE` variable.

## Relay (TURN) server

Players behind strict NATs or some mobile operators cannot connect directly and
need a relay. The game works without one; to enable it, create a free account on
[Metered Open Relay](https://www.metered.ca/tools/openrelay/) and add these in
the repository settings (Settings, Secrets and variables, Actions):

| Name              | Kind     | Value                                                                                                    |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `TURN_URLS`       | variable | comma separated list, e.g. `turn:<host>:80,turn:<host>:443?transport=tcp,turns:<host>:443?transport=tcp` |
| `TURN_USERNAME`   | secret   | the username given by the provider                                                                       |
| `TURN_CREDENTIAL` | secret   | the credential given by the provider                                                                     |

A secret only keeps the login out of the repository and the CI logs: it still
ends up in the public bundle, because a static site cannot hide it. Use a free
plan without a card, so the worst case is an exhausted quota. Traffic through
the relay stays encrypted end to end. For a local build, set `VITE_TURN_URLS`,
`VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` instead. Redeploy after changing them.

## Releases

Versions and the changelog are managed with cocogitto: `cog bump --auto`
creates the `vX.Y.Z` tag and the GitHub release (see [`cog.toml`](../../cog.toml)).
