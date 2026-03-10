import * as path from 'node:path';
import * as vscode from 'vscode';
import { CliManager } from './cli-manager';
import { ensureRustGitignore } from './git-support';
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
