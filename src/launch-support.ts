import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileExists } from './nestforge-core';

export interface LaunchConfigurationFile {
	version: string;
	configurations: Array<Record<string, unknown>>;
}

export interface TasksConfigurationFile {
	version: string;
	tasks: Array<Record<string, unknown>>;
}

export function parseCargoPackageName(cargoToml: string): string | undefined {
	const packageSectionMatch = cargoToml.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
	if (!packageSectionMatch) {
		return undefined;
	}

	const nameMatch = packageSectionMatch[1].match(/^\s*name\s*=\s*"([^"]+)"\s*$/m);
	return nameMatch?.[1];
}

export async function resolveCargoPackageName(workspacePath: string): Promise<string | undefined> {
	const cargoTomlPath = path.join(workspacePath, 'Cargo.toml');
	if (!await fileExists(cargoTomlPath)) {
		return undefined;
	}

	const cargoToml = await fs.readFile(cargoTomlPath, 'utf8');
	return parseCargoPackageName(cargoToml);
}

export function buildNestForgeLaunchConfiguration(binaryName: string, debuggerType: 'lldb' | 'cppvsdbg'): Record<string, unknown> {
	if (debuggerType === 'cppvsdbg') {
		return {
			name: 'Run NestForge Project',
			type: 'cppvsdbg',
			request: 'launch',
			program: `\${workspaceFolder}/target/debug/${binaryName}.exe`,
			args: [],
			cwd: '${workspaceFolder}',
			console: 'integratedTerminal',
			preLaunchTask: 'nestforge: cargo build',
		};
	}

	return {
		name: 'Run NestForge Project',
		type: 'lldb',
		request: 'launch',
		program: `\${workspaceFolder}/target/debug/${binaryName}`,
		args: [],
		cwd: '${workspaceFolder}',
		preLaunchTask: 'nestforge: cargo build',
		sourceLanguages: ['rust'],
	};
}

export function buildNestForgeBuildTask(): Record<string, unknown> {
	return {
		label: 'nestforge: cargo build',
		type: 'shell',
		command: 'cargo',
		args: ['build'],
		group: {
			kind: 'build',
			isDefault: true,
		},
		presentation: {
			reveal: 'always',
			panel: 'shared',
		},
		problemMatcher: ['$rustc'],
	};
}

export function upsertLaunchConfiguration(
	existing: LaunchConfigurationFile | undefined,
	configuration: Record<string, unknown>,
): LaunchConfigurationFile {
	const next: LaunchConfigurationFile = existing ?? { version: '0.2.0', configurations: [] };
	const configurations = [...next.configurations];
	const index = configurations.findIndex((entry) => entry.name === configuration.name);
	if (index >= 0) {
		configurations[index] = configuration;
	} else {
		configurations.push(configuration);
	}

	return {
		version: next.version || '0.2.0',
		configurations,
	};
}

export function upsertBuildTask(
	existing: TasksConfigurationFile | undefined,
	task: Record<string, unknown>,
): TasksConfigurationFile {
	const next: TasksConfigurationFile = existing ?? { version: '2.0.0', tasks: [] };
	const tasks = [...next.tasks];
	const index = tasks.findIndex((entry) => entry.label === task.label);
	if (index >= 0) {
		tasks[index] = task;
	} else {
		tasks.push(task);
	}

	return {
		version: next.version || '2.0.0',
		tasks,
	};
}
