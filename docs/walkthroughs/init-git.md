Use [$(git-repo-create) Initialize Repository](command:nestforge.initGit) after scaffolding a new NestForge project.

What this step does:

- Runs `git init` in the project root when the repository has not been initialized yet.
- Ensures `.gitignore` contains `/target` for Rust build output.
- Stages the scaffolded files and attempts the initial commit `feat: initial nestforge scaffold`.

If Git is missing from your system `PATH`, NestForge will show a warning instead of failing silently.
