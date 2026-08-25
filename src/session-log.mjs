#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";

const LOG_SEPARATOR = " — Session Log — ";
const MAX_COMMIT_ENTRIES = 100;
const INITIAL_COMMIT_ENTRIES = 20;

function runGit(args, cwd = process.cwd()) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trimEnd();
  } catch (error) {
    const message = error.stderr?.toString().trim() || error.message;
    throw new Error(`Unable to run git ${args.join(" ")}: ${message}`);
  }
}

function formatLocalDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseCreatedDate(content) {
  const match = content.match(/^created:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/m);
  if (!match) return null;
  const [year, month, day] = match[1].split("-").map(Number);
  return new Date(year, month - 1, day, Number(match[2]), Number(match[3]));
}

function parseEndingCommit(content) {
  return content.match(/^- HEAD: `([0-9a-f]{40})`$/m)?.[1] ?? null;
}

function safeFilenamePart(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "");
}

function findPreviousLog(notesPath, logPrefix) {
  const logs = readdirSync(notesPath)
    .filter((name) => name.startsWith(logPrefix) && name.endsWith(".md"))
    .map((name) => {
      const filePath = path.join(notesPath, name);
      const content = readFileSync(filePath, "utf8");
      return {
        date: parseCreatedDate(content) ?? statSync(filePath).mtime,
        duplicate: Number(name.match(/ \((\d+)\)\.md$/)?.[1] ?? 1),
        endingCommit: parseEndingCommit(content),
      };
    })
    .filter(({ date }) => !Number.isNaN(date.valueOf()));
  return logs.sort((a, b) => b.date - a.date || b.duplicate - a.duplicate)[0] ?? null;
}

function getRemote(repository) {
  try {
    return runGit(["remote", "get-url", "origin"], repository);
  } catch {
    return "";
  }
}

function getCommitUrl(remote, sha) {
  const match = remote.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/)
    ?? remote.match(/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/)
    ?? remote.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/);
  if (!match) return null;
  const githubPath = match[1];
  return `https://github.com/${githubPath}/commit/${sha}`;
}

function isAncestor(ancestor, descendant, repository) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: repository,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function getCommits({ previousLog, head, repository }) {
  if (!head) return [];
  const args = ["log", "--format=%H%x1f%B%x1e"];
  if (previousLog?.endingCommit && isAncestor(previousLog.endingCommit, head, repository)) {
    args.push(`${previousLog.endingCommit}..${head}`);
  } else if (previousLog) {
    args.push(`--since=${previousLog.date.toISOString()}`);
  } else {
    args.push(`-${INITIAL_COMMIT_ENTRIES}`);
  }
  const output = runGit(args, repository);
  if (!output) return [];
  return output.split("\u001e").filter((record) => record.trim()).map((record) => {
    const [sha, message] = record.trim().split("\u001f");
    return { sha, message: message.trim(), subject: message.split("\n", 1)[0] };
  });
}

function isMergeCommit(subject) {
  return subject.startsWith("Merge pull request");
}

function getCommitSummary({ subject, message }) {
  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);
  const source = isMergeCommit(subject) ? lines[1] ?? subject : subject;
  const summary = source.replace(/^[\w-]+(?:\([^)]*\))?!?:\s*/i, "");
  if (!summary) return "";
  const pastTense = {
    add: "Added", create: "Created", document: "Documented", fix: "Fixed",
    focus: "Focused", improve: "Improved", implement: "Implemented",
    organize: "Organized", remove: "Removed", support: "Supported", update: "Updated",
  };
  return summary.split(" ").map((word, index, words) => {
    const replacement = pastTense[word.toLowerCase()];
    if (replacement && (index === 0 || words[index - 1].toLowerCase() === "and")) {
      return index === 0 ? replacement : replacement.toLowerCase();
    }
    return index === 0 ? `${word[0].toUpperCase()}${word.slice(1)}` : word;
  }).join(" ");
}

function getSummary(commits, status) {
  if (commits.length === 0) {
    return status ? "Worked on uncommitted changes; no commits recorded." : "No repository changes since the previous session log.";
  }
  const summaries = [...new Set(commits.map(getCommitSummary).filter(Boolean))].slice(0, 2);
  const suffix = commits.length > summaries.length ? `; and ${commits.length - summaries.length} more` : "";
  return `(${String(commits.length).padStart(2, "0")}) ${summaries.join("; ")}${suffix}.`;
}

