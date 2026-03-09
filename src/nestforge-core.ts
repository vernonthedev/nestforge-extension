import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type FlagValue = boolean | number | string | string[];

export interface NestForgeCommandContribution {
	command: string;
	title: string;
	category: string;
}

export function buildCliArgs(baseArgs: string[], flags?: Record<string, FlagValue | undefined>): string[] {
	if (!flags) {
		return [...baseArgs];
	}

	const args = [...baseArgs];

	for (const [flag, value] of Object.entries(flags)) {
		if (value === undefined || value === false) {
			continue;
		}

		if (value === true) {
			args.push(`--${flag}`);
			continue;
		}

		if (Array.isArray(value)) {
			for (const entry of value) {
				args.push(`--${flag}`, entry);
			}
			continue;
		}

		args.push(`--${flag}`, String(value));
	}

	return args;
}

export function classifyDbStatusOutput(output: string): 'healthy' | 'warning' | 'unknown' {
	const normalized = output.toLowerCase();

	if (/\b(drift|out of sync|pending|diverged|not up to date)\b/.test(normalized)) {
		return 'warning';
	}

	if (/\b(in sync|up to date|healthy|no drift|ok)\b/.test(normalized)) {
		return 'healthy';
	}

	return 'unknown';
}

export async function fileExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

export async function findModuleCandidatesInWorkspace(workspacePath: string): Promise<string[]> {
	const sourceRoot = path.join(workspacePath, 'src');
	const root = await fileExists(sourceRoot) ? sourceRoot : workspacePath;
	const candidates = new Set<string>();

	const visit = async (currentPath: string, depth: number): Promise<void> => {
		if (depth > 3) {
			return;
		}

		const entries = await fs.readdir(currentPath, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith('.')) {
				continue;
			}

			const entryPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				await visit(entryPath, depth + 1);
				continue;
			}

			const match = entry.name.match(/^(.*)\.module\.(?:ts|js|rs)$/);
			if (match?.[1]) {
				candidates.add(match[1]);
			}
		}
	};

	try {
		await visit(root, 0);
	} catch {
		return [];
	}

	return [...candidates].sort((left, right) => left.localeCompare(right));
}

export const NESTFORGE_COMMANDS: NestForgeCommandContribution[] = [
	{ command: 'nestforge.new', title: 'New Application', category: 'NestForge' },
	{ command: 'nestforge.generate', title: 'Generate', category: 'NestForge' },
	{ command: 'nestforge.generateResourceHere', title: 'Generate Here', category: 'NestForge' },
	{ command: 'nestforge.createModule', title: 'Create Module', category: 'NestForge' },
	{ command: 'nestforge.createService', title: 'Create Service', category: 'NestForge' },
	{ command: 'nestforge.createResource', title: 'Create Resource', category: 'NestForge' },
	{ command: 'nestforge.createController', title: 'Create Controller', category: 'NestForge' },
	{ command: 'nestforge.createResolver', title: 'Create Resolver', category: 'NestForge' },
	{ command: 'nestforge.createGateway', title: 'Create Gateway', category: 'NestForge' },
	{ command: 'nestforge.createGuard', title: 'Create Guard', category: 'NestForge' },
	{ command: 'nestforge.createInterceptor', title: 'Create Interceptor', category: 'NestForge' },
	{ command: 'nestforge.createFilter', title: 'Create Filter', category: 'NestForge' },
	{ command: 'nestforge.createPipe', title: 'Create Pipe', category: 'NestForge' },
	{ command: 'nestforge.createMiddleware', title: 'Create Middleware', category: 'NestForge' },
	{ command: 'nestforge.createDecorator', title: 'Create Decorator', category: 'NestForge' },
	{ command: 'nestforge.dbInit', title: 'Init', category: 'NestForge DB' },
	{ command: 'nestforge.dbGenerate', title: 'Generate', category: 'NestForge DB' },
	{ command: 'nestforge.dbMigrate', title: 'Migrate', category: 'NestForge DB' },
	{ command: 'nestforge.dbStatus', title: 'Status', category: 'NestForge DB' },
	{ command: 'nestforge.docs', title: 'OpenAPI Docs', category: 'NestForge' },
	{ command: 'nestforge.formatRust', title: 'Format Rust', category: 'NestForge' },
	{ command: 'nestforge.openLogs', title: 'Open Logs', category: 'NestForge' },
	{ command: 'nestforge.onboarding.openDocs', title: 'Open Extension Docs', category: 'NestForge' },
];
