import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { classifyHeartbeatResult, runInitialConnectionSequence } from '../connection-manager';
import type { CliResult } from '../cli-manager';
import { inferTransportKinds, parseEnvText, resolveEnvSchema } from '../env-schema';
import { ensureRustGitignore } from '../git-support';
import {
	buildNestForgeBuildTask,
	buildNestForgeLaunchConfiguration,
	parseCargoPackageName,
	upsertBuildTask,
	upsertLaunchConfiguration,
} from '../launch-support';
import { scanWorkspaceModuleGraph } from '../module-graph';
import {
	buildCliArgs,
	classifyDbStatusOutput,
	findModuleCandidatesInWorkspace,
	isManagedNestForgeWorkspace,
	NESTFORGE_COMMANDS,
} from '../nestforge-core';
import { injectCargoDependency, injectNotificationsModuleIntoRustEntrypoint, setupMidnightNotify } from '../scaffold-integrations';

test('buildCliArgs expands booleans, scalars, arrays, and skips falsy flags', () => {
	const args = buildCliArgs(['g', 'resource', 'users'], {
		module: 'accounts',
		http: true,
		tag: ['public', 'admin'],
		retries: 2,
		skip: false,
		empty: undefined,
	});

	assert.deepEqual(args, [
		'g',
		'resource',
		'users',
		'--module',
		'accounts',
		'--http',
		'--tag',
		'public',
		'--tag',
		'admin',
		'--retries',
		'2',
	]);
});

test('classifyDbStatusOutput detects warning output', () => {
	assert.equal(classifyDbStatusOutput('Applied: 3\nPending: 0\nDrift: 2'), 'warning');
});

test('classifyDbStatusOutput detects pending migrations without drift', () => {
	assert.equal(classifyDbStatusOutput('Applied: 0\nPending: 1\nDrift: 0'), 'pending');
});

test('classifyDbStatusOutput treats zero drift and zero pending as healthy', () => {
	assert.equal(classifyDbStatusOutput('Applied: 1\nPending: 0\nDrift: 0'), 'healthy');
});

test('classifyDbStatusOutput detects healthy output', () => {
	assert.equal(classifyDbStatusOutput('Schema is in sync and healthy.'), 'healthy');
});

test('classifyDbStatusOutput falls back to unknown output', () => {
	assert.equal(classifyDbStatusOutput('status response without known keywords'), 'unknown');
});

test('classifyHeartbeatResult reuses database output classification', () => {
	const result: CliResult = {
		commandLine: 'nestforge db status',
		exitCode: 0,
		stdout: 'Applied: 1\nPending: 0\nDrift: 0',
		stderr: '',
	};

	assert.equal(classifyHeartbeatResult(result, classifyDbStatusOutput), 'healthy');
});

test('runInitialConnectionSequence waits for grace period and retries before succeeding', async () => {
	const delays: number[] = [];
	let attempts = 0;

	const result = await runInitialConnectionSequence({
		gracePeriodMs: 3000,
		maxAttempts: 3,
		retryDelayMs: 1000,
		timeoutMs: 5000,
		delay: async (ms) => {
			delays.push(ms);
		},
		heartbeat: async () => {
			attempts += 1;
			if (attempts < 3) {
				throw new Error(`attempt ${attempts} failed`);
			}
			return 'healthy';
		},
	});

	assert.deepEqual(delays, [3000, 1000, 1000]);
	assert.equal(result.state, 'connected');
	assert.equal(result.attempts, 3);
	assert.equal(result.kind, 'healthy');
});

test('runInitialConnectionSequence reports failure only after the final attempt', async () => {
	let attempts = 0;

	const result = await runInitialConnectionSequence({
		gracePeriodMs: 3000,
		maxAttempts: 3,
		retryDelayMs: 1000,
		timeoutMs: 5000,
		delay: async () => undefined,
		heartbeat: async () => {
			attempts += 1;
			throw new Error(`attempt ${attempts} failed`);
		},
	});

	assert.equal(attempts, 3);
	assert.equal(result.state, 'failed');
	assert.equal(result.attempts, 3);
	assert.match(result.error.message, /attempt 3 failed/);
});

test('parseEnvText returns parsed key/value entries', () => {
	const entries = parseEnvText('# comment\nDATABASE_URL=postgres://localhost:5432/app\nHTTP_PORT=3000\n');

	assert.equal(entries.get('DATABASE_URL')?.value, 'postgres://localhost:5432/app');
	assert.equal(entries.get('HTTP_PORT')?.line, 2);
});

