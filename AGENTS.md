## Repo Focus

这个仓库是 `skill` CLI：从 GitHub 仓库发现、安装、更新、移除 agent skills。

当前公开契约比“实现优雅”更重要。改动前先确认你动的是实现细节，还是用户已经依赖的行为。

关键不变量：

- 支持的仓库输入只有 `owner/repo`、`https://github.com/owner/repo`、`git@github.com:owner/repo.git`。
- `owner/repo/skill` 是 `add` 的 shorthand，不是另一套独立协议。
- GitHub URL 必须指向 repo root；带额外 path 的 URL 应直接报错。
- 安装后的 skill ID 以 `{owner}/{repo}/{folder}` 为准，不保留上游隐藏目录层级。
- `find` 是公开搜索面；输出语义变更必须同步更新实现、测试和 README。
- `update` 的语义是：
  - `~` 更新已安装且仍存在的 skills
  - `-` 移除上游已不存在的 skills
  - `+` 仅报告新出现的 skills，不自动安装

## Architecture

- `src/cli.ts` 只做入口装配和极轻量 argv 归一化，不承载业务规则。
- `src/schema.ts` 是 CLI 公共契约的一部分；命令名、参数、example、帮助文案都在这里收口。
- `src/commands/*` 做 orchestration，不要把解析、diff、路径规则、远程协议细节继续堆进去。
- `src/lib/*` 放可复用逻辑；优先把纯决策和 effectful shell/file/network 操作拆开。
- `test/*` 不是装饰。只改实现不补测试，通常说明你还没真正锁住行为。

## Change Checklist

涉及 CLI 契约的改动，默认一起检查这些面：

- `src/schema.ts`
- `src/types.ts`
- 对应 `src/commands/*`
- 对应 `src/lib/*`
- 相关 `test/*.test.ts`
- `README.md`

一个常见错误是只改命令实现，不改 schema、README 或测试。这种提交通常不完整。

## Verification

提交前至少按改动范围做对应验证：

```bash
bun run fmt
bun run typecheck
bun test
```

如果改动影响公开行为，优先再补一条真实 CLI 冒烟，例如：

```bash
bun run src/cli.ts find seo
```
