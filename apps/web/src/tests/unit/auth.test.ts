import { afterEach, describe, expect, it, vi } from 'vitest';
import { getServerUrl, getShapeServerUrl } from '../../auth';

/**
 * These pin one thing: a build variable that is present but *empty* counts as
 * unset. `??` does not fall back on `''`, and an empty value is the normal
 * shape of "not configured" — a blank Railway field, a `.env` line with
 * nothing after the `=`, or a Docker `ARG` an image declares and a build does
 * not pass. The last of those shipped once: `VITE_SHAPE_SERVER_URL` became
 * `''` rather than falling through to the API origin, and shape streams went
 * to the static site instead of the server that injects their auth.
 */
describe('server URLs from build variables', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('reads the configured API origin', () => {
		vi.stubEnv('VITE_SERVER_URL', 'https://api.example.com');

		expect(getServerUrl()).toBe('https://api.example.com');
	});

	it('trims a trailing slash off the configured API origin', () => {
		vi.stubEnv('VITE_SERVER_URL', 'https://api.example.com/');

		expect(getServerUrl()).toBe('https://api.example.com');
	});

	it('falls back when the API origin is empty rather than missing', () => {
		vi.stubEnv('VITE_SERVER_URL', '');

		expect(getServerUrl()).toBe('http://localhost:3000');
	});

	it('sends shapes to the API origin when no shape proxy is configured', () => {
		vi.stubEnv('VITE_SERVER_URL', 'https://api.example.com');
		vi.stubEnv('VITE_SHAPE_SERVER_URL', undefined);

		expect(getShapeServerUrl()).toBe('https://api.example.com');
	});

	it('sends shapes to the API origin when the shape proxy is empty', () => {
		vi.stubEnv('VITE_SERVER_URL', 'https://api.example.com');
		vi.stubEnv('VITE_SHAPE_SERVER_URL', '');

		expect(getShapeServerUrl()).toBe('https://api.example.com');
	});

	it('prefers a configured shape proxy over the API origin', () => {
		vi.stubEnv('VITE_SERVER_URL', 'https://api.example.com');
		vi.stubEnv('VITE_SHAPE_SERVER_URL', 'https://shapes.example.com');

		expect(getShapeServerUrl()).toBe('https://shapes.example.com');
	});
});