test('ensureRustGitignore appends the target ignore rule once', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestforge-gitignore-'));
	await fs.writeFile(path.join(tempRoot, '.gitignore'), 'dist/\n');

	try {
		await ensureRustGitignore(tempRoot);
		await ensureRustGitignore(tempRoot);
		const gitignore = await fs.readFile(path.join(tempRoot, '.gitignore'), 'utf8');
		assert.equal(gitignore, 'dist/\n/target\n');
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test('parseCargoPackageName extracts the binary name from Cargo.toml', () => {
	const cargoToml = '[package]\nname = "enzi-connect"\nversion = "0.1.0"\n';
	assert.equal(parseCargoPackageName(cargoToml), 'enzi-connect');
});

test('upsertLaunchConfiguration inserts and replaces the NestForge debug profile', () => {
	const launch = upsertLaunchConfiguration(
		{ version: '0.2.0', configurations: [{ name: 'Other Debug', type: 'lldb' }] },
		buildNestForgeLaunchConfiguration('enzi-connect', 'lldb'),
	);

	assert.equal(launch.configurations.length, 2);
	assert.deepEqual(
		launch.configurations.find((entry) => entry.name === 'Run NestForge Project'),
		buildNestForgeLaunchConfiguration('enzi-connect', 'lldb'),
	);
});

test('upsertBuildTask inserts the cargo build task once', () => {
	const task = buildNestForgeBuildTask();
	const tasks = upsertBuildTask({ version: '2.0.0', tasks: [task] }, task);

	assert.equal(tasks.tasks.length, 1);
	assert.deepEqual(tasks.tasks[0], task);
});

test('injectCargoDependency adds Midnight Notify under an existing dependencies section', () => {
	const source = '[package]\nname = "demo"\n\n[dependencies]\nserde = "1"\n';
	const updated = injectCargoDependency(source);

	assert.match(updated, /\[dependencies\]\nmidnight-notify-client = "\*"\nserde = "1"/);
});

test('injectCargoDependency creates a dependencies section when missing', () => {
	const source = '[package]\nname = "demo"\n';
	const updated = injectCargoDependency(source);

	assert.match(updated, /\[dependencies\]\nmidnight-notify-client = "\*"/);
});

test('injectNotificationsModuleIntoRustEntrypoint registers the notifications module', () => {
	const source = 'fn main() {\n    println!("hello");\n}\n';
	const updated = injectNotificationsModuleIntoRustEntrypoint(source);

	assert.match(updated, /^pub mod notifications;/);
	assert.match(updated, /fn main\(\)/);
});

test('setupMidnightNotify creates the Rust notifications module and registers it in main.rs', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestforge-midnight-'));
	await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
	await fs.writeFile(path.join(tempRoot, 'Cargo.toml'), '[package]\nname = "demo"\n\n[dependencies]\nserde = "1"\n');
	await fs.writeFile(path.join(tempRoot, 'src', 'main.rs'), 'fn main() {\n    println!("hello");\n}\n');

	try {
		const result = await setupMidnightNotify(tempRoot);
		const cargoToml = await fs.readFile(path.join(tempRoot, 'Cargo.toml'), 'utf8');
		const rootModuleFile = await fs.readFile(path.join(tempRoot, 'src', 'notifications', 'mod.rs'), 'utf8');
		const rustServiceFile = await fs.readFile(path.join(tempRoot, 'src', 'notifications', 'services', 'notification_service.rs'), 'utf8');
		const rustControllerFile = await fs.readFile(path.join(tempRoot, 'src', 'notifications', 'controllers', 'notification_controller.rs'), 'utf8');
		const rustConfigFile = await fs.readFile(path.join(tempRoot, 'src', 'notifications', 'config', 'notification_config.rs'), 'utf8');
		const mainFile = await fs.readFile(path.join(tempRoot, 'src', 'main.rs'), 'utf8');

		assert.equal(result.cargoTomlUpdated, true);
		assert.deepEqual(result.warnings, []);
		assert.match(cargoToml, /midnight-notify-client = "\*"/);
		assert.ok(result.writtenFiles.includes(path.join(tempRoot, 'src', 'notifications', 'services', 'notification_service.rs')));
		assert.match(rootModuleFile, /pub mod services;/);
		assert.match(rustServiceFile, /pub struct NotificationService/);
		assert.match(rustControllerFile, /pub struct NotificationController/);
		assert.match(rustConfigFile, /MIDNIGHT_NOTIFY_API_KEY/);
		assert.match(mainFile, /^pub mod notifications;/);
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test('inferTransportKinds detects grpc and http from workspace files', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestforge-env-'));
	await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
	await fs.writeFile(path.join(tempRoot, 'Cargo.toml'), '[dependencies]\ntonic = "0.12"\naxum = "0.7"\n');

	try {
		const transports = await inferTransportKinds(tempRoot);
		assert.deepEqual(transports, ['http', 'grpc']);
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test('resolveEnvSchema includes transport-specific variables', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestforge-schema-'));
	await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
	await fs.writeFile(path.join(tempRoot, 'Cargo.toml'), '[dependencies]\ntonic = "0.12"\n');

	try {
		const schema = await resolveEnvSchema(tempRoot);
		assert.deepEqual(schema.transports, ['grpc']);
		assert.deepEqual(
			schema.requiredVariables.map((variable) => variable.name),
			['DATABASE_URL', 'GRPC_HOST', 'GRPC_PORT'],
		);
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test('scanWorkspaceModuleGraph detects Rust modules and internal dependencies', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestforge-graph-'));
	await fs.mkdir(path.join(tempRoot, 'src', 'notifications', 'services'), { recursive: true });
	await fs.mkdir(path.join(tempRoot, 'src', 'notifications', 'controllers'), { recursive: true });
	await fs.writeFile(path.join(tempRoot, 'src', 'main.rs'), 'pub mod notifications;\nfn main() {}\n');
	await fs.writeFile(path.join(tempRoot, 'src', 'notifications', 'mod.rs'), 'pub mod services;\npub mod controllers;\n');
	await fs.writeFile(path.join(tempRoot, 'src', 'notifications', 'services', 'mod.rs'), 'pub mod notification_service;\n');
	await fs.writeFile(
		path.join(tempRoot, 'src', 'notifications', 'services', 'notification_service.rs'),
		'use crate::notifications::controllers::notification_controller::NotificationController;\n',
	);
	await fs.writeFile(path.join(tempRoot, 'src', 'notifications', 'controllers', 'mod.rs'), 'pub mod notification_controller;\n');
	await fs.writeFile(
		path.join(tempRoot, 'src', 'notifications', 'controllers', 'notification_controller.rs'),
		'use crate::notifications::services::notification_service::NotificationService;\n',
	);

	try {
		const graph = await scanWorkspaceModuleGraph(tempRoot);
		assert.ok(graph.nodes.some((node) => node.id === 'notifications' && node.kind === 'module'));
		assert.ok(graph.nodes.some((node) => node.id === 'notifications::services::notification_service' && node.kind === 'service'));
		assert.ok(graph.edges.some((edge) => edge.from === 'main' && edge.to === 'notifications' && edge.kind === 'contains'));
		assert.ok(
			graph.edges.some(
				(edge) =>
					edge.from === 'notifications::controllers::notification_controller'
					&& edge.to === 'notifications::services::notification_service'
					&& edge.kind === 'uses',
			),
		);
		assert.ok(graph.nodes.some((node) => node.id === 'notifications::controllers::notification_controller' && node.inCycle));
		assert.ok(graph.nodes.some((node) => node.id === 'notifications::services::notification_service' && node.inCycle));
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test('findModuleCandidatesInWorkspace prefers src and returns sorted unique candidates', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestforge-test-'));
	const srcRoot = path.join(tempRoot, 'src');
	await fs.mkdir(path.join(srcRoot, 'users'), { recursive: true });
	await fs.mkdir(path.join(srcRoot, 'billing'), { recursive: true });
	await fs.mkdir(path.join(srcRoot, 'guards'), { recursive: true });
	await fs.writeFile(path.join(srcRoot, 'users', 'users.module.ts'), 'export class UsersModule {}');
	await fs.writeFile(path.join(srcRoot, 'billing', 'billing.module.ts'), 'export class BillingModule {}');
	await fs.writeFile(path.join(srcRoot, 'app.module.ts'), 'export class AppModule {}');
	await fs.writeFile(path.join(srcRoot, 'guards', 'auth.guard.ts'), 'export class AuthGuard {}');

	try {
		const modules = await findModuleCandidatesInWorkspace(tempRoot);
		assert.deepEqual(modules, ['app', 'billing', 'users']);
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test('findModuleCandidatesInWorkspace returns an empty list for missing roots', async () => {
	const missingPath = path.join(os.tmpdir(), `nestforge-missing-${Date.now()}`);
	assert.deepEqual(await findModuleCandidatesInWorkspace(missingPath), []);
});

test('isManagedNestForgeWorkspace requires a NestForge marker file or directory', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestforge-workspace-marker-'));

	try {
		assert.equal(await isManagedNestForgeWorkspace(tempRoot), false);

		await fs.writeFile(path.join(tempRoot, 'nestforge.toml'), 'workspace = true\n');
		assert.equal(await isManagedNestForgeWorkspace(tempRoot), true);

		await fs.rm(path.join(tempRoot, 'nestforge.toml'), { force: true });
		await fs.mkdir(path.join(tempRoot, '.nestforge'));
		assert.equal(await isManagedNestForgeWorkspace(tempRoot), true);
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test('declared command definitions cover the expected command ids', () => {
	assert.deepEqual(
		NESTFORGE_COMMANDS.map((entry) => entry.command),
		[
			'nestforge.new',
			'nestforge.generate',
			'nestforge.dbInit',
			'nestforge.dbGenerate',
			'nestforge.dbMigrate',
			'nestforge.dbStatus',
			'nestforge.docs',
			'nestforge.formatRust',
			'nestforge.generateLaunchConfig',
			'nestforge.initGit',
			'nestforge.openLogs',
			'nestforge.showModuleGraph',
			'nestforge.onboarding.openDocs',
		],
	);
});
