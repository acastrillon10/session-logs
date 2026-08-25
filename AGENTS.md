## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain documentation layout. See `docs/agents/domain.md`.

## Working style

- Prefer the smallest change that fully satisfies the request.
- Do not refactor unrelated code, add dependencies, or make opportunistic improvements unless explicitly asked.
- Inspect only the files relevant to the task before editing. If the change may affect substantially more than two areas, explain the expanded scope before proceeding.
- Do not browse the web unless current external information is necessary to complete the task.
- Use focused implementation and verification passes, then stop.
- End with a concise summary, verification performed, and changed files.

## Git workflow

### Branch names

- Name feature branches after the context of the change.
- When working on a sub-issue, name the branch after the parent issue.
- Do not use generic names such as `main-1`.

### Commit messages

- Write commits in English using Conventional Commits.
- Keep the subject concise and diary-friendly: describe the user-visible outcome or decision, not implementation trivia.
- Aim for 200 characters or fewer in the subject.
- Use an optional body only when it adds meaningful context.
- Limit the body to three or four short bullets explaining why the change matters or any follow-up work.