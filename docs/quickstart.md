# NestForge Extension Quickstart

This repository contains the VS Code extension for working with the `nestforge` CLI inside the editor.

## What Is In This Repo

- `src/extension.ts`: extension activation and command registration
- `src/nestforge-core.ts`: shared command metadata, DB status parsing, and workspace helpers
- `src/test/nestforge-core.test.ts`: unit coverage for core logic
- `dist/`: webpack build output used by the Extension Development Host
- `.vscode/launch.json`: the F5 debug configuration for running the extension locally

## Requirements

- Node.js 22
- `pnpm`
- VS Code 1.109.0 or newer
- `nestforge` on your `PATH` if you want to exercise scaffolding and generator commands
- `cargo` on your `PATH` if you want to test `NestForge: Format Rust`

## Install And Build

```bash
pnpm install
pnpm run compile
```

For active development:

```bash
pnpm run watch
```

## Run The Extension

1. Open this repository in VS Code.
2. Start the `Run Extension` launch configuration with `F5`.
3. In the Extension Development Host, open the Command Palette and run commands under `NestForge` or `NestForge DB`.

The debug config uses `dist/**/*.js`, so rebuild or keep `pnpm run watch` running when you change TypeScript files.

## Core Commands

- `NestForge: New Application`
- `NestForge: Generate`
- `NestForge DB: Init`
- `NestForge DB: Generate`
- `NestForge DB: Migrate`
- `NestForge DB: Status`
- `NestForge: OpenAPI Docs`
- `NestForge: Export OpenAPI Spec`
- `NestForge: Format Rust`
- `NestForge: Open Logs`

## Test And Lint

```bash
pnpm run lint
pnpm run test:hook
```

`test:hook` is the same fast path used by the pre-commit hook. CI runs `pnpm run lint` and `pnpm run test:hook` in `.github/workflows/test.yml`.

## Common Dev Notes

- If the Extension Development Host still shows old behavior after changes, stop the current F5 session and start it again.
- `NestForge: Generate` is the single generator entry point. It is also available from the Explorer folder context menu.
- The generator wizard now supports choosing between nested and flat file layouts, and for resources, interactive or non-interactive CLI modes.
- DB status is shown in the status bar when `nestforge.dbStatus.enabled` is `true`.
- Output from CLI commands is written to the `NestForge Logs` output channel.

## Release Workflow

- Conventional commits are used for versioning.
- `release-please` opens a release PR after the `Test and Lint` workflow passes on `main`.
- Merging that release PR updates versioned files and creates the GitHub release.

For product usage and end-user features, see `README.md`.