function replaceYamlField(lines, key, replacement) {
  const frontmatterEnd = lines.indexOf("---", 1);
  const relativeStart = lines.slice(1, frontmatterEnd).findIndex((line) => new RegExp(`^${key}:`).test(line));
  if (relativeStart === -1) throw new Error(`Obsidian template is missing required frontmatter field: ${key}`);
  const start = relativeStart + 1;
  let end = start + 1;
  while (end < frontmatterEnd && !/^[A-Za-z0-9_-]+:/.test(lines[end])) end += 1;
  lines.splice(start, end - start, ...replacement);
}

function renderFrontmatter(template, { created, parent, summary }) {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---" || lines.indexOf("---", 1) === -1) {
    throw new Error("Obsidian template must contain YAML frontmatter.");
  }
  replaceYamlField(lines, "created", [`created: ${created}`]);
  replaceYamlField(lines, "parent", ["parent:", `  - ${JSON.stringify(`[[${parent}]]`)}`]);
  replaceYamlField(lines, "summary", [`summary: ${JSON.stringify(summary)}`]);

  const frontmatterEnd = lines.indexOf("---", 1);
  const relativeTagsIndex = lines.slice(1, frontmatterEnd).findIndex((line) => /^tags:/.test(line));
  if (relativeTagsIndex === -1) throw new Error("Obsidian template is missing required frontmatter field: tags");
  const tagsIndex = relativeTagsIndex + 1;
  let tagsEnd = tagsIndex + 1;
  while (tagsEnd < frontmatterEnd && !/^[A-Za-z0-9_-]+:/.test(lines[tagsEnd])) tagsEnd += 1;
  const existingTagLines = lines.slice(tagsIndex + 1, tagsEnd).filter((line) => line.trim());
  const inlineTags = lines[tagsIndex].slice(lines[tagsIndex].indexOf(":") + 1).trim();
  const inlineTagValues = /^\[.*\]$/.test(inlineTags)
    ? inlineTags.slice(1, -1).split(",").map((tag) => tag.trim()).filter(Boolean)
    : inlineTags ? [inlineTags] : [];
  const tagLines = inlineTagValues.length ? inlineTagValues.map((tag) => `  - ${tag}`) : existingTagLines;
  if (!tagLines.some((line) => line.replace(/^\s*-\s*/, "").trim() === "session-log")) tagLines.push("  - session-log");
  lines.splice(tagsIndex, tagsEnd - tagsIndex, "tags:", ...tagLines);
  return lines.join("\n").trimEnd();
}

function formatCommitBody(message) {
  return message.split("\n").slice(1).filter((line) => line.trim()).map((line) => {
    const trimmed = line.trim();
    return /^[-*+]\s+/.test(trimmed) ? `\t${trimmed}` : `\t- ${trimmed}`;
  }).join("\n");
}

function buildBody({ branch, head, commits, previousLogDate, status, diffStat, stagedDiffStat, remote }) {
  const range = previousLogDate
    ? `Commits since the previous session log (${formatLocalDate(previousLogDate)}).`
    : `Initial capture: the latest ${INITIAL_COMMIT_ENTRIES} commits on the active branch.`;
  const displayedCommits = commits.slice(0, MAX_COMMIT_ENTRIES);
  const commitLines = displayedCommits.length ? displayedCommits.map(({ sha, subject, message }) => {
    const shortSha = sha.slice(0, 7);
    const url = getCommitUrl(remote, sha);
    const reference = url ? `[\`${shortSha}\`](${url})` : `\`${shortSha}\``;
    const body = formatCommitBody(message);
    if (isMergeCommit(subject)) {
      const mergeBody = message.split("\n").slice(1).filter((line) => line.trim()).join("\n");
      return `### ${reference} ${subject}${mergeBody ? `\n\n${mergeBody}` : ""}`;
    }
    return `- **${reference} ${subject}**${body ? `\n${body}` : ""}`;
  }).join("\n") : "- No commits recorded.";
  const statusLines = status ? status.split("\n").map((line) => `- \`${line}\``).join("\n") : "- Clean working tree.";
  const stats = [
    diffStat ? `### Unstaged changes\n\n\`\`\`text\n${diffStat}\n\`\`\`` : "",
    stagedDiffStat ? `### Staged changes\n\n\`\`\`text\n${stagedDiffStat}\n\`\`\`` : "",
  ].filter(Boolean).join("\n\n");
  return `\n\n# Session log\n\n## Summary\n\n${range}\n\n## Context\n\n- Branch: \`${branch || "detached HEAD"}\`\n- HEAD: \`${head || "unborn branch"}\`\n\n## Commits\n\n${commitLines}\n\n## In progress\n\n${statusLines}${stats ? `\n\n${stats}` : ""}\n`;
}

