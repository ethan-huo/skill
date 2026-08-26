# Release Mechanism

This repo publishes GitHub Releases from version tags. It does not use npm publish as the primary release path.

## Contract

- `package.json` is the source of truth for the release version.
- Release tags must use `v<package.json version>`, for example `v0.1.7`.
- `.github/workflows/release.yml` validates that the pushed tag exactly matches `package.json`.
- The release workflow runs `bun install`, `bun run check`, and `bun run build`.
- `scripts/build.sh` bundles the CLI into `dist/skill`.
- The workflow creates a non-draft, non-prerelease GitHub Release and uploads `dist/skill`.

## Normal Flow

1. Make and verify the scoped code change.
2. Bump `package.json` to the next patch/minor version.
3. Run local verification:

   ```bash
   HOME=$(mktemp -d) bun run check
   bun run build
   ```

   Use a clean `HOME` when local global skill state could affect tests.

4. Commit only the intended files.
5. Tag the same commit with `v<version>`.
6. Push `main`, then push the tag:

   ```bash
   git push origin main
   git push origin v<version>
   ```

7. Watch the Release workflow and confirm the GitHub Release asset exists:

   ```bash
   gh run watch <run-id> --exit-status
   gh release view v<version> --json tagName,url,assets,publishedAt
   ```

## Common Mistakes

- Do not push a tag that does not match `package.json`; the workflow rejects it.
- Do not rely on chat memory for release state; check tags, releases, and workflow status.
- Do not bundle unrelated dirty work into a release commit. Stage only the release scope.
