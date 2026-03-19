# Project Structure

- `cli/`: main Bun CLI package; entrypoint, compiler wrapper, runtime stubs, build script.
- `assembly/`: AssemblyScript package for Wasm-side work; config, roadmap, build/test scripts.
- `harness/`: host-runtime packages; `js/`, `wazero/`, and `wasmtime/` are working hosts.
- `docs/`: architecture, ABI, planning, and research docs named `[serial]-[YYYY-MM-DD]-[kebab-case-title].md`.
- `CHANGELOG.md`: repo change history.

## Rules

- Keep this file compact.
- Look in `docs/` first for prior architecture, ABI, release, planning, and research context.
- `agent-todo.md` must contain only actual remaining todo items for unreleased work; do not keep released-version notes, shipped scope summaries, or other retrospective content there.
- Organize `agent-todo.md` by upcoming version first, then within each version by `Blockers`, then `Risks`, then feature sections in implementation priority order, with each feature section listing only remaining work.
- Gitignore newly discovered build/cache directories when they are not meant to be tracked.
- Update relevant `README.md` files when surface API or user-facing project info changes.

## Commit Process

- Run `bun format`.
- Run `bun validate`, confirm zero diagnostics, and run all primary test suites.
- Before commit, investigate `agent-todo.md` and update the tasks with new blockers, risks, and remove completed items.
- Update `CHANGELOG.md`.
- Every commit needs a title and detailed body with changed files and reasons.
- Changelog entries must include: date, bold title, short description, emphasized GitHub username of the changer.
- Write commit text to a temp file, commit with `git commit -F`, then delete the temp file.

## Publish Workflow

- When asked to publish a release, require an explicit semver bump type: `patch`, `minor`, or `major`.
- Run `bun validate` and stop immediately if it fails.
- Bump all package versions for the requested release type, keeping versions aligned if the repo uses lockstep versioning.
- Write a short changelog summary to a temporary file and reuse the same text for both the tag annotation and the GitHub release notes.
- Commit all release-related changes using the normal repository commit strategy.
- Create an annotated tag named `v#.#.#` with `git tag -a -F <temp file>`; do not use a lightweight tag.
- Push the release commit and the tag.
- Create or update the GitHub release for the same tag using the same changelog summary; do not create duplicate releases.
- Monitor CI until it passes.
- Report the relevant commit, tag, release, and CI details.

## Research Process

- Research must be detailed, directly relevant to current or planned `as-harness` work, and grounded in the current repo state.
- Place research in `docs/[serial]-[YYYY-MM-DD]-[kebab-case-title].md`; do not add ad hoc research files elsewhere.
- Choose the next unused zero-padded serial id by scanning `docs/`, use the commit date in `YYYY-MM-DD`, and keep the title concise and searchable.
- Make the document title and opening paragraph identify the question, recommendation, and affected repo area so future agents can find the right research quickly.
