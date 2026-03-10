Use [NestForge DB: Status](command:nestforge.dbStatus) to check whether your database schema and migrations are still aligned.

What this step does:

- Runs `nestforge db status` in the current workspace.
- Refreshes the NestForge database status bar item.
- Reports whether the database looks healthy, has pending migrations, or needs review because drift was detected.

Use this after changing entities, migrations, or environment configuration and before running database generate or migrate commands.
