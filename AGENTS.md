# AGENTS.md — BoxPlayer (Aliyun Drive client)

See `CLAUDE.md` for commands, architecture and conventions. Key rules for agents:

- pnpm only (`pnpm install`), Node >= 22.12.
- `pnpm run build` bumps the patch version; use `CI=true pnpm exec vue-tsc --noEmit` for a plain typecheck and `pnpm exec tsc -p tsconfig.node.json --noEmit` for the Electron side.
- `src/secrets.generated.ts` is generated from `.env.local` by `scripts/generate-secrets.mjs`; never commit real secrets.
- Scope is Aliyun Drive only (files, albums, sharing, upload/download, encryption add-ons). Do not add provider abstractions, media players/libraries, AI features or other clouds back.
- Tests: `pnpm run test` (Vitest, Node env, explicit include list in `vitest.config.ts`).
- Formatting: single quotes, no semicolons, 260 printWidth, no trailing commas.
