import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileExists } from './nestforge-core';

export async function ensureRustGitignore(workspacePath: string): Promise<void> {
	const gitignorePath = path.join(workspacePath, '.gitignore');
	const targetEntry = '/target';
	const existing = await fileExists(gitignorePath) ? await fs.readFile(gitignorePath, 'utf8') : '';
	if (existing.split(/\r?\n/).some((line) => line.trim() === targetEntry)) {
		return;
	}

	const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
	await fs.writeFile(gitignorePath, `${existing}${prefix}${targetEntry}\n`, 'utf8');
}
