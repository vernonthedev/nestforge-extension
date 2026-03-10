import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { classifyHeartbeatResult, runInitialConnectionSequence } from '../connection-manager';
import type { CliResult } from '../cli-manager';
import { buildCliArgs, classifyDbStatusOutput, findModuleCandidatesInWorkspace, NESTFORGE_COMMANDS } from '../nestforge-core';
import { buildMidnightNotifyServiceTemplate, injectCargoDependency, setupMidnightNotify } from '../scaffold-integrations';

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

test('buildMidnightNotifyServiceTemplate creates a Rust service that uses env-based configuration', () => {
	const template = buildMidnightNotifyServiceTemplate('.rs');

	assert.match(template, /MIDNIGHT_NOTIFY_API_KEY/);
	assert.match(template, /midnight_notify_client::Client::builder/);
});

test('setupMidnightNotify updates Cargo.toml and writes a starter service file', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nestforge-midnight-'));
	await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
	await fs.writeFile(path.join(tempRoot, 'Cargo.toml'), '[package]\nname = "demo"\n\n[dependencies]\nserde = "1"\n');

	try {
		const result = await setupMidnightNotify(tempRoot);
		const cargoToml = await fs.readFile(path.join(tempRoot, 'Cargo.toml'), 'utf8');
		const serviceFile = await fs.readFile(path.join(tempRoot, 'src', 'notification.service.rs'), 'utf8');

		assert.equal(result.cargoTomlUpdated, true);
		assert.equal(result.serviceFilePath, path.join(tempRoot, 'src', 'notification.service.rs'));
		assert.deepEqual(result.warnings, []);
		assert.match(cargoToml, /midnight-notify-client = "\*"/);
		assert.match(serviceFile, /MIDNIGHT_NOTIFY_TENANT_ID/);
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
			'nestforge.openLogs',
			'nestforge.onboarding.openDocs',
		],
	);
});
