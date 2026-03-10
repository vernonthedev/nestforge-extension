import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MIDNIGHT_NOTIFY_DEPENDENCY = 'midnight-notify-client = "*"';

export interface MidnightNotifySetupResult {
	cargoTomlUpdated: boolean;
	serviceFilePath?: string;
	warnings: string[];
}

export function injectCargoDependency(cargoToml: string, dependencyLine = MIDNIGHT_NOTIFY_DEPENDENCY): string {
	if (cargoToml.includes('midnight-notify-client')) {
		return cargoToml;
	}

	const dependenciesSection = /^\[dependencies\]\s*$/m;
	if (dependenciesSection.test(cargoToml)) {
		return cargoToml.replace(dependenciesSection, `[dependencies]\n${dependencyLine}`);
	}

	const trimmed = cargoToml.trimEnd();
	return `${trimmed}\n\n[dependencies]\n${dependencyLine}\n`;
}

export async function setupMidnightNotify(projectRoot: string): Promise<MidnightNotifySetupResult> {
	const warnings: string[] = [];
	const cargoTomlPath = path.join(projectRoot, 'Cargo.toml');
	let cargoTomlUpdated = false;

	try {
		const cargoToml = await fs.readFile(cargoTomlPath, 'utf8');
		const updatedCargoToml = injectCargoDependency(cargoToml);
		if (updatedCargoToml !== cargoToml) {
			await fs.writeFile(cargoTomlPath, updatedCargoToml, 'utf8');
			cargoTomlUpdated = true;
		}
	} catch {
		warnings.push('Midnight Notify setup skipped crate injection because Cargo.toml was not found in the generated project.');
	}

	const sourceRoot = path.join(projectRoot, 'src');
	try {
		await fs.mkdir(sourceRoot, { recursive: true });
	} catch {
		warnings.push('Midnight Notify setup could not create the src directory for the starter notification service.');
		return { cargoTomlUpdated, warnings };
	}

	const rustServicePath = path.join(sourceRoot, 'notification.service.rs');
	const tsServicePath = path.join(sourceRoot, 'notification.service.ts');

	const serviceFilePath = cargoTomlUpdated || await fileExists(cargoTomlPath)
		? rustServicePath
		: tsServicePath;

	await fs.writeFile(serviceFilePath, buildMidnightNotifyServiceTemplate(path.extname(serviceFilePath)), 'utf8');
	return { cargoTomlUpdated, serviceFilePath, warnings };
}

export function buildMidnightNotifyServiceTemplate(extension: '.rs' | '.ts' | string): string {
	if (extension === '.rs') {
		return `use std::env;

pub struct MidnightNotifyConfig {
    pub api_key: String,
    pub tenant_id: String,
    pub base_url: String,
}

impl MidnightNotifyConfig {
    pub fn from_env() -> Self {
        Self {
            api_key: env::var("MIDNIGHT_NOTIFY_API_KEY")
                .expect("MIDNIGHT_NOTIFY_API_KEY must be set"),
            tenant_id: env::var("MIDNIGHT_NOTIFY_TENANT_ID")
                .expect("MIDNIGHT_NOTIFY_TENANT_ID must be set"),
            base_url: env::var("MIDNIGHT_NOTIFY_BASE_URL")
                .unwrap_or_else(|_| "https://api.midnight-notify.dev".to_string()),
        }
    }
}

pub fn build_notification_client() -> midnight_notify_client::Client {
    let config = MidnightNotifyConfig::from_env();

    midnight_notify_client::Client::builder()
        .api_key(config.api_key)
        .tenant_id(config.tenant_id)
        .base_url(config.base_url)
        .build()
}
`;
	}

	return `export interface MidnightNotifyConfig {
  apiKey: string;
  tenantId: string;
  baseUrl: string;
}

export const midnightNotifyConfig: MidnightNotifyConfig = {
  apiKey: process.env.MIDNIGHT_NOTIFY_API_KEY ?? '',
  tenantId: process.env.MIDNIGHT_NOTIFY_TENANT_ID ?? '',
  baseUrl: process.env.MIDNIGHT_NOTIFY_BASE_URL ?? 'https://api.midnight-notify.dev',
};

export function createMidnightNotifyHeaders(): Record<string, string> {
  return {
    authorization: \`Bearer \${midnightNotifyConfig.apiKey}\`,
    'x-tenant-id': midnightNotifyConfig.tenantId,
  };
}
`;
}

async function fileExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
