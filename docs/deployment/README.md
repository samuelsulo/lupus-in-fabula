# Deployment

The game is a static site served by GitHub Pages under
`https://samuelsulo.github.io/lupus-in-fabula/`, over HTTPS (required for
microphone access).

## One-time setup

In the repository settings: **Settings, Pages, Source: GitHub Actions**. Then
**Settings, Environments, github-pages, Deployment branches and tags**: allow
the tag pattern `v*`, otherwise the deploy of a tag is rejected.

## How it is published

The workflow [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) builds the
site and publishes it with the official Pages actions, only when a version tag
(`vX.Y.Z`, created by `cog bump`) is pushed: a push to `main` alone does not
deploy. The tag is pushed after `main`, whose CI has already run on the same
commit. Pages uses the built-in token of the workflow, so no credentials are
stored. The Vite base path is set to `/<repo-name>/` through the
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
`VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` instead. The values are read at
build time: publish a new release after changing them.

## Releases

Versions and the changelog are managed with cocogitto (see
[`cog.toml`](../../cog.toml)). `cog bump --auto` picks the next version; for a
pre-release set it explicitly, e.g. `cog bump --version 0.1.0-beta.5`
(`--pre` also needs a bump kind). The command creates the version commit and
the `vX.Y.Z` tag, pushes both and creates the GitHub release, marked as a
pre-release when the version has a suffix. Pushing the tag is what starts the
deploy: wait for the CI of `main` to be green first, because the deploy does not
check it.
