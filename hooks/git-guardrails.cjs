#!/usr/bin/env node
/**
 * git-guardrails — PreToolUse(Bash) hook (§68)
 *
 * Blocks destructive Git operations before the agent can execute them.
 * Intended to run on every Bash invocation; matches the command against a
 * regex blocklist and returns exit code 2 with an explanatory message
 * when a destructive pattern is detected.
 *
 * Wired in .claude/settings.json under hooks.PreToolUse with matcher "Bash":
 *
 *   {
 *     "hooks": {
 *       "PreToolUse": [
 *         {
 *           "matcher": "Bash",
 *           "hooks": [
 *             { "type": "command", "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/git-guardrails.cjs\"" }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 *
 * Exit codes:
 *   0  → command is safe, allow it
 *   2  → command matches a blocked pattern, deny it (stderr explains why)
 *
 * Performance contract (NFR-1 in docs/specs/ralph-hardening.md):
 *   < 50ms per invocation. Pure regex over a small list, zero I/O beyond
 *   reading stdin once.
 *
 * Bypass for humans:
 *   GIT_GUARDRAILS_DISABLE=1 git push --force-with-lease ...
 *   The disable flag is **never** set by ralph-local.sh. It is for humans
 *   doing explicit cleanup work in the Day Shift.
 *
 * No external dependencies. Node ≥ 18 (uses no Node API beyond stdin / stderr / process).
 */

"use strict";

