import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { fileExists } from './nestforge-core';

export type ModuleGraphNodeKind = 'entrypoint' | 'module' | 'controller' | 'service' | 'config' | 'other';
export type ModuleGraphEdgeKind = 'contains' | 'uses';

export interface ModuleGraphNode {
	id: string;
	label: string;
	kind: ModuleGraphNodeKind;
	filePath: string;
	inCycle: boolean;
}

export interface ModuleGraphEdge {
	from: string;
	to: string;
	kind: ModuleGraphEdgeKind;
	inCycle: boolean;
}

export interface ModuleGraphData {
	nodes: ModuleGraphNode[];
	edges: ModuleGraphEdge[];
}

interface ScannedFile {
	id: string;
	label: string;
	kind: ModuleGraphNodeKind;
	filePath: string;
	source: string;
	namespace: string[];
}

export async function scanWorkspaceModuleGraph(workspacePath: string): Promise<ModuleGraphData> {
	const sourceRoot = path.join(workspacePath, 'src');
	if (!await fileExists(sourceRoot)) {
		return { nodes: [], edges: [] };
	}

	const rustFiles = await collectRustFiles(sourceRoot);
	const scannedFiles: ScannedFile[] = [];
	for (const filePath of rustFiles) {
		const source = await fs.readFile(filePath, 'utf8');
		scannedFiles.push(buildScannedFile(sourceRoot, filePath, source));
	}

	const nodeIds = new Set(scannedFiles.map((file) => file.id));
	const edges: ModuleGraphEdge[] = [];
	const edgeKeys = new Set<string>();

	for (const file of scannedFiles) {
		for (const childModuleId of parseModuleChildren(file)) {
			addEdge(edges, edgeKeys, file.id, childModuleId, 'contains');
		}

		for (const dependencyId of parseInternalDependencies(file.source, nodeIds)) {
			if (dependencyId !== file.id) {
				addEdge(edges, edgeKeys, file.id, dependencyId, 'uses');
			}
		}
	}

	const cycleNodeIds = detectCycleNodeIds(scannedFiles.map((file) => file.id), edges);
	const cycleEdgeKeys = new Set(
		edges
			.filter((edge) => cycleNodeIds.has(edge.from) && cycleNodeIds.has(edge.to))
			.map((edge) => `${edge.from}->${edge.to}`),
	);

	return {
		nodes: scannedFiles.map((file) => ({
			id: file.id,
			label: file.label,
			kind: file.kind,
			filePath: file.filePath,
			inCycle: cycleNodeIds.has(file.id),
		})),
		edges: edges.map((edge) => ({
			...edge,
			inCycle: cycleEdgeKeys.has(`${edge.from}->${edge.to}`),
		})),
	};
}

