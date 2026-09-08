# Brain Load — Circadia Session Start

**Paste this as your FIRST prompt in every new Claude Code, Cowork, or Cursor session.**

First prompt: read everything. Second prompt: start working.

---

Read my entire codebase to understand the project structure, existing patterns, and what has
been built so far.

Then read these files in order:

1. `meeseeks/box/prime_directive.md` — the mission, users, and quality standards for Circadia
2. `AGENTS.md` — the hard invariants. Violating one of these is a bug, not a style choice
3. All files in `.claude/skills/` — so you know what Meeseeks capabilities are available
   (RSI loops, council voting, code review, visual sentinel, semantic bridge)
4. The files in `meeseeks/box/knowledge/` relevant to this task — start with
   `meeseeks-wisdom.md` and `session-startup-protocol.md`

Then tell me briefly:

- What Circadia is and what state it is in now (check `package.json` for the version)
- Which Meeseeks skills are available to you
- Which invariants from `AGENTS.md` are most likely to bite on the work I am about to ask for

Then wait for my instructions before changing anything.

---

**Reminders for this repo**

- I commit and push from my own terminal. You edit files; you do not run git.
- This is a Mac product. `dock`, `put-on-dock`, and `put-on-phone` cannot run in a Linux
  container — do not suggest them from one.
- Before you report a change complete, run the Meeseeks code reviewer on the files you
  touched (see the `meeseeks-code-review` skill).
