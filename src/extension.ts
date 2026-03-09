import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CliManager } from './cli-manager';
import { registerOnboarding } from './onboarding';

type GeneratorCategory = 'Core' | 'Cross-Cutting' | 'Transport';

interface GeneratorDefinition {
	label: string;
	detail: string;
	command: string;
	category: GeneratorCategory;
	needsModule: boolean;
}

interface DbStatusState {
	kind: 'healthy' | 'warning' | 'unknown' | 'error';
	text: string;
	tooltip: string;
}

const GENERATORS: GeneratorDefinition[] = [
	{ label: 'Module', detail: 'Create a feature module shell.', command: 'module', category: 'Core', needsModule: false },
	{ label: 'Service', detail: 'Generate a provider or service.', command: 'service', category: 'Core', needsModule: true },
	{ label: 'Resource', detail: 'Generate a full resource and wire it into a module.', command: 'resource', category: 'Core', needsModule: true },
	{ label: 'Controller', detail: 'Generate a transport controller.', command: 'controller', category: 'Transport', needsModule: true },
	{ label: 'Resolver', detail: 'Generate a GraphQL resolver.', command: 'resolver', category: 'Transport', needsModule: true },
	{ label: 'Gateway', detail: 'Generate a WebSocket gateway.', command: 'gateway', category: 'Transport', needsModule: true },
	{ label: 'Guard', detail: 'Generate an authorization guard.', command: 'guard', category: 'Cross-Cutting', needsModule: false },
	{ label: 'Interceptor', detail: 'Generate a request/response interceptor.', command: 'interceptor', category: 'Cross-Cutting', needsModule: false },
	{ label: 'Filter', detail: 'Generate an exception filter.', command: 'filter', category: 'Cross-Cutting', needsModule: false },
	{ label: 'Pipe', detail: 'Generate a transformation or validation pipe.', command: 'pipe', category: 'Cross-Cutting', needsModule: false },
	{ label: 'Middleware', detail: 'Generate middleware.', command: 'middleware', category: 'Cross-Cutting', needsModule: false },
	{ label: 'Decorator', detail: 'Generate a reusable decorator.', command: 'decorator', category: 'Cross-Cutting', needsModule: false },
];

const TRANSPORT_OPTIONS = [
	{ label: 'HTTP', value: 'http' },
	{ label: 'GraphQL', value: 'graphql' },
	{ label: 'gRPC', value: 'grpc' },
	{ label: 'Microservices', value: 'microservices' },
	{ label: 'WebSockets', value: 'websockets' },
];

class NestForgeExtension {
	private readonly cliManager: CliManager;
	private readonly statusBar: vscode.StatusBarItem;
	private dbStatusTimer: NodeJS.Timeout | undefined;
	private dbStatusRunning = false;

	public constructor(private readonly context: vscode.ExtensionContext) {
		this.cliManager = new CliManager(vscode.workspace.getConfiguration('nestforge'));
		this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.statusBar.command = 'nestforge.dbStatus';
		this.statusBar.name = 'NestForge DB Status';
		this.setDbStatus({
			kind: 'unknown',
			text: 'NestForge DB',
			tooltip: 'Database status has not been checked yet.',
		});
	}

