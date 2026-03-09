import * as path from 'node:path';
import * as vscode from 'vscode';

export function registerOnboarding(context: vscode.ExtensionContext): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	const refreshContexts = async () => {
		await vscode.commands.executeCommand('setContext', 'nestforge.hasWorkspace', Boolean(vscode.workspace.workspaceFolders?.length));
		await vscode.commands.executeCommand(
			'setContext',
			'nestforge.cliConfigured',
			Boolean(vscode.workspace.getConfiguration('nestforge').get<string>('cliPath')),
		);
	};

	disposables.push(
		vscode.commands.registerCommand('nestforge.onboarding.openDocs', async () => {
			const readmeUri = vscode.Uri.file(path.join(context.extensionPath, 'README.md'));
			await vscode.commands.executeCommand('markdown.showPreview', readmeUri);
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => {
			void refreshContexts();
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('nestforge.cliPath')) {
				void refreshContexts();
			}
		}),
	);

	void refreshContexts();
	return disposables;
}