export function getModuleGraphWebviewHtml(webview: vscode.Webview, graph: ModuleGraphData): string {
	const nonce = createNonce();
	const graphJson = JSON.stringify(graph).replace(/</g, '\\u003c');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>NestForge Module Graph</title>
	<style>
		:root {
			color-scheme: light dark;
			--bg: #0f1720;
			--panel: #16202b;
			--panel-alt: #1f2d3d;
			--border: rgba(255, 255, 255, 0.12);
			--text: #d9e2ec;
			--muted: #9fb3c8;
			--module: #4fb3ff;
			--controller: #f59e0b;
			--service: #22c55e;
			--config: #a78bfa;
			--other: #94a3b8;
			--entrypoint: #f97316;
			--cycle: #ef4444;
		}
		body {
			margin: 0;
			background: radial-gradient(circle at top, #18324a, var(--bg));
			color: var(--text);
			font-family: Georgia, "Times New Roman", serif;
		}
		.toolbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 14px 18px;
			border-bottom: 1px solid var(--border);
			background: rgba(10, 18, 28, 0.82);
			backdrop-filter: blur(12px);
			position: sticky;
			top: 0;
			z-index: 2;
		}
		.toolbar button {
			border: 1px solid var(--border);
			background: var(--panel);
			color: var(--text);
			padding: 8px 12px;
			border-radius: 999px;
			cursor: pointer;
		}
		.legend {
			display: flex;
			gap: 14px;
			flex-wrap: wrap;
			font-size: 12px;
			color: var(--muted);
		}
		.legend span::before {
			content: '';
			display: inline-block;
			width: 10px;
			height: 10px;
			border-radius: 999px;
			margin-right: 6px;
			vertical-align: middle;
		}
		.legend .module::before { background: var(--module); }
		.legend .controller::before { background: var(--controller); }
		.legend .service::before { background: var(--service); }
		.legend .config::before { background: var(--config); }
		.legend .cycle::before { background: var(--cycle); }
		.graph-shell {
			position: relative;
			min-height: calc(100vh - 66px);
			overflow: auto;
			padding: 24px;
		}
		.graph {
			position: relative;
			min-width: 1080px;
			min-height: 720px;
		}
		svg {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			pointer-events: none;
		}
		.node {
			position: absolute;
			width: 210px;
			padding: 12px 14px;
			border-radius: 16px;
			background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
			border: 1px solid var(--border);
			box-shadow: 0 18px 32px rgba(0, 0, 0, 0.22);
			cursor: pointer;
		}
		.node strong {
			display: block;
			font-size: 14px;
		}
		.node small {
			display: block;
			margin-top: 6px;
			color: var(--muted);
			font-size: 11px;
		}
		.node.module { border-left: 4px solid var(--module); }
		.node.controller { border-left: 4px solid var(--controller); }
		.node.service { border-left: 4px solid var(--service); }
		.node.config { border-left: 4px solid var(--config); }
		.node.entrypoint { border-left: 4px solid var(--entrypoint); }
		.node.other { border-left: 4px solid var(--other); }
		.node.cycle { border-color: var(--cycle); box-shadow: 0 18px 32px rgba(127, 29, 29, 0.45); }
		.empty {
			padding: 48px;
			text-align: center;
			color: var(--muted);
			border: 1px dashed var(--border);
			border-radius: 16px;
		}
	</style>
</head>
<body>
	<div class="toolbar">
		<div>
			<strong>NestForge Module Graph</strong>
			<div class="legend">
				<span class="module">module</span>
				<span class="controller">controller</span>
				<span class="service">service</span>
				<span class="config">config</span>
				<span class="cycle">cycle</span>
			</div>
		</div>
		<button id="refresh" type="button">Refresh Graph</button>
	</div>
	<div class="graph-shell">
		<div id="graph" class="graph"></div>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const graph = ${graphJson};
		const graphElement = document.getElementById('graph');
		const refreshButton = document.getElementById('refresh');

		refreshButton.addEventListener('click', () => {
			vscode.postMessage({ type: 'refresh' });
		});

		const columns = ['entrypoint', 'module', 'controller', 'service', 'config', 'other'];
		const columnX = new Map(columns.map((kind, index) => [kind, 60 + index * 230]));
		const rowHeights = new Map(columns.map((kind) => [kind, 0]));
		const nodeLayout = new Map();
		const width = Math.max(1200, columns.length * 230 + 120);

		for (const node of graph.nodes) {
			const x = columnX.get(node.kind) ?? columnX.get('other');
			const currentRow = rowHeights.get(node.kind) ?? 0;
			const y = 40 + currentRow * 128;
			rowHeights.set(node.kind, currentRow + 1);
			nodeLayout.set(node.id, { x, y, width: 210, height: 78 });
		}

		const maxRows = Math.max(1, ...Array.from(rowHeights.values()));
		const height = Math.max(720, maxRows * 148 + 160);
		graphElement.style.width = width + 'px';
		graphElement.style.height = height + 'px';

		if (!graph.nodes.length) {
			const empty = document.createElement('div');
			empty.className = 'empty';
			empty.textContent = 'No Rust modules were found under src/.';
			graphElement.appendChild(empty);
		} else {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			svg.setAttribute('viewBox', \`0 0 \${width} \${height}\`);

			for (const edge of graph.edges) {
				const from = nodeLayout.get(edge.from);
				const to = nodeLayout.get(edge.to);
				if (!from || !to) {
					continue;
				}

				const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				const startX = from.x + from.width;
				const startY = from.y + from.height / 2;
				const endX = to.x;
				const endY = to.y + to.height / 2;
				const controlOffset = Math.max(60, Math.abs(endX - startX) / 2);
				path.setAttribute('d', \`M \${startX} \${startY} C \${startX + controlOffset} \${startY}, \${endX - controlOffset} \${endY}, \${endX} \${endY}\`);
				path.setAttribute('fill', 'none');
				path.setAttribute('stroke', edge.inCycle ? 'var(--cycle)' : edge.kind === 'contains' ? 'rgba(79,179,255,0.45)' : 'rgba(255,255,255,0.24)');
				path.setAttribute('stroke-width', edge.inCycle ? '3' : edge.kind === 'contains' ? '2.5' : '1.75');
				path.setAttribute('stroke-linecap', 'round');
				if (edge.kind === 'uses') {
					path.setAttribute('stroke-dasharray', '5 6');
				}
				svg.appendChild(path);
			}

			graphElement.appendChild(svg);

			for (const node of graph.nodes) {
				const layout = nodeLayout.get(node.id);
				const el = document.createElement('button');
				el.type = 'button';
				el.className = \`node \${node.kind}\${node.inCycle ? ' cycle' : ''}\`;
				el.style.left = layout.x + 'px';
				el.style.top = layout.y + 'px';
				el.innerHTML = \`<strong>\${escapeHtml(node.label)}</strong><small>\${escapeHtml(node.id)}</small>\`;
				el.addEventListener('click', () => {
					vscode.postMessage({ type: 'openFile', filePath: node.filePath });
				});
				graphElement.appendChild(el);
			}
		}

		function escapeHtml(value) {
			return value
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;');
		}
	</script>
</body>
</html>`;
}

function buildScannedFile(sourceRoot: string, filePath: string, source: string): ScannedFile {
	const relativePath = path.relative(sourceRoot, filePath).replace(/\\/g, '/');
	const namespace = getNamespaceFromRelativePath(relativePath);
	return {
		id: namespace.join('::') || path.basename(relativePath, '.rs'),
		label: buildNodeLabel(relativePath),
		kind: getNodeKind(relativePath),
		filePath,
		source,
		namespace,
	};
}

function parseModuleChildren(file: ScannedFile): string[] {
	const childIds: string[] = [];
	const modulePattern = /^\s*(?:pub\s+)?mod\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;/gm;
	for (const match of file.source.matchAll(modulePattern)) {
		const childName = match[1];
		const childNamespace = file.namespace.length && path.basename(file.filePath) !== 'main.rs' && path.basename(file.filePath) !== 'lib.rs'
			? [...file.namespace, childName]
			: [childName];
		childIds.push(childNamespace.join('::'));
	}
	return childIds;
}

function parseInternalDependencies(source: string, nodeIds: Set<string>): string[] {
	const dependencies = new Set<string>();
	const usePattern = /use\s+crate::([^;]+);/g;

	for (const match of source.matchAll(usePattern)) {
		const content = match[1].replace(/[{}\s]/g, '');
		for (const token of content.split(',')) {
			if (!token) {
				continue;
			}

			const segments = token.split('::').filter(Boolean);
			for (let length = segments.length; length > 0; length -= 1) {
				const candidate = segments.slice(0, length).join('::');
				if (nodeIds.has(candidate)) {
					dependencies.add(candidate);
					break;
				}
			}
		}
	}

	return [...dependencies];
}

function detectCycleNodeIds(nodeIds: string[], edges: ModuleGraphEdge[]): Set<string> {
	const adjacency = new Map<string, string[]>();
	for (const nodeId of nodeIds) {
		adjacency.set(nodeId, []);
	}
	for (const edge of edges) {
		adjacency.get(edge.from)?.push(edge.to);
	}

	const visiting = new Set<string>();
	const visited = new Set<string>();
	const cycleNodes = new Set<string>();
	const stack: string[] = [];

	const visit = (nodeId: string) => {
		if (visited.has(nodeId)) {
			return;
		}

		visiting.add(nodeId);
		stack.push(nodeId);

		for (const next of adjacency.get(nodeId) ?? []) {
			if (!visited.has(next) && !visiting.has(next)) {
				visit(next);
				continue;
			}

			if (visiting.has(next)) {
				const cycleStart = stack.indexOf(next);
				for (const cycleNode of stack.slice(cycleStart)) {
					cycleNodes.add(cycleNode);
				}
				cycleNodes.add(next);
			}
		}

		stack.pop();
		visiting.delete(nodeId);
		visited.add(nodeId);
	};

	for (const nodeId of nodeIds) {
		if (!visited.has(nodeId)) {
			visit(nodeId);
		}
	}

	return cycleNodes;
}

async function collectRustFiles(root: string): Promise<string[]> {
	const files: string[] = [];

	const visit = async (currentPath: string) => {
		const entries = await fs.readdir(currentPath, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith('.')) {
				continue;
			}

			const entryPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				await visit(entryPath);
				continue;
			}

			if (entry.name.endsWith('.rs')) {
				files.push(entryPath);
			}
		}
	};

	await visit(root);
	return files.sort((left, right) => left.localeCompare(right));
}

