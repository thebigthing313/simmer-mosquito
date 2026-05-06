export type NodeEnvironment = 'development' | 'production' | 'test';

export interface AppEnv {
	readonly host: string;
	readonly nodeEnv: NodeEnvironment;
	readonly port: number;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
	return {
		host: source.HOST ?? '0.0.0.0',
		nodeEnv: readNodeEnv(source.NODE_ENV),
		port: readPort(source.PORT),
	};
}

function readNodeEnv(value: string | undefined): NodeEnvironment {
	if (value === 'production' || value === 'test') {
		return value;
	}

	return 'development';
}

function readPort(value: string | undefined): number {
	if (value === undefined || value.trim() === '') {
		return 3000;
	}

	const parsed = Number.parseInt(value, 10);

	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
		throw new Error(`PORT must be an integer between 1 and 65535. Received: ${value}`);
	}

	return parsed;
}

export function readRequiredString(source: NodeJS.ProcessEnv, key: string): string {
	const value = source[key];

	if (value === undefined || value.trim() === '') {
		throw new Error(`${key} must be set.`);
	}

	return value;
}

export function readOptionalString(source: NodeJS.ProcessEnv, key: string): string | undefined {
	const value = source[key];
	return value === undefined || value.trim() === '' ? undefined : value;
}

export function readRequiredUrl(source: NodeJS.ProcessEnv, key: string): string {
	const value = readRequiredString(source, key);

	try {
		return new URL(value).toString();
	} catch {
		throw new Error(`${key} must be a valid URL. Received: ${value}`);
	}
}
