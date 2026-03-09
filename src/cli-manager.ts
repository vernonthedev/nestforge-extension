import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { EventEmitter } from 'node:events';
import { buildCliArgs, type FlagValue } from './nestforge-core';

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

interface ChildProcessLike extends EventEmitter {
	stdout: EventEmitter;
	stderr: EventEmitter;
}

interface CliManagerDependencies {
	outputChannelFactory: (name: string) => vscode.OutputChannel;
	showErrorMessage: (message: string) => Thenable<string | undefined>;
	showInformationMessage: (message: string) => Thenable<string | undefined>;
	withProgress: typeof vscode.window.withProgress;
	spawn: (
		command: string,
		args: string[],
		options: {
			cwd?: string;
			shell: boolean;
			env: NodeJS.ProcessEnv;
		},
	) => ChildProcessLike;
}

const defaultDependencies: CliManagerDependencies = {
	outputChannelFactory: (name) => vscode.window.createOutputChannel(name),
	showErrorMessage: (message) => vscode.window.showErrorMessage(message),
	showInformationMessage: (message) => vscode.window.showInformationMessage(message),
	withProgress: vscode.window.withProgress.bind(vscode.window),
	spawn: (command, args, options) => spawn(command, args, options) as ChildProcessLike,
};

export class CliManager {
	public readonly output: vscode.OutputChannel;

	public constructor(
		private readonly configuration: vscode.WorkspaceConfiguration,
		private readonly dependencies: CliManagerDependencies = defaultDependencies,
	) {
		this.output = this.dependencies.outputChannelFactory('NestForge Logs');
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
		const args = buildCliArgs(request.args, request.flags);
		const task = () => this.spawnProcess(executable, args, options.cwd, options.revealOutputOnError ?? true);
		const result = options.progressTitle
			? await this.dependencies.withProgress(
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
				await this.dependencies.showErrorMessage(`NestForge command failed: ${result.commandLine}`);
			}
			throw new Error(result.stderr || `Command exited with code ${result.exitCode}.`);
		}

		if (options.showSuccessMessage) {
			await this.dependencies.showInformationMessage(options.showSuccessMessage);
		}

		return result;
	}

	private spawnProcess(
		executable: string,
		args: string[],
		cwd: string | undefined,
		revealOutputOnError: boolean,
	): Promise<CliResult> {
		return new Promise((resolve, reject) => {
			const processHandle = this.dependencies.spawn(executable, args, {
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
