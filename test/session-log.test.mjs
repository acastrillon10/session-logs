import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../src/session-log.mjs", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "session-log-test-"));
  const repository = path.join(root, "project");
  const vault = path.join(root, "vault");
  mkdirSync(repository);
  mkdirSync(path.join(vault, "notes"), { recursive: true });
  mkdirSync(path.join(vault, "templates"), { recursive: true });
  writeFileSync(path.join(vault, "templates", "Note Template.md"), `---
type: note
created: <% tp.date.now("YYYY-MM-DD HH:mm") %>
parent:
related:
tags:
summary:
---
`);
  git(repository, "init", "-b", "main");
  git(repository, "config", "user.name", "Test User");
  git(repository, "config", "user.email", "test@example.com");
  return { repository, vault };
}

function commitFile(repository, name, content, message) {
  writeFileSync(path.join(repository, name), content);
  git(repository, "add", name);
  git(repository, "commit", "--no-verify", "-m", message);
}

function runSessionLog({ repository, vault, input = "" }) {
  return spawnSync(process.execPath, [cliPath], {
    cwd: repository,
    encoding: "utf8",
    env: { ...process.env, OBSIDIAN_VAULT: vault },
    input,
  });
}

test("creates a session log from Git context", () => {
  const { repository, vault } = createFixture();
  writeFileSync(path.join(repository, ".session-log.json"), JSON.stringify({
    project: "Example Project",
    parent: "Example Project",
  }));
  git(repository, "add", ".session-log.json");
  commitFile(repository, "feature.txt", "complete\n", "feat: add useful feature");
  git(repository, "remote", "add", "origin", "ssh://git@github.com/example/example-project.git");

  const result = runSessionLog({ repository, vault });

  assert.equal(result.status, 0, result.stderr);
  const notes = readdirSync(path.join(vault, "notes"));
  assert.equal(notes.length, 1);
  assert.match(notes[0], /^Example Project — Session Log — /);
  const note = readFileSync(path.join(vault, "notes", notes[0]), "utf8");
  assert.match(note, /^created: \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/m);
  assert.match(note, /parent:\n  - "\[\[Example Project\]\]"/);
  assert.match(note, /tags:\n  - session-log/);
  assert.match(note, /summary: "\(01\) Added useful feature\."/);
  assert.match(note, /- Branch: `main`/);
  assert.match(note, /feat: add useful feature/);
  assert.equal(result.stdout.trim(), path.join(vault, "notes", notes[0]));
  assert.match(note, /https:\/\/github\.com\/example\/example-project\/commit\/[0-9a-f]{40}/);
});

test("includes every commit in the initial session log", () => {
  const { repository, vault } = createFixture();
  writeFileSync(path.join(repository, ".session-log.json"), JSON.stringify({
    project: "Example Project",
    parent: "Example Project",
  }));
  git(repository, "add", ".session-log.json");
  for (let index = 1; index <= 101; index += 1) {
    commitFile(repository, "history.txt", `${index}\n`, `feat: add history entry ${index}`);
  }

  const result = runSessionLog({ repository, vault });

  assert.equal(result.status, 0, result.stderr);
  const [name] = readdirSync(path.join(vault, "notes"));
  const note = readFileSync(path.join(vault, "notes", name), "utf8");
  assert.match(note, /Initial capture: all commits on the active branch\./);
  assert.match(note, /feat: add history entry 1\b/);
  assert.match(note, /feat: add history entry 101\b/);
});

test("does not create another session log when no work changed", () => {
  const { repository, vault } = createFixture();
  writeFileSync(path.join(repository, ".session-log.json"), JSON.stringify({
    project: "Example Project",
    parent: "Example Project",
  }));
  git(repository, "add", ".session-log.json");
  commitFile(repository, "feature.txt", "complete\n", "feat: add useful feature");
  const firstRun = runSessionLog({ repository, vault });
  assert.equal(firstRun.status, 0, firstRun.stderr);

  const secondRun = runSessionLog({ repository, vault });

  assert.equal(secondRun.status, 0, secondRun.stderr);
  assert.match(secondRun.stdout, /No work found since the previous session log\./);
  assert.equal(readdirSync(path.join(vault, "notes")).length, 1);
});

