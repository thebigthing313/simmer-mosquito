import {
	readEnv,
	readOptionalString,
	readRequiredString,
	readRequiredUrl,
} from '@simmer-mosquito/config';

export interface ServerEnv {
	readonly appOrigin: string;
	readonly appOrigins: readonly string[];
	readonly databaseUrl: string;
	readonly electricUrl: string | null;
	readonly host: string;
	readonly nodeEnv: 'development' | 'production' | 'test';
	readonly port: number;
	readonly simmerOperatorEmails: readonly string[];
	readonly workosApiKey: string;
	readonly workosClientId: string;
	readonly workosCookiePassword: string;
	readonly workosRedirectUri: string;
}

export function readServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
	const base = readEnv(source);
	const appOrigin = readRequiredOrigin(source, 'APP_ORIGIN');
	const adminAppOrigin = readOptionalOrigin(source, 'ADMIN_APP_ORIGIN');

	return {
		appOrigin,
		appOrigins: adminAppOrigin === null ? [appOrigin] : [appOrigin, adminAppOrigin],
		databaseUrl: readRequiredString(source, 'DATABASE_URL'),
		electricUrl: readOptionalUrl(source, 'ELECTRIC_URL'),
		host: base.host,
		nodeEnv: base.nodeEnv,
		port: base.port,
		simmerOperatorEmails: parseEmailAllowlist(readOptionalString(source, 'SIMMER_OPERATOR_EMAILS')),
		workosApiKey: readRequiredString(source, 'WORKOS_API_KEY'),
		workosClientId: readRequiredString(source, 'WORKOS_CLIENT_ID'),
		workosCookiePassword: readRequiredString(source, 'WORKOS_COOKIE_PASSWORD'),
		workosRedirectUri: readRequiredUrl(source, 'WORKOS_REDIRECT_URI'),
	};
}

function readOptionalOrigin(source: NodeJS.ProcessEnv, key: string): string | null {
	const value = readOptionalString(source, key);
	if (value === undefined) {
		return null;
	}

	return parseOrigin(key, value);
}

function readOptionalUrl(source: NodeJS.ProcessEnv, key: string): string | null {
	const value = readOptionalString(source, key);
	if (value === undefined) {
		return null;
	}

	try {
		return new URL(value).toString();
	} catch {
		throw new Error(`${key} must be a valid URL. Received: ${value}`);
	}
}

function parseEmailAllowlist(value: string | undefined): readonly string[] {
	if (value === undefined) {
		return [];
	}

	return value
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter((email) => email.length > 0);
}

function readRequiredOrigin(source: NodeJS.ProcessEnv, key: string): string {
	const value = readRequiredString(source, key);

	return parseOrigin(key, value);
}

function parseOrigin(key: string, value: string): string {
	try {
		return new URL(value).origin;
	} catch {
		throw new Error(`${key} must be a valid URL. Received: ${value}`);
	}
}