function getNamespaceFromRelativePath(relativePath: string): string[] {
	const segments = relativePath.replace(/\.rs$/i, '').split('/');
	if (segments[segments.length - 1] === 'mod') {
		segments.pop();
	}
	return segments.filter(Boolean);
}

function getNodeKind(relativePath: string): ModuleGraphNodeKind {
	if (relativePath === 'main.rs' || relativePath === 'lib.rs') {
		return 'entrypoint';
	}
	if (relativePath.endsWith('/mod.rs') || relativePath === 'mod.rs') {
		return 'module';
	}
	if (relativePath.endsWith('_controller.rs')) {
		return 'controller';
	}
	if (relativePath.endsWith('_service.rs')) {
		return 'service';
	}
	if (relativePath.includes('/config/') || relativePath.endsWith('_config.rs')) {
		return 'config';
	}
	return 'other';
}

function buildNodeLabel(relativePath: string): string {
	if (relativePath === 'main.rs') {
		return 'Main';
	}
	if (relativePath === 'lib.rs') {
		return 'Library';
	}

	const base = path.basename(relativePath, '.rs');
	if (base === 'mod') {
		return `${toPascalCase(path.basename(path.dirname(relativePath)))}Module`;
	}

	return toPascalCase(base);
}

function toPascalCase(value: string): string {
	return value
		.split(/[_-]/)
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join('');
}

function addEdge(edges: ModuleGraphEdge[], edgeKeys: Set<string>, from: string, to: string, kind: ModuleGraphEdgeKind): void {
	const key = `${from}->${to}:${kind}`;
	if (edgeKeys.has(key)) {
		return;
	}

	edgeKeys.add(key);
	edges.push({ from, to, kind, inCycle: false });
}

function createNonce(): string {
	return Math.random().toString(36).slice(2);
}
