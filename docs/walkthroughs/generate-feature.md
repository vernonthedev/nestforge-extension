Use [NestForge: Generate](command:nestforge.generate) to create new application building blocks inside an existing NestForge workspace.

What this step does:

- Asks you to pick a category: `Core`, `Transport`, or `Cross-Cutting`.
- Lets you choose a generator such as `Module`, `Service`, `Resource`, `Controller`, `Resolver`, `GraphQL`, `gRPC`, `Gateway`, `Guard`, `Interceptor`, `Filter`, `Pipe`, `Middleware`, or `Decorator`.
- Prompts for the feature name.
- Lets you choose between nested layout (default) or flat layout (all files side-by-side).
- For Resource generators, lets you choose between interactive (prompts for DTO fields) or non-interactive mode.
- If the generator needs a module, asks you to pick the target module automatically.

The extension runs `nestforge g ...` with the appropriate flags (`--flat`, `--no-prompt`, `--module`) and refreshes the File Explorer when complete.

You can also right-click a folder in the Explorer and run the same command from the context menu to generate files relative to that location.
