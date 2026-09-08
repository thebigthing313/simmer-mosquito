/**
 * The environment-reading rules the whole workspace shares.
 *
 * Nothing here reads an environment: a caller passes the source object its host
 * gives it and this package holds the rules for making sense of what comes back.
 * That split is deliberate. The readers used to be typed `NodeJS.ProcessEnv`,
 * which no browser app can produce, so the package was Node-only by its
 * signature rather than by its subject and the rules below were written out
 * again in four other files. {@link EnvSource} is the structural type
 * `process.env` satisfies, and the value-level rules take a value rather than a
 * source so a Vite app can keep reading `import.meta.env.VITE_*` at the call
 * site, which is what lets the bundler substitute it at build time.
 */

/**
 * Where a reader looks a key up.
 *
 * Structural rather than `NodeJS.ProcessEnv` so that this package needs no
 * `@types/node` and no host: `process.env` satisfies it, and so does a plain
 * object literal, which is what makes the suite beside this file a table of
 * records with nothing stubbed.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export type NodeEnvironment = 'development' | 'production' | 'test';

export interface AppEnv {
	readonly host: string;
	readonly nodeEnv: NodeEnvironment;
	readonly port: number;
}

/**
 * A configured value that is present but empty, read as absent.
 *
 * `??` does not fall back on an empty string, and an environment value arrives
 * empty rather than missing more often than it looks: a Railway field left
 * blank, a `.env` line with nothing after the `=`, an EAS secret with no value,
 * or a Docker `ARG` that the image declares and the build does not pass. That
 * last one shipped. The optional `VITE_SHAPE_SERVER_URL` became `''` instead of
 * falling through to the API origin, so shape streams resolved against the
 * static site and never reached the server that injects their auth.
 *
 * The value comes back trimmed, so a key typed into a deploy field with a stray
 * space is the key rather than a near miss of it.
 */
export function configured(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

/**
 * A URL with its trailing slashes taken off, so it can be concatenated with a
 * path.
 *
 * Every origin here is read from a deploy field, and `https://host/` and
 * `https://host` are the same origin to a person typing one. Joined to a path
 * without this, the first produces `https://host//map/tiles`, which some proxies
 * route and some do not.
 */
export function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

export function readEnv(source: EnvSource): AppEnv {
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
	const configuredPort = configured(value);

	if (configuredPort === undefined) {
		return 3000;
	}

	const parsed = Number.parseInt(configuredPort, 10);

	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
		throw new Error(`PORT must be an integer between 1 and 65535. Received: ${value}`);
	}

	return parsed;
}

export function readRequiredString(source: EnvSource, key: string): string {
	const value = configured(source[key]);

	if (value === undefined) {
		throw new Error(`${key} must be set.`);
	}

	return value;
}

export function readOptionalString(source: EnvSource, key: string): string | undefined {
	return configured(source[key]);
}

export function readRequiredUrl(source: EnvSource, key: string): string {
	return parseUrl(key, readRequiredString(source, key));
}

/**
 * The same read as {@link readRequiredUrl} where the variable is optional.
 *
 * `null` rather than `undefined` because every caller of this stores the answer
 * on a config object, where a present-and-absent field reads better than a
 * missing one. An unparseable value still throws: unset is a choice, and a
 * misspelled URL is not.
 */
export function readOptionalUrl(source: EnvSource, key: string): string | null {
	const value = readOptionalString(source, key);

	return value === undefined ? null : parseUrl(key, value);
}

function parseUrl(key: string, value: string): string {
	try {
		return new URL(value).toString();
	} catch {
		throw new Error(`${key} must be a valid URL. Received: ${value}`);
	}
}

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * One origin, from a value a person typed into a deploy field.
 *
 * A bare hostname is the natural thing to put in a field called "origin", and an
 * origin is read at module load, so throwing means the process never reaches
 * `listen`: a missing `https://` on an optional CORS origin crash-loops the
 * whole API. A schemeless value is therefore normalized to `https://<host>`
 * rather than taken as fatal. A deployed origin is unambiguously https, and the
 * localhost origins in `.env.example` carry their scheme already.
 *
 * `localhost:3000` is deliberately in the schemeless bucket: `new URL` reads it
 * as the `localhost:` scheme and yields the origin `"null"`, which matches no
 * browser `Origin` header. Genuinely unparseable input still throws.
 */
export function parseOrigin(key: string, value: string): string {
	const trimmed = value.trim();
	const candidate = SCHEME_PREFIX.test(trimmed) ? trimmed : `https://${trimmed}`;

	let origin: string;
	try {
		origin = new URL(candidate).origin;
	} catch {
		throw new Error(`${key} must be a valid URL. Received: ${value}`);
	}

	// Opaque origins (`file:`, and every non-special scheme) stringify to "null".
	if (origin === 'null') {
		throw new Error(`${key} must be an http(s) URL. Received: ${value}`);
	}

	return origin;
}
