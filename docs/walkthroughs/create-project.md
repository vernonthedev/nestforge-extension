Use [NestForge: New Application](command:nestforge.new) when you want the extension to scaffold a fresh backend workspace for you.

What this step does:

- Prompts for an application name.
- Lets you choose one or more transports such as `http`, `graphql`, or `grpc`.
- Lets you opt into integrations such as `Midnight Notify` during setup.
- Runs the underlying `nestforge new <app-name>` command with the selected transport flags.
- Opens the generated project folder in VS Code when scaffolding completes.

Use this first if you are starting a new NestForge project rather than adding files to an existing one.
