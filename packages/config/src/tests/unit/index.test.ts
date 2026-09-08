import { describe, expect, it } from 'vitest';
import {
	configured,
	type EnvSource,
	parseOrigin,
	readEnv,
	readOptionalString,
	readOptionalUrl,
	readRequiredString,
	readRequiredUrl,
	trimTrailingSlash,
} from '../../index.js';

/**
 * Every case here passes a plain object literal.
 *
 * That is the point of {@link EnvSource} being structural: nothing stubs an
 * environment, nothing needs Vite in the loop, and the four apps that share
 * these rules are exercised by the same table the server is.
 */
const source: EnvSource = {
	BLANK: '',
	PRESENT: 'value',
	SPACED: '  value  ',
	WHITESPACE: '   ',
};

describe('configured', () => {
	it('reads a present value, trimmed', () => {
		expect(configured('value')).toBe('value');
		expect(configured('  value  ')).toBe('value');
	});

	it('reads absent, empty and whitespace-only alike as absent', () => {
		// The empty case is the one that shipped: an optional URL that arrived as
		// `''` did not fall through its `??`, so it was used as an origin.
		expect(configured(undefined)).toBeUndefined();
		expect(configured('')).toBeUndefined();
		expect(configured('   ')).toBeUndefined();
		expect(configured('\t\n')).toBeUndefined();
	});
});

describe('trimTrailingSlash', () => {
	it('takes off one slash, several slashes, or none', () => {
		expect(trimTrailingSlash('https://host')).toBe('https://host');
		expect(trimTrailingSlash('https://host/')).toBe('https://host');
		expect(trimTrailingSlash('https://host///')).toBe('https://host');
		expect(trimTrailingSlash('https://host/base/')).toBe('https://host/base');
	});

	it('leaves a slash that is not at the end alone', () => {
		expect(trimTrailingSlash('https://host/base/path')).toBe('https://host/base/path');
	});
});

describe('readRequiredString', () => {
	it('returns the trimmed value', () => {
		expect(readRequiredString(source, 'PRESENT')).toBe('value');
		expect(readRequiredString(source, 'SPACED')).toBe('value');
	});

	it('refuses absent, empty and whitespace-only by name', () => {
		expect(() => readRequiredString(source, 'MISSING')).toThrow('MISSING must be set.');
		expect(() => readRequiredString(source, 'BLANK')).toThrow('BLANK must be set.');
		expect(() => readRequiredString(source, 'WHITESPACE')).toThrow('WHITESPACE must be set.');
	});
});

describe('readOptionalString', () => {
	it('is `configured` over one key', () => {
		expect(readOptionalString(source, 'PRESENT')).toBe('value');
		expect(readOptionalString(source, 'SPACED')).toBe('value');
		expect(readOptionalString(source, 'MISSING')).toBeUndefined();
		expect(readOptionalString(source, 'BLANK')).toBeUndefined();
		expect(readOptionalString(source, 'WHITESPACE')).toBeUndefined();
	});
});

describe('readRequiredUrl', () => {
	it('returns the URL as the URL parser writes it', () => {
		expect(readRequiredUrl({ URL_KEY: 'http://localhost:3000/auth' }, 'URL_KEY')).toBe(
			'http://localhost:3000/auth',
		);
	});

	it('names the key and the value it could not read', () => {
		expect(() => readRequiredUrl({ URL_KEY: 'not a url' }, 'URL_KEY')).toThrow(
			'URL_KEY must be a valid URL. Received: not a url',
		);
	});
});

describe('readOptionalUrl', () => {
	it('is null when unset, empty or whitespace-only', () => {
		expect(readOptionalUrl(source, 'MISSING')).toBeNull();
		expect(readOptionalUrl(source, 'BLANK')).toBeNull();
		expect(readOptionalUrl(source, 'WHITESPACE')).toBeNull();
	});

	it('throws on a value that is set and unreadable', () => {
		// Unset is a choice; a misspelled URL is not.
		expect(() => readOptionalUrl({ URL_KEY: 'not a url' }, 'URL_KEY')).toThrow(
			'URL_KEY must be a valid URL. Received: not a url',
		);
	});
});

describe('readEnv', () => {
	it('defaults the host, the environment and the port', () => {
		expect(readEnv({})).toEqual({ host: '0.0.0.0', nodeEnv: 'development', port: 3000 });
	});

	it('reads only the two environment names that are not development', () => {
		expect(readEnv({ NODE_ENV: 'production' }).nodeEnv).toBe('production');
		expect(readEnv({ NODE_ENV: 'test' }).nodeEnv).toBe('test');
		expect(readEnv({ NODE_ENV: 'staging' }).nodeEnv).toBe('development');
	});

	it('holds PORT to the 16-bit range', () => {
		expect(readEnv({ PORT: '3001' }).port).toBe(3001);
		expect(readEnv({ PORT: '1' }).port).toBe(1);
		expect(readEnv({ PORT: '65535' }).port).toBe(65_535);
		expect(readEnv({ PORT: '   ' }).port).toBe(3000);

		// '3.5' is deliberately not here: `parseInt` reads it as 3, which is a port.
		for (const value of ['0', '-1', '65536', 'http']) {
			expect(() => readEnv({ PORT: value })).toThrow(
				`PORT must be an integer between 1 and 65535. Received: ${value}`,
			);
		}
	});
});

describe('parseOrigin', () => {
	it('keeps an origin and drops the rest of the URL', () => {
		expect(parseOrigin('APP_ORIGIN', 'http://localhost:5173/')).toBe('http://localhost:5173');
		expect(parseOrigin('APP_ORIGIN', 'https://app.simmer-data.com/path?query=1')).toBe(
			'https://app.simmer-data.com',
		);
	});

	it('normalizes a schemeless host to https rather than crash-looping the boot', () => {
		expect(parseOrigin('APP_ORIGIN', 'app.simmer-data.com')).toBe('https://app.simmer-data.com');
		expect(parseOrigin('APP_ORIGIN', '  app.simmer-data.com/  ')).toBe(
			'https://app.simmer-data.com',
		);
	});

	it('reads a schemeless host:port as a host and a port, not as a scheme', () => {
		// `new URL('localhost:5173')` reads `localhost:` as the scheme and yields the
		// origin "null", which matches no browser `Origin` header.
		expect(parseOrigin('APP_ORIGIN', 'localhost:5173')).toBe('https://localhost:5173');
	});

	it('refuses an origin that cannot be an http origin at all', () => {
		expect(() => parseOrigin('APP_ORIGIN', 'not a host')).toThrow(
			'APP_ORIGIN must be a valid URL. Received: not a host',
		);
		expect(() => parseOrigin('APP_ORIGIN', 'file:///etc/hosts')).toThrow(
			'APP_ORIGIN must be an http(s) URL. Received: file:///etc/hosts',
		);
	});
});
