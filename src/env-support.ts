import * as path from 'node:path';
import * as vscode from 'vscode';
import { isNestForgeWorkspace, parseEnvText, resolveEnvSchema, type EnvVariableDefinition } from './env-schema';

interface ParsedEnvEntryWithRange {
	key: string;
	value: string;
	line: number;
	range: vscode.Range;
}

export function createEnvDiagnosticCollection(): vscode.DiagnosticCollection {
	return vscode.languages.createDiagnosticCollection('nestforge-env');
}

export async function updateEnvDiagnostics(
	collection: vscode.DiagnosticCollection,
	document: vscode.TextDocument,
): Promise<void> {
	if (!isEnvDocument(document)) {
		return;
	}

	const workspacePath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
	if (!workspacePath || !await isNestForgeWorkspace(workspacePath)) {
		collection.delete(document.uri);
		return;
	}

	const schema = await resolveEnvSchema(workspacePath);
	const parsed = parseEnvDocument(document);
	const diagnostics: vscode.Diagnostic[] = [];

	for (const variable of schema.requiredVariables) {
		const entry = parsed.get(variable.name);
		if (!entry) {
			const line = Math.max(document.lineCount - 1, 0);
			const position = new vscode.Position(line, 0);
			const diagnostic = new vscode.Diagnostic(
				new vscode.Range(position, position),
				`Missing required NestForge environment variable: ${variable.name}`,
				vscode.DiagnosticSeverity.Warning,
			);
			diagnostic.code = `nestforge.env.missing.${variable.name}`;
			diagnostic.source = 'NestForge';
			diagnostic.relatedInformation = [
				new vscode.DiagnosticRelatedInformation(
					new vscode.Location(document.uri, new vscode.Range(position, position)),
					buildVariableHint(variable, schema.transports),
				),
			];
			diagnostics.push(diagnostic);
			continue;
		}

		const validationMessage = variable.validate?.(entry.value);
		if (validationMessage) {
			const diagnostic = new vscode.Diagnostic(entry.range, validationMessage, vscode.DiagnosticSeverity.Error);
			diagnostic.code = `nestforge.env.invalid.${variable.name}`;
			diagnostic.source = 'NestForge';
			diagnostics.push(diagnostic);
		}
	}

	collection.set(document.uri, diagnostics);
}

export async function provideEnvHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
	if (!isEnvDocument(document)) {
		return undefined;
	}

	const workspacePath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
	if (!workspacePath || !await isNestForgeWorkspace(workspacePath)) {
		return undefined;
	}

	const schema = await resolveEnvSchema(workspacePath);
	const parsed = parseEnvDocument(document);
	for (const variable of schema.requiredVariables) {
		const entry = parsed.get(variable.name);
		if (!entry || !entry.range.contains(position)) {
			continue;
		}

		const markdown = new vscode.MarkdownString();
		markdown.appendMarkdown(`**${variable.name}**\n\n`);
		markdown.appendMarkdown(`${variable.description}\n\n`);
		markdown.appendMarkdown(`Default: \`${variable.defaultValue}\`\n\n`);
		markdown.appendMarkdown(`Detected transports: ${schema.transports.map((transport) => `\`${transport}\``).join(', ')}`);
		return new vscode.Hover(markdown, entry.range);
	}

	return undefined;
}

export class EnvCodeActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

	public async provideCodeActions(
		document: vscode.TextDocument,
		_range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
	): Promise<vscode.CodeAction[]> {
		if (!isEnvDocument(document)) {
			return [];
		}

		const workspacePath = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
		if (!workspacePath || !await isNestForgeWorkspace(workspacePath)) {
			return [];
		}

		const schema = await resolveEnvSchema(workspacePath);
		const actions: vscode.CodeAction[] = [];
		for (const diagnostic of context.diagnostics) {
			const code = typeof diagnostic.code === 'string' ? diagnostic.code : '';
			if (!code.startsWith('nestforge.env.missing.')) {
				continue;
			}

			const variableName = code.replace('nestforge.env.missing.', '');
			const variable = schema.requiredVariables.find((candidate) => candidate.name === variableName);
			if (!variable) {
				continue;
			}

			const action = new vscode.CodeAction(`Add ${variable.name} to .env`, vscode.CodeActionKind.QuickFix);
			action.edit = buildMissingVariableEdit(document, variable);
			action.diagnostics = [diagnostic];
			actions.push(action);
		}

		return actions;
	}
}

export function parseEnvDocument(document: vscode.TextDocument): Map<string, ParsedEnvEntryWithRange> {
	const parsed = parseEnvText(document.getText());
	const entries = new Map<string, ParsedEnvEntryWithRange>();
	for (const [key, entry] of parsed.entries()) {
		const lineText = document.lineAt(entry.line).text;
		entries.set(key, {
			...entry,
			range: new vscode.Range(entry.line, 0, entry.line, lineText.length),
		});
	}
	return entries;
}

function isEnvDocument(document: vscode.TextDocument): boolean {
	return path.basename(document.uri.fsPath).startsWith('.env');
}

function buildMissingVariableEdit(document: vscode.TextDocument, variable: EnvVariableDefinition): vscode.WorkspaceEdit {
	const edit = new vscode.WorkspaceEdit();
	const lastLine = Math.max(document.lineCount - 1, 0);
	const lastLineText = document.lineAt(lastLine).text;
	const prefix = document.lineCount === 1 && !lastLineText ? '' : (lastLineText.endsWith('\n') || !lastLineText ? '' : '\n');
	const insertPosition = new vscode.Position(lastLine, lastLineText.length);
	edit.insert(document.uri, insertPosition, `${prefix}${variable.name}=${variable.defaultValue}\n`);
	return edit;
}

function buildVariableHint(variable: EnvVariableDefinition, transports: string[]): string {
	return `${variable.description} Detected transports: ${transports.join(', ') || 'http'}.`;
}
