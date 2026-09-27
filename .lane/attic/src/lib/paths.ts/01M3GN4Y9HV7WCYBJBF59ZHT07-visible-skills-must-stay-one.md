---
id: 01M3GN4Y9HV7WCYBJBF59ZHT07
anchor: fn getSkillsBaseDir
created: 2026-09-27T05:24:33Z
norm: "1"
---

Visible skills must stay one level deep (skills/<name>/SKILL.md): Claude Code 2.1.283 only reads direct children and names skills by dir name; Codex recurses (depth 6) but Claude does not, so org/repo/skill nesting breaks Claude.
