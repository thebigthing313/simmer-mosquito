import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { describe, expect, it } from 'vitest';
import { ADMIN_CORS_ALLOW_METHODS } from './cors-options.js';

describe('admin CORS options', () => {
	it('allows PATCH preflights for admin write routes', async () => {
		const app = new Hono();
		app.use(
			'/admin/*',
			cors({
				origin: ['https://admin.simmer-data.com'],
				credentials: true,
				allowMethods: ADMIN_CORS_ALLOW_METHODS,
			}),
		);
		app.patch('/admin/units/:unitId', (context) => context.json({ ok: true }));

		const response = await app.request('/admin/units/be08a10c-7d27-4130-a359-9e8874d4d2b8', {
			method: 'OPTIONS',
			headers: {
				'access-control-request-method': 'PATCH',
				origin: 'https://admin.simmer-data.com',
			},
		});

		expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
	});
});