// ──────────────────────────────────────────────────────────────────────
// Block list — keep in sync with §68 "Blocked operations" in
// docs/engineering/core/13-ralph-and-afk.md
// ──────────────────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  {
    name: "git push --force",
    regex: /\bgit\s+push\b[^|;&]*\s(--force(-with-lease)?|-f)\b/,
    why: "force-push erases the audit trail of what Ralph did wrong",
  },
  {
    name: "git reset --hard",
    regex: /\bgit\s+reset\s+(--hard|--keep)\b/,
    why: "--hard reset discards local changes that may be the only record of a failed iteration",
  },
  {
    name: "git clean -fdx",
    regex: /\bgit\s+clean\s+-[fdx]*[fd][fdx]*\b/,
    why: "git clean -fd removes untracked files including session logs and .planning artifacts",
  },
  {
    name: "git branch -D",
    regex: /\bgit\s+branch\s+-D\b/,
    why: "-D force-deletes a branch without checking merge state; agent branches must be preserved for review",
  },
  {
    name: "git tag -d (on remote tag)",
    regex: /\bgit\s+push\s+(--delete|-d)\s+/,
    why: "deleting a remote tag/branch is a destructive operation that should be human-only",
  },
  {
    name: "rm -rf .git",
    regex: /\brm\s+(-r[fd]*|--recursive\s+--force)[^|;&]*\.git\b/,
    why: "removing .git destroys the entire repository state",
  },
  {
    name: "find -name .git -delete",
    regex: /\bfind\b[^|;&]*\.git\b[^|;&]*(-delete|-exec\s+rm)/,
    why: "matches an attempt to recursively destroy .git directories",
  },
];

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function extractCommand(payload) {
  // Claude Code passes a JSON payload to PreToolUse hooks. Layout is:
  //   { "tool_name": "Bash", "tool_input": { "command": "...", ... } }
  // We accept the documented shape and a few defensive fallbacks.
  if (!payload || typeof payload !== "string" || payload.length === 0) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch (_) {
    return null;
  }

  const candidates = [
    parsed?.tool_input?.command,
    parsed?.tool_input?.bash_command,
    parsed?.command,
    parsed?.input?.command,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

// FOLLOW-UP 68: strip heredoc PAYLOADS before pattern-matching. The §68 rules
// must fire on executable git invocations, not on prose that merely NAMES a
// blocked operation — and the framework prescribes exactly such prose
// (filing FUs, postmortems §95, runbooks, ADRs quoting §68). A heredoc body
// is unambiguously DATA, not commands, so removing it is safe and — unlike
// "command-position" matching — does NOT weaken detection of a real
// destructive command on its own line (which is also "after a newline" and
// must still be caught; verified: a multi-line `…\ngit push --force` stays
// blocked). Residual gap (documented in §68): a body fed straight to an
// interpreter (`bash <<EOF … EOF`) is not inspected here — the inner
// execution is the harness's to guard.
function stripHeredocs(command) {
  const lines = command.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    out.push(line); // keep the OPENING line (it may carry a real command before `<<`)
    // Heredoc openers on this line: << DELIM, <<-DELIM, << 'DELIM', << "DELIM".
    const openers = [...line.matchAll(/<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/g)];
    if (openers.length === 0) {
      i++;
      continue;
    }
    const delim = openers[openers.length - 1][2]; // last opener's word closes the body
    const dashed = /<<-/.test(line);
    i++;
    // Drop body lines until the closing delimiter (alone on its line; `<<-`
    // allows leading tabs). The body is removed, never scanned.
    while (i < lines.length) {
      const trimmed = dashed ? lines[i].replace(/^\t+/, "") : lines[i];
      i++;
      if (trimmed === delim) break;
    }
  }
  return out.join("\n");
}

// FOLLOW-UP 114: strip QUOTED-LITERAL payloads before pattern-matching, the
// single-line sibling of the FU-68 heredoc strip. The §68 rules must fire on
// executable git invocations, not on a guarded verb sitting inside a quoted
// string literal that is DATA — `printf 'git reset --hard …'`, `echo "… git
// push --force …"`, `git commit -m "warn against git reset --hard"`, a doc
// write whose message NAMES the op. A destructive flag in a real command is
// unquoted (`git push --force`), so removing quoted contents is safe and does
// NOT weaken detection: a real op with only its operands quoted (`git push
// --force "origin" "main"`) still matches on the unquoted `--force`. Shell
// quoting honored: single quotes are fully literal (no inner escapes); double
// quotes respect `\"`; a backslash escape outside quotes keeps its escaped
// char (command structure, never masked). Residual gap (documented in §68,
// like FU-68's `bash <<EOF`): a guarded verb wrapped in bare escaped quotes
// (`echo \"git reset --hard\"`) is rare and left to the harness.
function stripQuotedLiterals(command) {
  let out = "";
  let i = 0;
  const n = command.length;
  while (i < n) {
    const c = command[i];
    if (c === "'") {
      // single-quoted: everything literal until the next single quote
      i++;
      while (i < n && command[i] !== "'") i++;
      i++; // consume the closing quote (unterminated → i runs past end, fine)
      continue;
    }
    if (c === '"') {
      // double-quoted: until the next UNescaped double quote
      i++;
      while (i < n && command[i] !== '"') {
        if (command[i] === "\\" && i + 1 < n) i++; // skip the escaped char
        i++;
      }
      i++; // consume the closing quote
      continue;
    }
    if (c === "\\" && i + 1 < n) {
      // backslash escape OUTSIDE quotes: keep the escaped char as literal
      out += command[i + 1];
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function findMatch(command) {
  const scannable = stripQuotedLiterals(stripHeredocs(command));
  for (const entry of BLOCKED_PATTERNS) {
    if (entry.regex.test(scannable)) {
      return entry;
    }
  }
  return null;
}

function denialMessage(command, match) {
  const wrappedCommand =
    command.length > 200 ? command.slice(0, 200) + "…" : command;

  return [
    "",
    "🛑 git-guardrails: destructive Git operation blocked (§68)",
    "",
    `  Matched rule: ${match.name}`,
    `  Reason: ${match.why}`,
    `  Command: ${wrappedCommand}`,
    "",
    "Ralph is never allowed to execute this. If you are a human running",
    "explicit cleanup, bypass the hook for one invocation with:",
    "",
    "  GIT_GUARDRAILS_DISABLE=1 <your command>",
    "",
    "See docs/engineering/core/13-ralph-and-afk.md §68 for the full list",
    "of blocked operations and rationale.",
    "",
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

async function main() {
  // Explicit human bypass
  if (process.env.GIT_GUARDRAILS_DISABLE === "1") {
    process.exit(0);
  }

  const payload = await readStdin();
  const command = extractCommand(payload);

  if (command === null) {
    // No command to inspect — allow. We do not punish absence of payload
    // because some Claude Code versions invoke hooks for inspection only.
    process.exit(0);
  }

  const match = findMatch(command);
  if (match === null) {
    process.exit(0);
  }

  // Blocked: write explanation to stderr (Claude Code surfaces this) and exit 2.
  process.stderr.write(denialMessage(command, match));
  process.exit(2);
}

main().catch((err) => {
  // Hook itself failed. Fail-open (exit 0) rather than blocking every command
  // due to a hook bug — but log the error so it is investigable.
  process.stderr.write(
    `git-guardrails internal error (allowing command): ${err?.message ?? err}\n`,
  );
  process.exit(0);
});