test("asks for project settings on the first run", () => {
  const { repository, vault } = createFixture();
  commitFile(repository, "feature.txt", "complete\n", "feat: add useful feature");

  const result = runSessionLog({
    repository,
    vault,
    input: "Prompted Project\n\n",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(repository, ".session-log.json"), "utf8")),
    { project: "Prompted Project", parent: "Prompted Project" },
  );
  assert.match(result.stdout, /Project name:/);
  assert.match(result.stdout, /Obsidian parent note \[Prompted Project\]:/);
  assert.match(result.stdout, /Created project configuration:/);
  assert.equal(readdirSync(path.join(vault, "notes")).length, 1);
});

test("records staged and unstaged Git context without patch contents", () => {
  const { repository, vault } = createFixture();
  writeFileSync(path.join(repository, ".session-log.json"), JSON.stringify({
    project: "Example Project",
    parent: "Example Project",
  }));
  git(repository, "add", ".session-log.json");
  commitFile(repository, "feature.txt", "baseline\n", "feat: add baseline");
  assert.equal(runSessionLog({ repository, vault }).status, 0);

  writeFileSync(path.join(repository, "feature.txt"), "UNSTAGED_SECRET_CONTENT\n");
  writeFileSync(path.join(repository, "staged.txt"), "STAGED_SECRET_CONTENT\n");
  git(repository, "add", "staged.txt");

  const result = runSessionLog({ repository, vault });

  assert.equal(result.status, 0, result.stderr);
  const notes = readdirSync(path.join(vault, "notes"));
  assert.equal(notes.length, 2);
  const note = notes.map((name) => readFileSync(path.join(vault, "notes", name), "utf8"))
    .find((content) => content.includes("Worked on uncommitted changes"));
  assert.ok(note);
  assert.match(note, /summary: "Worked on uncommitted changes; no commits recorded\."/);
  assert.match(note, /` M feature\.txt`/);
  assert.match(note, /`A  staged\.txt`/);
  assert.match(note, /### Unstaged changes/);
  assert.match(note, /### Staged changes/);
  assert.doesNotMatch(note, /UNSTAGED_SECRET_CONTENT|STAGED_SECRET_CONTENT/);
});

test("preserves template fields and tags", () => {
  const { repository, vault } = createFixture();
  writeFileSync(path.join(vault, "templates", "Note Template.md"), `---
type: note
created: <% tp.date.now("YYYY-MM-DD HH:mm") %>
parent:
related:
  - "[[Existing Note]]"
tags: [existing-tag, work]
summary:
reviewed: false
---
`);
  writeFileSync(path.join(repository, ".session-log.json"), JSON.stringify({
    project: "Example Project",
    parent: "Project Home",
  }));
  git(repository, "add", ".session-log.json");
  commitFile(repository, "feature.txt", "complete\n", "feat: add useful feature");

  const result = runSessionLog({ repository, vault });

  assert.equal(result.status, 0, result.stderr);
  const [name] = readdirSync(path.join(vault, "notes"));
  const note = readFileSync(path.join(vault, "notes", name), "utf8");
  assert.match(note, /type: note/);
  assert.match(note, /related:\n  - "\[\[Existing Note\]\]"/);
  assert.match(note, /tags:\n  - existing-tag\n  - work\n  - session-log/);
  assert.match(note, /reviewed: false/);
  assert.match(note, /parent:\n  - "\[\[Project Home\]\]"/);
});

test("records uncommitted Git context before the first commit", () => {
  const { repository, vault } = createFixture();
  writeFileSync(path.join(repository, ".session-log.json"), JSON.stringify({
    project: "New Project",
    parent: "New Project",
  }));
  writeFileSync(path.join(repository, "draft.txt"), "work in progress\n");

  const result = runSessionLog({ repository, vault });

  assert.equal(result.status, 0, result.stderr);
  const [name] = readdirSync(path.join(vault, "notes"));
  const note = readFileSync(path.join(vault, "notes", name), "utf8");
  assert.match(note, /summary: "Worked on uncommitted changes; no commits recorded\."/);
  assert.match(note, /- HEAD: `unborn branch`/);
  assert.match(note, /- `\?\? draft\.txt`/);
});
