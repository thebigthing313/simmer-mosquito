import { afterEach, describe, expect, it, vi } from 'vitest';
import { createControlMethodMutationHandlers } from '../../../sync/controlMethodMutations';

/**
 * A control method's PATCH crosses two role floors at once.
 *
 * The server reads `isActive` off the payload and turns its *presence* into a
 * `deactivate*Method` or `reactivate*Method` command, which sits at `ADMIN`.
 * The name and custom-field edit beside it is `update*Method`, which sits at
 * `MANAGER`. `denyUnauthorizedAgencyCommands` refuses the whole batch if any
 * command in it is refused, so sending `isActive` unconditionally put an
 * admin-floor command inside every manager's rename and 403'd it — which is
 * why #65 read as "the UI hides what the server allows" when the UI was only
 * half the problem.
 */
describe('control method updates', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('omits isActive from a rename, so the batch stays at the manager floor', async () => {
		const { handlers, bodies } = handlersWithCapturedFetch();

		await handlers.onUpdate({
			transaction: {
				mutations: [
					{
						original: { id: 'method-1', name: 'ULV truck', customSchema: null, isActive: true },
						modified: {
							id: 'method-1',
							name: 'ULV truck spray',
							customSchema: null,
							isActive: true,
						},
					},
				],
			},
		});

		expect(bodies).toHaveLength(1);
		expect(bodies[0]).not.toHaveProperty('isActive');
		expect(bodies[0]).toMatchObject({ name: 'ULV truck spray' });
	});

	it('still sends isActive when the lifecycle is what changed', async () => {
		const { handlers, bodies } = handlersWithCapturedFetch();

		await handlers.onUpdate({
			transaction: {
				mutations: [
					{
						original: { id: 'method-1', name: 'ULV truck', customSchema: null, isActive: true },
						modified: { id: 'method-1', name: 'ULV truck', customSchema: null, isActive: false },
					},
				],
			},
		});

		expect(bodies[0]).toMatchObject({ isActive: false });
	});

	// An optimistic update whose `original` the collection could not supply
	// must not silently drop the lifecycle field — absent is not "unchanged".
	it('sends isActive when there is no original to compare against', async () => {
		const { handlers, bodies } = handlersWithCapturedFetch();

		await handlers.onUpdate({
			transaction: {
				mutations: [
					{
						original: {},
						modified: { id: 'method-1', name: 'ULV truck', customSchema: null, isActive: false },
					},
				],
			},
		});

		expect(bodies[0]).toMatchObject({ isActive: false });
	});
});

interface MethodRow {
	readonly id: string;
	readonly name: string;
	readonly customSchema?: unknown | null;
	readonly isActive: boolean;
}

function handlersWithCapturedFetch() {
	const bodies: Record<string, unknown>[] = [];
	vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
		bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
		// A real `Response`, not a hand-rolled stand-in: the write layer reads the
		// body as text before parsing it, so a fake with only `json()` passes a
		// test the browser would fail.
		return new Response(JSON.stringify({ txid: 1 }), { status: 200 });
	});

	return {
		bodies,
		handlers: createControlMethodMutationHandlers<MethodRow>({
			serverUrl: 'https://api.test',
			endpointPath: '/control-methods/application-methods',
			fallbackName: 'application method',
		}),
	};
}
