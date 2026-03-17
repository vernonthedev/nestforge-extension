import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const MIDNIGHT_NOTIFY_DEPENDENCY = 'midnight-notify-client = "*"';
const NOTIFICATIONS_DIRECTORY = 'notifications';

export interface MidnightNotifySetupResult {
	cargoTomlUpdated: boolean;
	writtenFiles: string[];
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

export function injectNotificationsModuleIntoRustEntrypoint(entrypointSource: string): string {
	if (entrypointSource.includes('pub mod notifications;')) {
		return entrypointSource;
	}

	return `pub mod notifications;\n${entrypointSource}`;
}

export async function setupMidnightNotify(projectRoot: string): Promise<MidnightNotifySetupResult> {
	const warnings: string[] = [];
	const writtenFiles: string[] = [];
	const cargoTomlPath = path.join(projectRoot, 'Cargo.toml');
	const sourceRoot = path.join(projectRoot, 'src');
	const notificationsRoot = path.join(sourceRoot, NOTIFICATIONS_DIRECTORY);
	const controllersRoot = path.join(notificationsRoot, 'controllers');
	const servicesRoot = path.join(notificationsRoot, 'services');
	const configRoot = path.join(notificationsRoot, 'config');
	const mainEntrypointPath = path.join(sourceRoot, 'main.rs');
	const libEntrypointPath = path.join(sourceRoot, 'lib.rs');
	let cargoTomlUpdated = false;

	if (!await fileExists(cargoTomlPath)) {
		warnings.push('Midnight Notify setup requires Cargo.toml. The generated project does not look like a Rust workspace.');
		return { cargoTomlUpdated, writtenFiles, warnings };
	}

	const cargoToml = await fs.readFile(cargoTomlPath, 'utf8');
	const updatedCargoToml = injectCargoDependency(cargoToml);
	if (updatedCargoToml !== cargoToml) {
		await fs.writeFile(cargoTomlPath, updatedCargoToml, 'utf8');
		cargoTomlUpdated = true;
		writtenFiles.push(cargoTomlPath);
	}

	await fs.mkdir(controllersRoot, { recursive: true });
	await fs.mkdir(servicesRoot, { recursive: true });
	await fs.mkdir(configRoot, { recursive: true });

	const filesToWrite: Array<[string, string]> = [
		[path.join(notificationsRoot, 'mod.rs'), buildNotificationsModuleTemplate()],
		[path.join(controllersRoot, 'mod.rs'), buildControllersModuleTemplate()],
		[path.join(controllersRoot, 'notification_controller.rs'), buildNotificationControllerTemplate()],
		[path.join(servicesRoot, 'mod.rs'), buildServicesModuleTemplate()],
		[path.join(servicesRoot, 'notification_service.rs'), buildNotificationServiceTemplate()],
		[path.join(configRoot, 'mod.rs'), buildConfigModuleTemplate()],
		[path.join(configRoot, 'notification_config.rs'), buildNotificationConfigTemplate()],
	];

	for (const [targetPath, contents] of filesToWrite) {
		await fs.writeFile(targetPath, contents, 'utf8');
		writtenFiles.push(targetPath);
	}

	const entrypointPath = await resolveRustEntrypoint(mainEntrypointPath, libEntrypointPath);
	if (!entrypointPath) {
		warnings.push('Midnight Notify setup created the notifications module, but no src/main.rs or src/lib.rs was found for automatic module registration.');
		return { cargoTomlUpdated, writtenFiles, warnings };
	}

	const entrypointSource = await fs.readFile(entrypointPath, 'utf8');
	const updatedEntrypoint = injectNotificationsModuleIntoRustEntrypoint(entrypointSource);
	if (updatedEntrypoint !== entrypointSource) {
		await fs.writeFile(entrypointPath, updatedEntrypoint, 'utf8');
		writtenFiles.push(entrypointPath);
	}

	return { cargoTomlUpdated, writtenFiles, warnings };
}

function buildNotificationsModuleTemplate(): string {
	return `pub mod config;
pub mod controllers;
pub mod services;
`;
}

function buildControllersModuleTemplate(): string {
	return `pub mod notification_controller;
`;
}

function buildServicesModuleTemplate(): string {
	return `pub mod notification_service;
`;
}

function buildConfigModuleTemplate(): string {
	return `pub mod notification_config;
`;
}

function buildNotificationConfigTemplate(): string {
	return `use nestforge::{injectable, ConfigModule, ConfigOptions};

#[injectable(factory = load_midnight_notify_config)]
pub struct MidnightNotifyConfig {
    pub api_key: String,
    pub tenant_id: String,
    pub base_url: String,
}

fn load_midnight_notify_config() -> anyhow::Result<MidnightNotifyConfig> {
    Ok(ConfigModule::for_root::<MidnightNotifyConfig>(
        ConfigOptions::new()
            .env_file(".env")
            .schema(|s| {
                s.add_field("MIDNIGHT_NOTIFY_API_KEY", true);
                s.add_field("MIDNIGHT_NOTIFY_TENANT_ID", true);
                s.add_field("MIDNIGHT_NOTIFY_BASE_URL", false);
            }),
    )?)
}
`;
}

function buildNotificationServiceTemplate(): string {
	return `use nestforge::injectable;
use midnight_notify_client::Client;

use crate::notifications::config::notification_config::MidnightNotifyConfig;

#[injectable]
pub struct NotificationService {
    client: Client,
    config: MidnightNotifyConfig,
}

impl NotificationService {
    pub async fn send(
        &self,
        user_id: &str,
        template: &str,
        channel: &str,
    ) -> Result<(), midnight_notify_client::Error> {
        self.client
            .send()
            .user_id(user_id)
            .template(template)
            .channel(channel)
            .dispatch()
            .await
    }
}
`;
}

function buildNotificationControllerTemplate(): string {
	return `use nestforge::{controller, post, routes, HttpException, Inject, Body, dto};

use crate::notifications::services::notification_service::NotificationService;

pub struct NotificationController;

#[controller("/notifications")]
#[routes]
impl NotificationController {
    #[post("/send")]
    pub async fn send(
        &self,
        body: Body<SendNotificationRequest>,
        service: Inject<NotificationService>,
    ) -> Result<SendNotificationResponse, HttpException> {
        service.send(&body.user_id, &body.template, &body.channel).await?;
        Ok(SendNotificationResponse { success: true })
    }
}

#[dto]
pub struct SendNotificationRequest {
    pub user_id: String,
    pub template: String,
    pub channel: String,
}

#[response_dto]
pub struct SendNotificationResponse {
    pub success: bool,
}
`;
}

async function resolveRustEntrypoint(mainPath: string, libPath: string): Promise<string | undefined> {
	if (await fileExists(mainPath)) {
		return mainPath;
	}

	if (await fileExists(libPath)) {
		return libPath;
	}

	return undefined;
}

async function fileExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
