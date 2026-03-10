import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CliManager } from './cli-manager';
import { classifyHeartbeatResult, runInitialConnectionSequence } from './connection-manager';
import { createEnvDiagnosticCollection, EnvCodeActionProvider, provideEnvHover, updateEnvDiagnostics } from './env-support';
import { classifyDbStatusOutput, fileExists, findModuleCandidatesInWorkspace, NESTFORGE_COMMANDS } from './nestforge-core';
import { registerOnboarding } from './onboarding';
import { setupMidnightNotify } from './scaffold-integrations';

type GeneratorCategory = 'Core' | 'Cross-Cutting' | 'Transport';

interface GeneratorDefinition {
	label: string;
	detail: string;
	command: string;
	category: GeneratorCategory;
	needsModule: boolean;
}

interface GeneratorCategoryOption {
	label: GeneratorCategory;
	description: string;
	detail: string;
}

interface DbStatusState {
	kind: 'initializing' | 'healthy' | 'pending' | 'warning' | 'unknown' | 'error';
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

const NEW_APPLICATION_INTEGRATIONS = [
	{
		label: 'Enable Midnight Notify',
		value: 'midnight-notify',
		description: 'Add the Midnight Notify client dependency and a starter notification service.',
	},
];

const GENERATOR_CATEGORY_OPTIONS: GeneratorCategoryOption[] = [
	{
		label: 'Core',
		description: 'Modules, services, and full resources',
		detail: 'Use this for app structure and module-wired building blocks.',
	},
	{
		label: 'Transport',
		description: 'Controllers, resolvers, and gateways',
		detail: 'Use this for HTTP, GraphQL, and WebSocket entry points.',
	},
	{
		label: 'Cross-Cutting',
		description: 'Guards, interceptors, filters, pipes, middleware, and decorators',
		detail: 'Use this for reusable framework concerns that usually do not need a module.',
	},
];

class NestForgeExtension {
	private readonly cliManager: CliManager;
	private readonly envDiagnostics: vscode.DiagnosticCollection;
	private readonly statusBar: vscode.StatusBarItem;
	private dbStatusTimer: NodeJS.Timeout | undefined;
	private dbStatusRunning = false;
	private dbStatusInitialized = false;
	private dbStatusInitialization: Promise<void> | undefined;

	public constructor(private readonly context: vscode.ExtensionContext) {
		this.cliManager = new CliManager(vscode.workspace.getConfiguration('nestforge'));
		this.envDiagnostics = createEnvDiagnosticCollection();
		this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.statusBar.command = 'nestforge.dbStatus';
		this.statusBar.name = 'NestForge DB Status';
		this.setDbStatus({
			kind: 'initializing',
			text: 'NestForge: Initializing...',
			tooltip: 'NestForge is waiting for the local database services to become reachable.',
		});
	}

