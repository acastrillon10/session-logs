# Domain docs

These rules tell engineering skills how to read this repository's domain documentation before exploring the codebase.

## Read before exploring

- Read `CONTEXT.md` at the repository root.
- If `CONTEXT-MAP.md` exists instead, use it to find and read each `CONTEXT.md` relevant to the task.
- Read ADRs under `docs/adr/` that affect the area being changed.
- In a multi-context repository, also check `src/<context>/docs/adr/` for context-specific decisions.

If these files do not exist, proceed without reporting their absence. The `/domain-modeling` skill creates them when the project resolves domain terms or architectural decisions.

## File structure

This repository uses the single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

A repository becomes multi-context when it has a root `CONTEXT-MAP.md`:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use glossary terms

When output names a domain concept in an issue title, proposal, hypothesis, or test name, use the term defined in `CONTEXT.md`. Avoid synonyms that the glossary rejects.

If the glossary lacks a needed concept, reconsider whether the term belongs to the project. Record a genuine terminology gap for `/domain-modeling`.

## Report ADR conflicts

Explicitly report any conflict with an existing ADR. Do not override the recorded decision silently.
