# Session logs

`session-log` creates a concise Obsidian note from the Git context of the active project. It records commits, the current branch, uncommitted file status, and staged and unstaged size summaries. It does not copy diffs or agent conversations into the vault.

## Requirements

- Node.js 20 or later
- Git
- An Obsidian vault with `notes/` and `templates/Note Template.md`

The template must contain these YAML fields:

```yaml
---
type: note
created: <% tp.date.now("YYYY-MM-DD HH:mm") %>
parent:
related:
tags:
summary:
---
```

The command replaces `created`, `parent`, and `summary`. It preserves other fields and adds the `session-log` tag.

## Install

Clone this repository on each computer, then run:

```sh
npm install
npm link
```

This creates a local `session-log` command. The package is not published to npm. Run `npm link` again if you move the cloned repository.

Set `OBSIDIAN_VAULT` to the absolute path of the vault.

On macOS with zsh:

```sh
export OBSIDIAN_VAULT="/Users/your-name/the_kitchen"
```

Add that command to `~/.zshrc` to keep it for later terminal sessions.

On Windows with PowerShell:

```powershell
[Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT", "C:\Users\your-name\the_kitchen", "User")
```

Restart T3Code after setting the variable.

## Configure a project

In the T3Code interface, create a project action whose command is:

```text
session-log
```

The first run asks for the project name and its Obsidian parent note. It writes `.session-log.json` at the repository root:

```json
{
  "project": "Ig Directory Project",
  "parent": "Ig Directory Project"
}
```

Commit this file so every clone uses the same project identity.

## Create a session log

Run the T3Code action at the end of a coding session, or run the command directly:

```sh
session-log
```

The command writes the note to `<vault>/notes/` and prints its path. It uses commits from the active branch since the preceding session log for that project. The first session log includes all commits on the active branch.

If the working tree has uncommitted changes but no new commits, the command still creates a session log. If there are no new commits and the working tree is clean, it creates nothing.

## Development

```sh
npm test
npm run typecheck
```
