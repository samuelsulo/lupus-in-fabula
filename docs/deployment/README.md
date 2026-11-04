# Deployment

The game is a static site served by GitHub Pages under
`https://samuelsulo.github.io/lupus-in-fabula/`, over HTTPS (required for
microphone access).

## One-time setup

In the repository settings: **Settings, Pages, Source: GitHub Actions**.

## How it is published

A GitHub Actions workflow builds the site and publishes it with the official
Pages actions after CI passes on `main`. No credentials are stored. The
workflow is added together with the first application code.

## Releases

Versions and the changelog are managed with cocogitto: `cog bump --auto`
creates the `vX.Y.Z` tag and the GitHub release (see [`cog.toml`](../../cog.toml)).
