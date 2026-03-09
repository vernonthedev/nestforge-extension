# Change Log

All notable changes to the "nestforge" extension will be documented in this file.

## [0.2.0](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.1.1...nestforge-v0.2.0) (2026-03-09)


### Features

* add new commands for creating interceptor, filter, pipe, middleware, and decorator in the extension ([de02cc0](https://github.com/vernonthedev/nestforge-extension/commit/de02cc0db6233e51af1b33a2630607c54b84e178))
* added new commands for creating controller, service, resource, and guard in the extension ([154bc1f](https://github.com/vernonthedev/nestforge-extension/commit/154bc1fc5f7c8f337e557498ae8f84453406e82c))
* added prompt for migration name in 'NestForge DB: Generate' command ([791318e](https://github.com/vernonthedev/nestforge-extension/commit/791318e9f2eb8ea589e9431865c32f021c15af3e))
* enhanced database status detection with pending migrations and update related tests ([5dcc44e](https://github.com/vernonthedev/nestforge-extension/commit/5dcc44efe9464061db2a0e436eeedef018086782))
* enhanced module resolution in generator functions and add context handling ([c96ea34](https://github.com/vernonthedev/nestforge-extension/commit/c96ea3445e15a61873f92db662a28605aa81210b))
* implement new application destination selection in the wizard ([e3feb96](https://github.com/vernonthedev/nestforge-extension/commit/e3feb96b814fadfab97cff74a5fc6122daa5ec9a))
* updated command titles & added new generator commands in the extension ([3c6908d](https://github.com/vernonthedev/nestforge-extension/commit/3c6908d20ae235e497b79febcfd085cba2bc073d))


### Bug Fixes

* removed redundant candidate addition in findModuleCandidatesInWorkspace and update tests to include new guard module ([b132d00](https://github.com/vernonthedev/nestforge-extension/commit/b132d00eab15dc6046ddeb8c4102e5be16630ded))
* update tsconfig.json to include moduleResolution and types options ([8b1ca67](https://github.com/vernonthedev/nestforge-extension/commit/8b1ca673484d523c191a4547d7b9d56f7cfedd1f))
* updated README and extension to clarify transport options in scaffolding wizard ([7e75b54](https://github.com/vernonthedev/nestforge-extension/commit/7e75b5401b6bdd6e5b465963f408379ff2a81484))

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
