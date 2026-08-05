# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Code review convention

Reviews run once per pull request, not once per push. `.coderabbit.yaml` sets
`auto_incremental_review: false`; ask for a re-review with `@coderabbitai review`
when the branch is genuinely ready.

Open pull requests as drafts and work there. Draft pull requests are not reviewed,
so the pipeline's own fix commits cost nothing, and the author marks it ready when
the branch is finished.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
