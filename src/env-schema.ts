import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileExists, isManagedNestForgeWorkspace } from './nestforge-core';

export type TransportKind = 'http' | 'grpc';

export interface EnvVariableDefinition {
	name: string;
	description: string;
	defaultValue: string;
	validate?: (value: string) => string | undefined;
}

export interface EnvSchema {
	transports: TransportKind[];
	requiredVariables: EnvVariableDefinition[];
}

export interface ParsedEnvEntry {
	key: string;
	value: string;
	line: number;
}

const DATABASE_URL_VARIABLE: EnvVariableDefinition = {
	name: 'DATABASE_URL',
	description: 'Database connection string used by NestForge database commands and runtime services.',
	defaultValue: 'postgres://postgres:postgres@localhost:5432/app',
	validate: (value) => {
		try {
			const parsed = new URL(value);
			if (!parsed.protocol || !parsed.hostname) {
				return 'DATABASE_URL must include a protocol and host.';
			}

			return undefined;
		} catch {
			return 'DATABASE_URL must be a valid connection URL.';
		}
	},
};

const HTTP_VARIABLES: EnvVariableDefinition[] = [
	{
		name: 'HTTP_HOST',
		description: 'Host interface bound by the NestForge HTTP transport.',
		defaultValue: '127.0.0.1',
	},
	{
		name: 'HTTP_PORT',
		description: 'Port used by the NestForge HTTP transport.',
		defaultValue: '3000',
		validate: validatePortNumber,
	},
];

const GRPC_VARIABLES: EnvVariableDefinition[] = [
	{
		name: 'GRPC_HOST',
		description: 'Host interface bound by the NestForge gRPC transport.',
		defaultValue: '127.0.0.1',
	},
	{
		name: 'GRPC_PORT',
		description: 'Port used by the NestForge gRPC transport.',
		defaultValue: '50051',
		validate: validatePortNumber,
	},
];

const TRANSPORT_DETECTORS: Record<TransportKind, string[]> = {
	http: ['http', 'axum', 'actix', 'warp', '#[controller', 'openapi'],
	grpc: ['grpc', 'tonic', 'prost', 'grpcserver', 'grpc_client'],
};

export async function isNestForgeWorkspace(workspacePath: string): Promise<boolean> {
	return isManagedNestForgeWorkspace(workspacePath);
}

export async function resolveEnvSchema(workspacePath: string): Promise<EnvSchema> {
	const transports = await inferTransportKinds(workspacePath);
	const requiredVariables = [DATABASE_URL_VARIABLE];

	if (transports.includes('http')) {
		requiredVariables.push(...HTTP_VARIABLES);
	}

	if (transports.includes('grpc')) {
		requiredVariables.push(...GRPC_VARIABLES);
	}

	return {
		transports,
		requiredVariables,
	};
}

export async function inferTransportKinds(workspacePath: string): Promise<TransportKind[]> {
	const cargoTomlPath = path.join(workspacePath, 'Cargo.toml');
	const sourceRoot = path.join(workspacePath, 'src');
	const haystacks: string[] = [];

	if (await fileExists(cargoTomlPath)) {
		haystacks.push((await fs.readFile(cargoTomlPath, 'utf8')).toLowerCase());
	}

	if (await fileExists(sourceRoot)) {
		for (const filePath of await collectWorkspaceFiles(sourceRoot, 3)) {
			if (!/\.(rs|toml)$/i.test(filePath)) {
				continue;
			}

			try {
				haystacks.push((await fs.readFile(filePath, 'utf8')).toLowerCase());
			} catch {
				continue;
			}
		}
	}

	const transports: TransportKind[] = [];
	for (const [transport, tokens] of Object.entries(TRANSPORT_DETECTORS) as Array<[TransportKind, string[]]>) {
		if (haystacks.some((haystack) => tokens.some((token) => haystack.includes(token)))) {
			transports.push(transport);
		}
	}

	return transports.length ? transports : ['http'];
}

export function parseEnvText(text: string): Map<string, ParsedEnvEntry> {
	const entries = new Map<string, ParsedEnvEntry>();
	const lines = text.split(/\r?\n/);

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}

		const equalsIndex = line.indexOf('=');
		if (equalsIndex <= 0) {
			continue;
		}

		const key = line.slice(0, equalsIndex).trim();
		const value = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
		entries.set(key, { key, value, line: index });
	}

	return entries;
}

async function collectWorkspaceFiles(root: string, maxDepth: number): Promise<string[]> {
	const results: string[] = [];

	const visit = async (currentPath: string, depth: number): Promise<void> => {
		if (depth > maxDepth) {
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

			results.push(entryPath);
		}
	};

	try {
		await visit(root, 0);
	} catch {
		return results;
	}

	return results;
}

function validatePortNumber(value: string): string | undefined {
	const port = Number(value);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		return 'Port values must be integers between 1 and 65535.';
	}

	return undefined;
}
