---
id: 01M3GN566DHRHT2SBNS8JHXVRW
anchor: function getVisibleSkillDirName
created: 2026-09-27T05:24:41Z
norm: '1'
sig: f33845f7ee56750d
body_hash: bd53b7d1d8f4f176
raw_hash: 8c7934dc2a263499
lines: 34-36
---

Visible skills must stay one level deep (skills/<name>/SKILL.md): Claude Code 2.1.283 only reads direct children and names skills by dir name; Codex recurses (depth 6) but Claude does not, so org/repo/skill nesting breaks Claude.
