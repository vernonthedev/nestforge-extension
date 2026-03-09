import test from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildCliArgs, classifyDbStatusOutput, findModuleCandidatesInWorkspace, NESTFORGE_COMMANDS } from '../nestforge-core';

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
