# Working method

How we work on a project. It is a preference: a project extends or changes it according to its
needs, and says so here.

## From plan to pull request

1. The developer and the AI agent plan the work together.
2. The plan becomes issues on GitHub, using the templates in `.github/ISSUE_TEMPLATE/` (also a
   starting point: extend or remove them).
3. Each issue is solved by its own pull request, which closes it with `Closes #<number>` in the
   description. One issue, one pull request.

## Git strategy

GitHub Flow: trunk-based, with short-lived branches.

- `main` is the only long-lived branch and is always releasable. No `develop`, no `release/*`.
- One branch per issue, named `<type>/<issue-number>-<slug>` (for example
  `feat/42-contact-form`), created from `main` and deleted after the merge.
- Merge with squash. The title of the pull request is the Conventional Commit that lands on
  `main`, and its description holds `Closes #<number>`. The commits on the branch are free, but the
  `commit-msg` hook checks them anyway.
- Protect `main`: changes arrive through pull requests only, no force-push.
- Hotfixes follow the same flow.
- Tags and releases are decided by the project and made on `main`.

## Commits

Conventional Commits, in English, imperative mood, with a scope from `cog.toml`
(`feat(web): add contact form validation`). The `commit-msg` hook runs `cog verify`.

## Minimum checks

- **Secrets**: the `pre-commit` hook runs gitleaks, so a secret is stopped before it is committed.
  A hook can be skipped or not installed, so a project should also run gitleaks in CI.
- **Pull request title**: with squash merge it becomes the commit on `main`, so a project should
  check in CI that it is a valid Conventional Commit (`cog verify`).

The template ships no workflow: each project writes the ones it needs.
