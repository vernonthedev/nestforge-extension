# Change Log

All notable changes to the "nestforge" extension will be documented in this file.

## [0.1.1](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.1.0...nestforge-v0.1.1) (2026-03-09)


### Bug Fixes

* update references from "NestForge Toolkit" to "NestForge" in README, CHANGELOG, package.json, and extension.ts ([755ca5f](https://github.com/vernonthedev/nestforge-extension/commit/755ca5f25a549fc4e275030be20f4b28362e1f06))

## [0.1.0](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.0.1...nestforge-v0.1.0) (2026-03-09)


### Features

* add lefthook configuration for pre-commit linting and testing ([bfbd41d](https://github.com/vernonthedev/nestforge-extension/commit/bfbd41d99d5760cb5db38204e2018d80c803af55))
* add nestforge toolkit command workflows ([95be173](https://github.com/vernonthedev/nestforge-extension/commit/95be173240139be25072a3d5e1d81e4be944fd03))
* **ci:** restructure CI workflows and add test and linting process ([645e5fe](https://github.com/vernonthedev/nestforge-extension/commit/645e5fee68fc873462176feecfdc035a1d95f3be))
* implemented CI with GitHub Actions and release automation ([c2d84d3](https://github.com/vernonthedev/nestforge-extension/commit/c2d84d38a34f096dedec02ff3c84eb96f3992fee))


### Bug Fixes

* correct default openapi docs url ([2a7c204](https://github.com/vernonthedev/nestforge-extension/commit/2a7c204324adba76ca402df3ffacd1c7be42e8d4))

## [Unreleased]

- Updated the README to document the NestForge command surface, generator wizard, context menus, DB dashboard, settings, and walkthrough support.
- Added GitHub Actions CI and release automation so conventional commits can drive version bumps, changelog updates, and README version sync.

## [0.0.1]

- Added NestForge command palette workflows for scaffolding, generators, database operations, OpenAPI docs, and Rust formatting.
- Added Explorer context actions for module-aware resource generation.
- Added `NestForge Logs` output channel integration and progress notifications for long-running operations.
- Added a status bar database drift indicator with polling support.
- Added onboarding walkthrough content for core extension workflows.
