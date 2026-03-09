import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

type FlagValue = boolean | number | string | string[];

export interface CliExecutionOptions {
	cwd?: string;
	progressTitle?: string;
	revealOutputOnError?: boolean;
	showSuccessMessage?: string;
	silent?: boolean;
}

export interface CliResult {
	commandLine: string;
	exitCode: number;
	stdout: string;
	stderr: string;
}

interface CommandRequest {
	args: string[];
	flags?: Record<string, FlagValue | undefined>;
}

export class CliManager {
	public readonly output: vscode.OutputChannel;

	public constructor(private readonly configuration: vscode.WorkspaceConfiguration) {
		this.output = vscode.window.createOutputChannel('NestForge Logs');
	}

	public dispose(): void {
		this.output.dispose();
	}

	public async runNestForge(request: CommandRequest, options: CliExecutionOptions = {}): Promise<CliResult> {
		return this.runExecutable(this.configuration.get<string>('cliPath', 'nestforge'), request, options);
	}

	public async runCargo(request: CommandRequest, options: CliExecutionOptions = {}): Promise<CliResult> {
		return this.runExecutable(this.configuration.get<string>('cargoPath', 'cargo'), request, options);
	}

	public async runExecutable(
		executable: string,
		request: CommandRequest,
		options: CliExecutionOptions = {},
	): Promise<CliResult> {
		const args = this.buildArgs(request.args, request.flags);
		const task = () => this.spawnProcess(executable, args, options.cwd, options.revealOutputOnError ?? true);
		const result = options.progressTitle
			? await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: options.progressTitle,
					cancellable: false,
				},
				task,
			)
			: await task();

		if (result.exitCode !== 0) {
			if (!options.silent) {
				vscode.window.showErrorMessage(`NestForge command failed: ${result.commandLine}`);
			}
			throw new Error(result.stderr || `Command exited with code ${result.exitCode}.`);
		}

		if (options.showSuccessMessage) {
			vscode.window.showInformationMessage(options.showSuccessMessage);
		}

		return result;
	}

	private buildArgs(baseArgs: string[], flags?: Record<string, FlagValue | undefined>): string[] {
		if (!flags) {
			return [...baseArgs];
		}

		const args = [...baseArgs];

		for (const [flag, value] of Object.entries(flags)) {
			if (value === undefined || value === false) {
				continue;
			}

			if (value === true) {
				args.push(`--${flag}`);
				continue;
			}

			if (Array.isArray(value)) {
				for (const entry of value) {
					args.push(`--${flag}`, entry);
				}
				continue;
			}

			args.push(`--${flag}`, String(value));
		}

		return args;
	}

	private spawnProcess(
		executable: string,
		args: string[],
		cwd: string | undefined,
		revealOutputOnError: boolean,
	): Promise<CliResult> {
		return new Promise((resolve, reject) => {
			const processHandle = spawn(executable, args, {
				cwd,
				shell: true,
				env: process.env,
			});

			let stdout = '';
			let stderr = '';
			const commandLine = [executable, ...args].join(' ');

			this.output.appendLine(`> ${commandLine}`);

			processHandle.stdout.on('data', (chunk: Buffer | string) => {
				const text = chunk.toString();
				stdout += text;
				this.output.append(text);
			});

			processHandle.stderr.on('data', (chunk: Buffer | string) => {
				const text = chunk.toString();
				stderr += text;
				this.output.append(text);
			});

			processHandle.on('error', (error) => {
				this.output.appendLine(String(error));
				if (revealOutputOnError) {
					this.output.show(true);
				}
				reject(error);
			});

			processHandle.on('close', (exitCode) => {
				const result: CliResult = {
					commandLine,
					exitCode: exitCode ?? -1,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
				};

				if (result.exitCode !== 0 && revealOutputOnError) {
					this.output.show(true);
				}

				resolve(result);
			});
		});
	}
}