async function loadProjectConfig(repository) {
  const configPath = path.join(repository, ".session-log.json");
  if (existsSync(configPath)) {
    let config;
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (error) {
      throw new Error(`Unable to read ${configPath}: ${error.message}`);
    }
    const project = typeof config.project === "string" ? config.project.trim() : "";
    if (!project) throw new Error(`${configPath} must contain a project name.`);
    const parent = String(config.parent || project).trim();
    return { project, parent: parent || project };
  }

  let project;
  let parentAnswer;
  if (process.stdin.isTTY) {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      project = (await terminal.question("Project name: ")).trim();
      if (!project) throw new Error("Project name is required.");
      parentAnswer = (await terminal.question(`Obsidian parent note [${project}]: `)).trim();
    } finally {
      terminal.close();
    }
  } else {
    const answers = readFileSync(0, "utf8").replace(/\r\n/g, "\n").split("\n");
    project = (answers.shift() ?? "").trim();
    console.log("Project name:");
    if (!project) throw new Error("Project name is required.");
    parentAnswer = (answers.shift() ?? "").trim();
    console.log(`Obsidian parent note [${project}]:`);
  }
  const config = { project, parent: parentAnswer || project };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}${os.EOL}`, "utf8");
  console.log(`Created project configuration: ${configPath}`);
  return config;
}

async function main() {
  const requestedRepository = process.env.T3CODE_WORKTREE_PATH || process.env.T3CODE_PROJECT_ROOT || process.cwd();
  const repository = runGit(["rev-parse", "--show-toplevel"], requestedRepository);
  const vaultPath = process.env.OBSIDIAN_VAULT;
  if (!vaultPath) throw new Error("OBSIDIAN_VAULT is required. Set it to the absolute path of your Obsidian vault.");
  const notesPath = path.join(vaultPath, "notes");
  const templatePath = path.join(vaultPath, "templates", "Note Template.md");
  if (!existsSync(templatePath)) throw new Error(`Obsidian note template not found: ${templatePath}`);
  if (!existsSync(notesPath)) throw new Error(`Obsidian notes directory not found: ${notesPath}`);

  const config = await loadProjectConfig(repository);
  const logPrefix = `${safeFilenamePart(config.project)}${LOG_SEPARATOR}`;
  const previousLog = findPreviousLog(notesPath, logPrefix);
  const branch = runGit(["branch", "--show-current"], repository);
  let head = null;
  try {
    head = runGit(["rev-parse", "--verify", "HEAD"], repository);
  } catch {
    // A new repository can have uncommitted work before its first commit.
  }
  const status = runGit(["status", "--short"], repository);
  const commits = getCommits({ previousLog, head, repository });
  if (previousLog && commits.length === 0 && !status) {
    console.log("No work found since the previous session log.");
    return;
  }
  const diffStat = runGit(["diff", "--stat"], repository);
  const stagedDiffStat = runGit(["diff", "--cached", "--stat"], repository);
  const now = new Date();
  const summary = getSummary(commits, status);
  const frontmatter = renderFrontmatter(readFileSync(templatePath, "utf8"), {
    created: formatLocalDate(now), parent: config.parent, summary,
  });
  const note = `${frontmatter}${buildBody({
    branch, head, commits, previousLogDate: previousLog?.date ?? null,
    status, diffStat, stagedDiffStat, remote: getRemote(repository),
  })}`;
  const timestamp = formatLocalDate(now).replace(":", "-");
  let notePath = path.join(notesPath, `${logPrefix}${timestamp}.md`);
  let duplicate = 2;
  while (existsSync(notePath)) {
    notePath = path.join(notesPath, `${logPrefix}${timestamp} (${duplicate}).md`);
    duplicate += 1;
  }
  writeFileSync(notePath, note, "utf8");
  console.log(notePath);
}

main().catch((error) => {
  console.error(`session-log: ${error.message}`);
  process.exitCode = 1;
});