	public register(): void {
		this.context.subscriptions.push(
			this.cliManager,
			this.statusBar,
			...registerOnboarding(this.context),
			vscode.commands.registerCommand('nestforge.new', () => this.runNewApplicationWizard()),
			vscode.commands.registerCommand('nestforge.generate', (uri?: vscode.Uri) => this.runGeneratorWizard(uri)),
			vscode.commands.registerCommand('nestforge.generateResourceHere', (uri?: vscode.Uri) => this.generateResourceFromContext(uri)),
			vscode.commands.registerCommand('nestforge.dbInit', () => this.runDbCommand('init')),
			vscode.commands.registerCommand('nestforge.dbGenerate', () => this.runDbCommand('generate')),
			vscode.commands.registerCommand('nestforge.dbMigrate', () => this.runDbCommand('migrate')),
			vscode.commands.registerCommand('nestforge.dbStatus', () => this.updateDbStatus(true)),
			vscode.commands.registerCommand('nestforge.docs', () => this.openDocs()),
			vscode.commands.registerCommand('nestforge.formatRust', () => this.formatRust()),
			vscode.commands.registerCommand('nestforge.openLogs', () => this.cliManager.output.show(true)),
			vscode.workspace.onDidSaveTextDocument(() => {
				void this.updateDbStatus(false);
			}),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('nestforge.dbStatus') || event.affectsConfiguration('nestforge.cliPath')) {
					this.configureDbStatusPolling();
				}
			}),
		);

		this.statusBar.show();
		this.configureDbStatusPolling();
	}

	private async runNewApplicationWizard(): Promise<void> {
		const workspacePath = this.getWorkspacePath();
		if (!workspacePath) {
			return;
		}

		const appName = await vscode.window.showInputBox({
			prompt: 'Enter the NestForge application name',
			ignoreFocusOut: true,
			validateInput: (value) => value.trim() ? undefined : 'Application name is required.',
		});

		if (!appName) {
			return;
		}

		const transports = await vscode.window.showQuickPick(
			TRANSPORT_OPTIONS.map((option) => ({
				label: option.label,
				picked: option.value === 'http',
				value: option.value,
			})),
			{
				canPickMany: true,
				ignoreFocusOut: true,
				placeHolder: 'Select one or more transport flags',
			},
		);

		if (!transports) {
			return;
		}

		await this.executeNestForge(
			{
				args: ['new', appName.trim()],
				flags: Object.fromEntries(transports.map((transport) => [transport.value, true])),
			},
			{
				cwd: workspacePath,
				progressTitle: `Scaffolding ${appName.trim()}...`,
				showSuccessMessage: `${appName.trim()} created successfully.`,
				refreshExplorer: true,
			},
		);
	}

	private async runGeneratorWizard(uri?: vscode.Uri): Promise<void> {
		const workspacePath = this.getWorkspacePath(uri);
		if (!workspacePath) {
			return;
		}

		const category = await vscode.window.showQuickPick(
			['Core', 'Cross-Cutting', 'Transport'].map((label) => ({ label })),
			{
				ignoreFocusOut: true,
				placeHolder: 'Select a generator category',
			},
		);

		if (!category) {
			return;
		}

		const generator = await vscode.window.showQuickPick(
			GENERATORS.filter((entry) => entry.category === category.label).map((entry) => ({
				label: entry.label,
				detail: entry.detail,
				generator: entry,
			})),
			{
				ignoreFocusOut: true,
				placeHolder: `Select a ${category.label.toLowerCase()} generator`,
			},
		);

		if (!generator) {
			return;
		}

		await this.runGenerator(generator.generator, workspacePath);
	}

	private async generateResourceFromContext(uri?: vscode.Uri): Promise<void> {
		const workspacePath = this.getWorkspacePath(uri);
		if (!workspacePath) {
			return;
		}

		const folderName = uri ? path.basename(uri.fsPath) : undefined;
		const resource = GENERATORS.find((entry) => entry.command === 'resource');
		if (!resource) {
			return;
		}

		await this.runGenerator(resource, workspacePath, folderName);
	}

	private async runGenerator(
		generator: GeneratorDefinition,
		workspacePath: string,
		preselectedModule?: string,
	): Promise<void> {
		const name = await vscode.window.showInputBox({
			prompt: `Enter the ${generator.label.toLowerCase()} name`,
			ignoreFocusOut: true,
			validateInput: (value) => value.trim() ? undefined : `${generator.label} name is required.`,
		});

		if (!name) {
			return;
		}

		let moduleName = preselectedModule;
		if (generator.needsModule && !moduleName) {
			moduleName = await this.pickTargetModule(workspacePath);
			if (!moduleName) {
				return;
			}
		}

		const args = ['g', generator.command, name.trim()];
		const flags = moduleName ? { module: moduleName } : undefined;

		await this.executeNestForge(
			{ args, flags },
			{
				cwd: workspacePath,
				showSuccessMessage: `${name.trim()} ${generator.label.toLowerCase()} created and wired.`,
				refreshExplorer: true,
			},
		);
	}

	private async runDbCommand(subcommand: 'init' | 'generate' | 'migrate'): Promise<void> {
		const workspacePath = this.getWorkspacePath();
		if (!workspacePath) {
			return;
		}

		if (subcommand === 'migrate') {
			const envPath = path.join(workspacePath, '.env');
			const hasEnvFile = await this.fileExists(envPath);
			if (!hasEnvFile) {
				vscode.window.showWarningMessage('Database migration requires a .env file in the workspace root.');
				return;
			}
		}

		await this.executeNestForge(
			{ args: ['db', subcommand] },
			{
				cwd: workspacePath,
				progressTitle: subcommand === 'migrate' ? 'Running database migrations...' : undefined,
				showSuccessMessage: `nestforge db ${subcommand} completed.`,
				refreshExplorer: true,
			},
		);

		await this.updateDbStatus(false);
	}

	private async updateDbStatus(notifyOnSuccess: boolean): Promise<void> {
		if (this.dbStatusRunning) {
			return;
		}

		const workspacePath = this.getWorkspacePath();
		if (!workspacePath || !this.isDbStatusEnabled()) {
			this.setDbStatus({
				kind: 'unknown',
				text: 'NestForge DB',
				tooltip: 'Database status checks are disabled or no workspace is open.',
			});
			return;
		}

		this.dbStatusRunning = true;
		try {
			const result = await this.cliManager.runNestForge(
				{ args: ['db', 'status'] },
				{
					cwd: workspacePath,
					silent: true,
					revealOutputOnError: false,
				},
			);

			const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
			if (/\b(drift|out of sync|pending|diverged|not up to date)\b/.test(output)) {
				this.setDbStatus({
					kind: 'warning',
					text: 'NestForge DB Drift',
					tooltip: 'Database schema appears out of sync. Click to inspect status.',
				});
				if (notifyOnSuccess) {
					vscode.window.showWarningMessage('NestForge database status reports drift.');
				}
				return;
			}

			if (/\b(in sync|up to date|healthy|no drift|ok)\b/.test(output)) {
				this.setDbStatus({
					kind: 'healthy',
					text: 'NestForge DB OK',
					tooltip: 'Database schema is in sync with migrations.',
				});
				if (notifyOnSuccess) {
					vscode.window.showInformationMessage('NestForge database is in sync.');
				}
				return;
			}

			this.setDbStatus({
				kind: 'unknown',
				text: 'NestForge DB Unknown',
				tooltip: 'Database status returned an unrecognized response. Check NestForge Logs.',
			});
			if (notifyOnSuccess) {
				vscode.window.showInformationMessage('NestForge database status completed. Review NestForge Logs for details.');
			}
		} catch (error) {
			this.setDbStatus({
				kind: 'error',
				text: 'NestForge DB Error',
				tooltip: 'Database status check failed. Click to retry and review logs.',
			});
			if (notifyOnSuccess) {
				vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Database status check failed.');
			}
		} finally {
			this.dbStatusRunning = false;
		}
	}

	private async openDocs(): Promise<void> {
		const docsUrl = vscode.workspace.getConfiguration('nestforge').get<string>('docsUrl', 'http://localhost:3000/api/docs');
		await vscode.env.openExternal(vscode.Uri.parse(docsUrl));
	}

	private async formatRust(): Promise<void> {
		const workspacePath = this.getWorkspacePath();
		if (!workspacePath) {
			return;
		}

		await this.cliManager.runCargo(
			{ args: ['fmt'] },
			{
				cwd: workspacePath,
				progressTitle: 'Running cargo fmt...',
				showSuccessMessage: 'Cargo fmt completed.',
			},
		);

		await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
	}

	private configureDbStatusPolling(): void {
		if (this.dbStatusTimer) {
			clearInterval(this.dbStatusTimer);
			this.dbStatusTimer = undefined;
		}

		if (!this.isDbStatusEnabled()) {
			this.statusBar.hide();
			return;
		}

		this.statusBar.show();
		const intervalMs = vscode.workspace.getConfiguration('nestforge').get<number>('dbStatus.intervalMs', 300000);
		this.dbStatusTimer = setInterval(() => {
			void this.updateDbStatus(false);
		}, intervalMs);
		void this.updateDbStatus(false);
	}

	private setDbStatus(state: DbStatusState): void {
		const iconByKind: Record<DbStatusState['kind'], string> = {
			healthy: '$(pass-filled)',
			warning: '$(warning)',
			unknown: '$(question)',
			error: '$(error)',
		};

		this.statusBar.text = `${iconByKind[state.kind]} ${state.text}`;
		this.statusBar.tooltip = state.tooltip;
		this.statusBar.backgroundColor =
			state.kind === 'warning'
				? new vscode.ThemeColor('statusBarItem.warningBackground')
				: state.kind === 'error'
					? new vscode.ThemeColor('statusBarItem.errorBackground')
					: undefined;
	}

	private async executeNestForge(
		request: { args: string[]; flags?: Record<string, boolean | string | string[] | number | undefined> },
		options: {
			cwd: string;
			progressTitle?: string;
			showSuccessMessage?: string;
			refreshExplorer?: boolean;
		},
	): Promise<void> {
		try {
			await this.cliManager.runNestForge(request, {
				cwd: options.cwd,
				progressTitle: options.progressTitle,
				showSuccessMessage: options.showSuccessMessage,
			});

			if (options.refreshExplorer) {
				await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
			}
		} catch (error) {
			vscode.window.showErrorMessage(error instanceof Error ? error.message : 'NestForge command failed.');
		}
	}

	private async pickTargetModule(workspacePath: string): Promise<string | undefined> {
		const modules = await this.findModuleCandidates(workspacePath);
		if (!modules.length) {
			return vscode.window.showInputBox({
				prompt: 'Enter the target module name',
				ignoreFocusOut: true,
				validateInput: (value) => value.trim() ? undefined : 'Module name is required.',
			});
		}

		const selected = await vscode.window.showQuickPick(
			modules.map((moduleName) => ({
				label: moduleName,
			})),
			{
				ignoreFocusOut: true,
				placeHolder: 'Select the target module',
			},
		);

		return selected?.label;
	}

	private async findModuleCandidates(workspacePath: string): Promise<string[]> {
		const sourceRoot = path.join(workspacePath, 'src');
		const root = await this.fileExists(sourceRoot) ? sourceRoot : workspacePath;
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
					candidates.add(entry.name);
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

	private getWorkspacePath(uri?: vscode.Uri): string | undefined {
		const folder = uri
			? vscode.workspace.getWorkspaceFolder(uri)
			: vscode.workspace.workspaceFolders?.[0];

		if (!folder) {
			vscode.window.showWarningMessage('Open a workspace folder to use NestForge Toolkit.');
			return undefined;
		}

		return folder.uri.fsPath;
	}

	private isDbStatusEnabled(): boolean {
		return vscode.workspace.getConfiguration('nestforge').get<boolean>('dbStatus.enabled', true);
	}

	private async fileExists(targetPath: string): Promise<boolean> {
		try {
			await fs.access(targetPath);
			return true;
		} catch {
			return false;
		}
	}
}

export function activate(context: vscode.ExtensionContext): void {
	new NestForgeExtension(context).register();
}

export function deactivate(): void {}