	public register(): void {
		this.context.subscriptions.push(
			this.cliManager,
			this.envDiagnostics,
			this.statusBar,
			...registerOnboarding(this.context),
			vscode.commands.registerCommand('nestforge.new', () => this.runNewApplicationWizard()),
			vscode.commands.registerCommand('nestforge.generate', (uri?: vscode.Uri) => this.runGeneratorWizard(uri)),
			vscode.commands.registerCommand('nestforge.dbInit', () => this.runDbCommand('init')),
			vscode.commands.registerCommand('nestforge.dbGenerate', () => this.runDbCommand('generate')),
			vscode.commands.registerCommand('nestforge.dbMigrate', () => this.runDbCommand('migrate')),
			vscode.commands.registerCommand('nestforge.dbStatus', () => this.updateDbStatus(true)),
			vscode.commands.registerCommand('nestforge.docs', () => this.openDocs()),
			vscode.commands.registerCommand('nestforge.formatRust', () => this.formatRust()),
			vscode.commands.registerCommand('nestforge.openLogs', () => this.cliManager.output.show(true)),
			vscode.languages.registerCodeActionsProvider(
				{ pattern: '**/.env*' },
				new EnvCodeActionProvider(),
				{ providedCodeActionKinds: EnvCodeActionProvider.providedCodeActionKinds },
			),
			vscode.languages.registerHoverProvider({ pattern: '**/.env*' }, {
				provideHover: (document, position) => provideEnvHover(document, position),
			}),
			vscode.workspace.onDidOpenTextDocument((document) => {
				void this.refreshEnvDiagnostics(document);
			}),
			vscode.workspace.onDidChangeTextDocument((event) => {
				void this.refreshEnvDiagnostics(event.document);
			}),
			vscode.workspace.onDidSaveTextDocument((document) => {
				void this.refreshEnvDiagnostics(document);
				void this.updateDbStatus(false);
			}),
			vscode.workspace.onDidCloseTextDocument((document) => {
				if (path.basename(document.uri.fsPath).startsWith('.env')) {
					this.envDiagnostics.delete(document.uri);
				}
			}),
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				void this.refreshWorkspaceEnvDiagnostics();
			}),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('nestforge.dbStatus') || event.affectsConfiguration('nestforge.cliPath')) {
					this.configureDbStatusPolling();
				}
			}),
		);

		this.statusBar.show();
		this.configureDbStatusPolling();
		void this.refreshWorkspaceEnvDiagnostics();
	}

	private async runNewApplicationWizard(): Promise<void> {
		const destinationRoot = await this.getNewApplicationDestination();
		if (!destinationRoot) {
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
				placeHolder: 'Select one or more transports',
			},
		);

		if (!transports) {
			return;
		}

		const integrations = await vscode.window.showQuickPick(
			NEW_APPLICATION_INTEGRATIONS.map((integration) => ({
				label: integration.label,
				value: integration.value,
				description: integration.description,
			})),
			{
				canPickMany: true,
				ignoreFocusOut: true,
				placeHolder: 'Select optional integrations for the new project',
			},
		);

		if (!integrations) {
			return;
		}

		await this.executeNestForge(
			{
				args: ['new', appName.trim()],
				flags: { transport: transports.map((transport) => transport.value) },
			},
			{
				cwd: destinationRoot,
				progressTitle: `Scaffolding ${appName.trim()}...`,
				refreshExplorer: true,
			},
		);

		const createdAppPath = path.join(destinationRoot, appName.trim());
		if (integrations.some((integration) => integration.value === 'midnight-notify')) {
			await this.configureOptionalScaffoldIntegrations(createdAppPath);
		}

		await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(createdAppPath), {
			forceNewWindow: false,
		});
	}

	private async getNewApplicationDestination(): Promise<string | undefined> {
		const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
		if (workspacePath) {
			return workspacePath;
		}

		const selected = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri: vscode.Uri.file(os.homedir()),
			openLabel: 'Select parent folder',
			title: 'Choose where NestForge should create the new application',
		});

		return selected?.[0]?.fsPath;
	}

	private async runGeneratorWizard(uri?: vscode.Uri): Promise<void> {
		const workspacePath = this.getWorkspacePath(uri);
		if (!workspacePath) {
			return;
		}

		const contextModule = await this.findModuleNameForUri(uri, workspacePath);

		const category = await vscode.window.showQuickPick(
			GENERATOR_CATEGORY_OPTIONS,
			{
				ignoreFocusOut: true,
				placeHolder: 'Choose what kind of file you want to create',
			},
		);

		if (!category) {
			return;
		}

		const generator = await vscode.window.showQuickPick(
			GENERATORS.filter((entry) => entry.category === category.label).map((entry) => ({
				label: entry.label,
				description: entry.needsModule ? 'Requires a target module' : 'Can be created directly in the selected folder',
				detail: entry.detail,
				generator: entry,
			})),
			{
				ignoreFocusOut: true,
				placeHolder: `Select a ${category.label.toLowerCase()} generator to create`,
			},
		);

		if (!generator) {
			return;
		}

		await this.runGenerator(
			generator.generator,
			workspacePath,
			contextModule,
			uri && !generator.generator.needsModule ? uri.fsPath : workspacePath,
		);
	}

	private async runGenerator(
		generator: GeneratorDefinition,
		workspacePath: string,
		preselectedModule?: string,
		executionCwd = workspacePath,
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
		if (generator.needsModule) {
			moduleName = await this.resolveTargetModule(workspacePath, moduleName);
			if (!moduleName) {
				return;
			}
		}

		const args = ['g', generator.command, name.trim()];
		const flags = moduleName ? { module: moduleName } : undefined;

		await this.executeNestForge(
			{ args, flags },
			{
				cwd: executionCwd,
				showSuccessMessage: generator.needsModule
					? `${name.trim()} ${generator.label.toLowerCase()} created and wired.`
					: `${name.trim()} ${generator.label.toLowerCase()} created.`,
				refreshExplorer: true,
			},
		);
	}

	private async runDbCommand(subcommand: 'init' | 'generate' | 'migrate'): Promise<void> {
		const workspacePath = this.getWorkspacePath();
		if (!workspacePath) {
			return;
		}

		let args: string[] = ['db', subcommand];
		let successMessage = `nestforge db ${subcommand} completed.`;

		if (subcommand === 'generate') {
			const migrationName = await vscode.window.showInputBox({
				prompt: 'Enter the migration name',
				ignoreFocusOut: true,
				validateInput: (value) => value.trim() ? undefined : 'Migration name is required.',
			});

			if (!migrationName) {
				return;
			}

			args = ['db', 'generate', migrationName.trim()];
			successMessage = `Migration ${migrationName.trim()} generated.`;
		}

		if (subcommand === 'migrate') {
			const envPath = path.join(workspacePath, '.env');
			const hasEnvFile = await fileExists(envPath);
			if (!hasEnvFile) {
				vscode.window.showWarningMessage('Database migration requires a .env file in the workspace root.');
				return;
			}
		}

		await this.executeNestForge(
			{ args },
			{
				cwd: workspacePath,
				progressTitle: subcommand === 'migrate' ? 'Running database migrations...' : undefined,
				showSuccessMessage: successMessage,
				refreshExplorer: true,
			},
		);

		await this.updateDbStatus(false);
	}

	private async updateDbStatus(notifyOnSuccess: boolean): Promise<void> {
		if (this.dbStatusInitialization && !this.dbStatusInitialized) {
			await this.dbStatusInitialization;
			if (!this.dbStatusInitialized && !notifyOnSuccess) {
				return;
			}
		}

		if (this.dbStatusRunning) {
			return;
		}

		const workspacePath = this.getPrimaryWorkspacePath();
		if (!workspacePath || !this.isDbStatusEnabled()) {
			this.setDbStatus({
				kind: 'unknown',
				text: 'NestForge: Ready',
				tooltip: 'Open a workspace folder and enable DB status checks to monitor database state.',
			});
			return;
		}

		this.dbStatusRunning = true;
		try {
			const statusKind = await this.readDbStatusKind(workspacePath, this.getConnectionTimeoutMs());
			this.applyDbStatusKind(statusKind, notifyOnSuccess);
		} catch (error) {
			this.setDbStatus({
				kind: 'error',
				text: 'NestForge: DB Error',
				tooltip: 'Database status check failed. Click to retry after verifying local services are running.',
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
		this.dbStatusInitialized = false;
		this.setDbStatus({
			kind: 'initializing',
			text: 'NestForge: Initializing...',
			tooltip: 'NestForge is checking whether the local database services are ready.',
		});

		const intervalMs = vscode.workspace.getConfiguration('nestforge').get<number>('dbStatus.intervalMs', 300000);
		this.dbStatusInitialization = this.initializeDbStatus();
		this.dbStatusTimer = setInterval(() => {
			void this.updateDbStatus(false);
		}, intervalMs);
	}

	private setDbStatus(state: DbStatusState): void {
		const iconByKind: Record<DbStatusState['kind'], string> = {
			initializing: '$(sync~spin)',
			healthy: '$(pass-filled)',
			pending: '$(clock)',
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

	private async initializeDbStatus(): Promise<void> {
		const workspacePath = this.getPrimaryWorkspacePath();
		if (!workspacePath || !this.isDbStatusEnabled()) {
			this.dbStatusInitialized = true;
			this.setDbStatus({
				kind: 'unknown',
				text: 'NestForge: Ready',
				tooltip: 'Open a workspace folder and enable DB status checks to monitor database state.',
			});
			return;
		}

		const result = await runInitialConnectionSequence({
			timeoutMs: this.getConnectionTimeoutMs(),
			heartbeat: (timeoutMs) => this.readDbStatusKind(workspacePath, timeoutMs),
		});

		if (result.state === 'connected') {
			this.applyDbStatusKind(result.kind, false);
			this.dbStatusInitialized = true;
			return;
		}

		this.dbStatusInitialized = true;
		this.setDbStatus({
			kind: 'error',
			text: 'NestForge: DB Error',
			tooltip: 'NestForge could not verify database connectivity after multiple startup attempts.',
		});
	}

	private async readDbStatusKind(workspacePath: string, timeoutMs: number): Promise<'healthy' | 'pending' | 'warning' | 'unknown'> {
		const result = await this.cliManager.runNestForge(
			{ args: ['db', 'status'] },
			{
				cwd: workspacePath,
				silent: true,
				revealOutputOnError: false,
				timeoutMs,
			},
		);

		return classifyHeartbeatResult(result, classifyDbStatusOutput);
	}

	private applyDbStatusKind(
		statusKind: 'healthy' | 'pending' | 'warning' | 'unknown',
		notifyOnSuccess: boolean,
	): void {
		if (statusKind === 'warning') {
			this.setDbStatus({
				kind: 'warning',
				text: 'NestForge: Needs Review',
				tooltip: 'Database changes were detected that need attention. Click to inspect status.',
			});
			if (notifyOnSuccess) {
				void vscode.window.showWarningMessage(
					'NestForge found unapplied or conflicting database changes. Open NestForge Logs for details.',
				);
			}
			return;
		}

		if (statusKind === 'pending') {
			this.setDbStatus({
				kind: 'pending',
				text: 'NestForge: Connected',
				tooltip: 'Database connection is working, but migrations are still pending.',
			});
			if (notifyOnSuccess) {
				void vscode.window.showInformationMessage('NestForge database is connected. Pending migrations are available.');
			}
			return;
		}

		if (statusKind === 'healthy') {
			this.setDbStatus({
				kind: 'healthy',
				text: 'NestForge: Connected',
				tooltip: 'Database schema is in sync with migrations.',
			});
			if (notifyOnSuccess) {
				void vscode.window.showInformationMessage('NestForge database is in sync.');
			}
			return;
		}

		this.setDbStatus({
			kind: 'unknown',
			text: 'NestForge: Ready',
			tooltip: 'Database status returned an unrecognized response. Check NestForge Logs for details.',
		});
		if (notifyOnSuccess) {
			void vscode.window.showInformationMessage('NestForge database status completed. Review NestForge Logs for details.');
		}
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

	private async configureOptionalScaffoldIntegrations(projectRoot: string): Promise<void> {
		try {
			const result = await setupMidnightNotify(projectRoot);
			for (const warning of result.warnings) {
				void vscode.window.showWarningMessage(warning);
			}

			if (result.writtenFiles.length > 0) {
				const createdFileLabel = `${path.basename(path.dirname(result.writtenFiles[0]))} feature files`;
				void vscode.window.showInformationMessage(
					`Midnight Notify integration added to the new project, including ${createdFileLabel}.`,
				);
			}
		} catch (error) {
			void vscode.window.showWarningMessage(
				error instanceof Error
					? `Midnight Notify setup completed partially: ${error.message}`
					: 'Midnight Notify setup completed partially.',
			);
		}
	}

	private async refreshWorkspaceEnvDiagnostics(): Promise<void> {
		for (const document of vscode.workspace.textDocuments) {
			await this.refreshEnvDiagnostics(document);
		}

		const envFiles = await vscode.workspace.findFiles('**/.env*', '**/node_modules/**');
		for (const uri of envFiles) {
			const isOpen = vscode.workspace.textDocuments.some((document) => document.uri.toString() === uri.toString());
			if (isOpen) {
				continue;
			}

			try {
				const document = await vscode.workspace.openTextDocument(uri);
				await this.refreshEnvDiagnostics(document);
			} catch {
				continue;
			}
		}
	}

	private async refreshEnvDiagnostics(document: vscode.TextDocument): Promise<void> {
		await updateEnvDiagnostics(this.envDiagnostics, document);
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

	private async resolveTargetModule(
		workspacePath: string,
		preselectedModule?: string,
	): Promise<string | undefined> {
		const modules = await this.findModuleCandidates(workspacePath);
		if (preselectedModule && modules.includes(preselectedModule)) {
			return preselectedModule;
		}

		if (preselectedModule && !modules.includes(preselectedModule)) {
			vscode.window.showWarningMessage(
				`The selected folder is not a NestForge module. Pick a valid module for ${preselectedModule}.`,
			);
		}

		if (!modules.length) {
			return vscode.window.showInputBox({
				prompt: 'Enter the target module name',
				ignoreFocusOut: true,
				validateInput: (value) => value.trim() ? undefined : 'Module name is required.',
			});
		}

		return this.pickTargetModule(workspacePath);
	}

	private async findModuleCandidates(workspacePath: string): Promise<string[]> {
		return findModuleCandidatesInWorkspace(workspacePath);
	}

	private async findModuleNameForUri(uri: vscode.Uri | undefined, workspacePath: string): Promise<string | undefined> {
		if (!uri) {
			return undefined;
		}

		const folderName = path.basename(uri.fsPath);
		const modules = await this.findModuleCandidates(workspacePath);
		return modules.includes(folderName) ? folderName : undefined;
	}

	private getWorkspacePath(uri?: vscode.Uri): string | undefined {
		const folder = uri
			? vscode.workspace.getWorkspaceFolder(uri)
			: vscode.workspace.workspaceFolders?.[0];

		if (!folder) {
			vscode.window.showWarningMessage('Open a workspace folder to use NestForge.');
			return undefined;
		}

		return folder.uri.fsPath;
	}

	private getPrimaryWorkspacePath(): string | undefined {
		return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	}

	private isDbStatusEnabled(): boolean {
		return vscode.workspace.getConfiguration('nestforge').get<boolean>('dbStatus.enabled', true);
	}

	private getConnectionTimeoutMs(): number {
		return vscode.workspace.getConfiguration('nestforge').get<number>('status.connectionTimeout', 5000);
	}
}

export function activate(context: vscode.ExtensionContext): void {
	void NESTFORGE_COMMANDS;
	new NestForgeExtension(context).register();
}

export function deactivate(): void {}
