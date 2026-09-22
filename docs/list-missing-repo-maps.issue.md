---
type: Issue
title: skill list 漏列已安装的 repo map
description: 已成功安装并恢复的 map 未出现在 list 中，导致技能数量与 token 估算低于实际可见入口。
status: open
tags: [bug, list, map]
---

# skill list 漏列已安装的 repo map

## 现象与证据

2026-09-22 在 `projects/clonesite/clonesite.ai` 的 `30e64ca` 安装状态下复现。该快照的 manifest v3 包含 7 个独立技能以及 3 个 repo map：

- `better-auth/skills`：6 个上游技能。
- `get-convex/agent-skills`：33 个上游技能。
- `stripe/ai`：10 个上游技能。

`skill install` 成功返回 `missing: []`，三个 map 目录均有可读取的 `SKILL.md`；但 `skill list "{scope:'local'}"` 只列出 7 个符号链接技能，返回 `summary.count: 7`、`estimatedTokens: 336`。预期这组受管安装有 10 个可见入口，map 各算一个，不展开成 49 个子技能。

## 最小复现

在临时空目录运行以下命令，不需要 Clonesite 或私有仓库：

```sh
skill install "{repo:['better-auth/skills'],map:true,description:'Better Auth setup and plugins'}"
cat .agents/skills/manifest.json
cat .agents/skills/map-skills-better-auth/SKILL.md
skill list "{scope:'local'}"
```

预期最后一条命令列出 map 的绝对 `SKILL.md` 路径与安装时固定的 description，`summary.count` 为 1。当前实现会跳过该普通目录；实际项目中的同一路径已复现。

## 初步定位

- [installed-skills.ts](../src/lib/installed-skills.ts) 的 `listSkillsForScope` 只处理 `entry.isSymbolicLink()`，直接跳过 map 使用的普通目录。
- 同一函数通过 [project-manifest.ts](../src/lib/project-manifest.ts) 的 `getProjectManifestSkills` 获取安装信息，该函数只取 `type: skills`，不包含 `type: map`。
- [list.ts](../src/commands/list.ts) 完全依赖上述结果生成 `skills`、`summary.count` 与 token 估算，因此三处一起漏项。

## 验收条件

- 仅安装 map 时，local list 返回一个入口；普通技能和 map 混装时无遗漏、无重复。
- scope 过滤保持正确；map 按一个 router 计数，description 保留 manifest 中的安装值。
- token 估算包含实际列出的 map 元数据。
- `skill install` 恢复 map 后仍可列出；移除 map 后不再列出。
- 覆盖 map 文件缺失或损坏的行为，明确采用的列表契约。

本 issue 只要求修复 CLI 受管 map 的枚举；是否枚举项目自有 inline 技能是另一项契约，不应借此把普通目录误认成外部安装或改变其管理归属。本会话仅记录问题，修复留待独立会话。
