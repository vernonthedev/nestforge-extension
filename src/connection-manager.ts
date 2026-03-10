import type { CliResult } from './cli-manager';

export type DbConnectionKind = 'healthy' | 'pending' | 'warning' | 'unknown';

export interface InitialConnectionOptions {
	gracePeriodMs?: number;
	maxAttempts?: number;
	retryDelayMs?: number;
	timeoutMs: number;
	delay?: (ms: number) => Promise<void>;
	heartbeat: (timeoutMs: number) => Promise<DbConnectionKind>;
}

export interface InitialConnectionSuccess {
	state: 'connected';
	attempts: number;
	kind: DbConnectionKind;
}

export interface InitialConnectionFailure {
	state: 'failed';
	attempts: number;
	error: Error;
}

export type InitialConnectionResult = InitialConnectionSuccess | InitialConnectionFailure;

const defaultDelay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function runInitialConnectionSequence(options: InitialConnectionOptions): Promise<InitialConnectionResult> {
	const {
		gracePeriodMs = 3000,
		maxAttempts = 3,
		retryDelayMs = 1000,
		timeoutMs,
		delay = defaultDelay,
		heartbeat,
	} = options;

	await delay(gracePeriodMs);

	let lastError: Error | undefined;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const kind = await heartbeat(timeoutMs);
			return {
				state: 'connected',
				attempts: attempt,
				kind,
			};
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < maxAttempts) {
				await delay(retryDelayMs);
			}
		}
	}

	return {
		state: 'failed',
		attempts: maxAttempts,
		error: lastError ?? new Error('Unable to establish the initial NestForge DB connection.'),
	};
}

export function classifyHeartbeatResult(result: CliResult, classifyOutput: (output: string) => DbConnectionKind): DbConnectionKind {
	return classifyOutput(`${result.stdout}\n${result.stderr}`);
}
