Use [NestForge: New Application](command:nestforge.new) when you want the extension to scaffold a fresh backend workspace for you.

What this step does:

- Prompts for an application name.
- Lets you choose one or more transports such as `http`, `graphql`, `grpc`, `microservices`, or `websockets`.
- Lets you opt into integrations such as `Midnight Notify`, which scaffolds a dedicated Rust notifications feature into the generated app using NestForge's macro patterns.
- Runs the underlying `nestforge new <app-name>` command with the selected transport flags.
- Generates a project with `src/lib.rs` barrel file for clean imports.
- Opens the generated project folder in VS Code when scaffolding completes.

Use this first if you are starting a new NestForge project rather than adding files to an existing one.
