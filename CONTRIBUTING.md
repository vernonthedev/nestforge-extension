# Contributing to the NestForge Extension

Thanks for contributing to NestForge Extension.

## Development Setup

Requirements:

- Node.js 22
- `pnpm`
- VS Code 1.109.0 or newer

Install dependencies:

```bash
pnpm install
```

Build the extension:

```bash
pnpm run compile
```

For active development:

```bash
pnpm run watch
```

To run the extension locally, open the repo in VS Code and start the `Run Extension` launch configuration with `F5`.

## Validation

Run the same checks used by CI and the pre-commit flow:

```bash
pnpm run lint
pnpm run test:hook
```

## Project Structure

- `src/extension.ts`: command registration and extension activation
- `src/nestforge-core.ts`: shared helpers and DB status parsing
- `src/test/nestforge-core.test.ts`: unit tests
- `docs/quickstart.md`: local extension development quickstart

## Pull Requests

- Keep changes focused and scoped.
- Add or update tests when behavior changes.
- Update docs when commands, workflows, or settings change.
- Do not commit generated release version changes manually unless they are part of a release PR.

## Commit Convention

This project uses conventional commits. Use commit messages such as:

- `feat: add generator validation for modules`
- `fix: correct db status parsing`
- `docs: update quickstart`

Use `feat!:` or include a `BREAKING CHANGE:` footer for breaking changes.

## Release Process

- Changes merge into `main` through normal pull requests.
- GitHub Actions runs `Test and Lint`.
- `release-please` opens or updates a release PR based on conventional commits.
- Merging the release PR updates versioned files and creates the GitHub release.
- The Marketplace publish workflow runs from the GitHub release and uses `VSCE_PAT` and `VSCE_PUBLISHER`.

## Marketplace Setup

Before automatic publishing can work:

- create a Marketplace publisher
- create an Azure DevOps PAT with Marketplace `Manage`
- store it as repository secret `VSCE_PAT`
- store the publisher identifier as repository variable `VSCE_PUBLISHER`
- create the matching Open VSX namespace once
- create an Open VSX access token
- store it as repository secret `OVSX_PAT`

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0 in this repository.
