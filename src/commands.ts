import * as path from 'node:path';
import * as vscode from 'vscode';
import { CliManager } from './cli-manager';
import { ensureRustGitignore } from './git-support';
import {
	buildNestForgeBuildTask,
	buildNestForgeLaunchConfiguration,
	type LaunchConfigurationFile,
	type TasksConfigurationFile,
	resolveCargoPackageName,
	upsertBuildTask,
	upsertLaunchConfiguration,
} from './launch-support';
import { fileExists } from './nestforge-core';

export async function initializeGitRepository(
	workspacePath: string,
	cliManager: CliManager,
): Promise<{ initialized: boolean; committed: boolean }> {
	const gitAvailable = await cliManager.isGitAvailable();
	if (!gitAvailable) {
		vscode.window.showWarningMessage('Git was not found in PATH. Install Git to initialize the repository from NestForge.');
		return { initialized: false, committed: false };
	}

	const gitDirectoryPath = path.join(workspacePath, '.git');
	const alreadyInitialized = await fileExists(gitDirectoryPath);
	await ensureRustGitignore(workspacePath);

	if (!alreadyInitialized) {
		await cliManager.runGit(
			{ args: ['init'] },
			{
				cwd: workspacePath,
				progressTitle: 'Initializing Git repository...',
				showSuccessMessage: 'Git repository initialized.',
			},
		);
	}

	await cliManager.runGit(
		{ args: ['add', '.'] },
		{
			cwd: workspacePath,
			progressTitle: 'Staging initial NestForge files...',
			revealOutputOnError: false,
			silent: true,
		},
	);

	let committed = false;
	try {
		await cliManager.runGit(
			{ args: ['commit', '-m', 'feat: initial nestforge scaffold'] },
			{
				cwd: workspacePath,
				progressTitle: 'Creating initial Git commit...',
				revealOutputOnError: false,
				silent: true,
			},
		);
		committed = true;
	} catch (error) {
		vscode.window.showWarningMessage(
			error instanceof Error
				? `Git repository initialized, but the initial commit failed: ${error.message}`
				: 'Git repository initialized, but the initial commit failed.',
		);
	}

	await vscode.commands.executeCommand('setContext', 'nestforge.gitInitialized', true);
	return { initialized: true, committed };
}

export async function generateLaunchConfiguration(
	workspacePath: string,
): Promise<{ generated: boolean; debuggerType: 'lldb' | 'cppvsdbg'; binaryName?: string }> {
	const binaryName = await resolveCargoPackageName(workspacePath);
	if (!binaryName) {
		vscode.window.showWarningMessage('NestForge could not determine the Rust binary name from Cargo.toml.');
		return { generated: false, debuggerType: resolveDebuggerType() };
	}

	const debuggerType = resolveDebuggerType();
	const vscodeDirectoryUri = vscode.Uri.file(path.join(workspacePath, '.vscode'));
	const launchUri = vscode.Uri.joinPath(vscodeDirectoryUri, 'launch.json');
	const tasksUri = vscode.Uri.joinPath(vscodeDirectoryUri, 'tasks.json');

	await vscode.workspace.fs.createDirectory(vscodeDirectoryUri);

	const launchConfiguration = buildNestForgeLaunchConfiguration(binaryName, debuggerType);
	const taskConfiguration = buildNestForgeBuildTask();
	const existingLaunch = await readJsonFile<LaunchConfigurationFile>(launchUri);
	const existingTasks = await readJsonFile<TasksConfigurationFile>(tasksUri);

	const nextLaunch = upsertLaunchConfiguration(existingLaunch, launchConfiguration);
	const nextTasks = upsertBuildTask(existingTasks, taskConfiguration);

	await vscode.workspace.fs.writeFile(launchUri, Buffer.from(`${JSON.stringify(nextLaunch, null, 2)}\n`, 'utf8'));
	await vscode.workspace.fs.writeFile(tasksUri, Buffer.from(`${JSON.stringify(nextTasks, null, 2)}\n`, 'utf8'));

	await vscode.commands.executeCommand('setContext', 'nestforge.runnerConfigured', true);
	await recommendRustDebugger(debuggerType);
	return { generated: true, debuggerType, binaryName };
}

async function recommendRustDebugger(debuggerType: 'lldb' | 'cppvsdbg'): Promise<void> {
	if (debuggerType !== 'lldb') {
		return;
	}

	if (vscode.extensions.getExtension('vadimcn.vscode-lldb')) {
		return;
	}

	const selection = await vscode.window.showInformationMessage(
		'NestForge generated a CodeLLDB run configuration. Install the CodeLLDB extension to run Rust projects from VS Code.',
		'Install CodeLLDB',
	);
	if (selection === 'Install CodeLLDB') {
		await vscode.commands.executeCommand('workbench.extensions.installExtension', 'vadimcn.vscode-lldb');
	}
}

function resolveDebuggerType(): 'lldb' | 'cppvsdbg' {
	return process.platform === 'win32' ? 'cppvsdbg' : 'lldb';
}

async function readJsonFile<T>(uri: vscode.Uri): Promise<T | undefined> {
	try {
		const content = await vscode.workspace.fs.readFile(uri);
		return JSON.parse(Buffer.from(content).toString('utf8')) as T;
	} catch {
		return undefined;
	}
}
