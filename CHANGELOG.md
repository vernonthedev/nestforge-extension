# Change Log

All notable changes to the "nestforge" extension will be documented in this file.

## [0.7.0](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.6.1...nestforge-v0.7.0) (2026-03-10)


### Features

* added a module graph autoview feature to the extension & new command for it, fixes [#5](https://github.com/vernonthedev/nestforge-extension/issues/5) ([69252bc](https://github.com/vernonthedev/nestforge-extension/commit/69252bcf403bfa7645ff5d1202bfc7ee8600be57))
* added built-in rust Nestforge snippets, fixes [#7](https://github.com/vernonthedev/nestforge-extension/issues/7) ([94fbba0](https://github.com/vernonthedev/nestforge-extension/commit/94fbba0694b468ebfb6e4528e2262b006f844ee6))
* added comprehensive matching Nestforge snippets autogenerations ([a463471](https://github.com/vernonthedev/nestforge-extension/commit/a463471e21a46b0cb13a5118262ab9618b5a62d3))
* added comprehensive runner configuration, fixes [#3](https://github.com/vernonthedev/nestforge-extension/issues/3) ([0189131](https://github.com/vernonthedev/nestforge-extension/commit/0189131756fe4b6f3a1a6fe26815b70a29639e85))
* added env `DATABASE_URL` detection & trigger, fixes [#6](https://github.com/vernonthedev/nestforge-extension/issues/6) ([cc0e5d3](https://github.com/vernonthedev/nestforge-extension/commit/cc0e5d37431416efb017caa42d7c501d2ab8f0cc))
* added git initialization support, fixes [#4](https://github.com/vernonthedev/nestforge-extension/issues/4) ([de683bd](https://github.com/vernonthedev/nestforge-extension/commit/de683bd0b05b2a4b0754e7477f55eba43da43bbb))
* added midnight notification service integrations, fixes [#8](https://github.com/vernonthedev/nestforge-extension/issues/8) ([20d5a88](https://github.com/vernonthedev/nestforge-extension/commit/20d5a88c2bfa1e288f150e2c95700e2425e0a38c))
* cleaned & refactored the midnight notify module to a rust based module ([f8c96b0](https://github.com/vernonthedev/nestforge-extension/commit/f8c96b09e334ea3ba0ba358421acd152e6c12bb3))


### Bug Fixes

* added correct extension workthroughs, fixes [#15](https://github.com/vernonthedev/nestforge-extension/issues/15) ([fa5fd42](https://github.com/vernonthedev/nestforge-extension/commit/fa5fd420e61161e59767105f377bf49637c9bf92))
* added issue templates, fixes [#17](https://github.com/vernonthedev/nestforge-extension/issues/17) ([1afb43d](https://github.com/vernonthedev/nestforge-extension/commit/1afb43dfc3bf874b1be7a1cdb41e7b9d0e656562))
* added neutral initialization status to extension, fixes [#16](https://github.com/vernonthedev/nestforge-extension/issues/16) ([bd7d988](https://github.com/vernonthedev/nestforge-extension/commit/bd7d98800b66c1ae7f3d2924102ad658e14ef1ad))

## [0.6.1](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.6.0...nestforge-v0.6.1) (2026-03-09)


### Bug Fixes

* gate openvsx publish until namespace is ready ([726e3d5](https://github.com/vernonthedev/nestforge-extension/commit/726e3d595d4c351307b8ae431e1d3fdcdef4a641))

## [0.6.0](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.5.0...nestforge-v0.6.0) (2026-03-09)


### Features

* add badges for release, license, test, and auto release in README ([24e7aa1](https://github.com/vernonthedev/nestforge-extension/commit/24e7aa1e890c059169320e46444705317fcabc26))


### Bug Fixes

* **chore:** remove Open VSX namespace bootstrap example from README & cleaned it ([fc8ee41](https://github.com/vernonthedev/nestforge-extension/commit/fc8ee41573afe3081908f901cd49b7cec08dc1a5))
* correct vsce packaging workflow ([df1b3ad](https://github.com/vernonthedev/nestforge-extension/commit/df1b3ad2ad64210efe1ef2e046220d6b4d2e2cff))

## [0.5.0](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.4.0...nestforge-v0.5.0) (2026-03-09)


### Features

* integrate Marketplace and Open VSX publishing into Auto Release workflow ([4e3ab7c](https://github.com/vernonthedev/nestforge-extension/commit/4e3ab7c604570e132583a62382bc02ad113de110))

## [0.4.0](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.3.0...nestforge-v0.4.0) (2026-03-09)


### Features

* added Marketplace publishing workflow and update contributing documentation ([d7f584c](https://github.com/vernonthedev/nestforge-extension/commit/d7f584caef9f1ab785291b010d264dc0e6619b11))
* enhanced publishing workflow to support Open VSX and update documentation ([7a9a54a](https://github.com/vernonthedev/nestforge-extension/commit/7a9a54a290faddf4cb8c98bf296ae30549612dcb))


### Bug Fixes

* add missing publisher field in package.json ([d059518](https://github.com/vernonthedev/nestforge-extension/commit/d059518046cd2f7833bbb67feba947035da3568d))

## [0.3.0](https://github.com/vernonthedev/nestforge-extension/compare/nestforge-v0.2.0...nestforge-v0.3.0) (2026-03-09)


### Features

* add NestForge extension quickstart guide ([9fed900](https://github.com/vernonthedev/nestforge-extension/commit/9fed9006e531a99a4da146cacc992002156e73a8))
* add Quick Start Guide link to README ([0024d51](https://github.com/vernonthedev/nestforge-extension/commit/0024d51f3fdd8d2319e2c1c4809d3fe9aacf723a))
* update license to Apache-2.0 and add contributing guide ([a364c80](https://github.com/vernonthedev/nestforge-extension/commit/a364c806a022fa617083f15abb19b4d75466d9d4))

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
