Use [$(debug-start) Configure Runner](command:nestforge.generateLaunchConfig) to generate a VS Code run profile for the current NestForge Rust project.

What this step does:

- Creates `.vscode/launch.json` if needed.
- Creates or updates `.vscode/tasks.json` with a `cargo build` pre-launch task.
- Detects the project binary name from `Cargo.toml`.
- Uses `lldb` on macOS and Linux, and `cppvsdbg` on Windows.

If CodeLLDB is missing on platforms that use `lldb`, NestForge recommends installing `vadimcn.vscode-lldb`.
