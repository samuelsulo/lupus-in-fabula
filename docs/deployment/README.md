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

## Releases

Versions and the changelog are managed with cocogitto: `cog bump --auto`
creates the `vX.Y.Z` tag and the GitHub release (see [`cog.toml`](../../cog.toml)).
