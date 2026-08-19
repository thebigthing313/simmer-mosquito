/**
 * Routes for the commands the domain declares and nothing writes yet.
 *
 * Three of the 274 names in the vocabulary have no handler: two merges, and
 * mission notification generation. Until now that was invisible — a client
 * naming one of them got a 404 from Hono, which is the same answer it gets for a
 * typo, so an unbuilt feature and a misspelled path were indistinguishable.
 *
 * These routes exist to answer differently. Each one is registered, authorized
 * like any other command endpoint, and then refuses with `501` and the command
 * it would have run. Nothing is written and nothing is validated: a refusal that
 * checked the payload first would be an implementation with the write missing,
 * which is not what this is.
 *
 * ## What has left
 *
 * The six global taxonomy writes were here, stubbed at `/foundation/genera` and
 * `/foundation/species` because the split between the operator and agency doors
 * was still open. It is settled: `/commands/genera` and `/commands/species`
 * build and write those commands behind the operator middleware, so a stub
 * saying "no endpoint writes it yet" would now be false. An entry leaves this
 * list the moment its command has a writer.
 *
 * All ten `weather.*` writes have left too. They were the reason this file was
 * mostly weather, and they went in one piece rather than one at a time:
 * `AgencyCommandType` had left the whole domain out while nothing wrote one, so
 * the first writer had to bring a permission for all ten with it. Nine are
 * `/commands/weather_sources` and `/commands/weather_summaries`; the import has
 * its own route, for the reason `weather-commands/import.ts` gives.
 *
 * The paths are the obvious reading of the existing conventions, not a decision.
 * Sub-paths for lifecycle transitions (`/deactivate`, `/location`) follow what
 * `/adult-surveillance/collections/:id/collect` and
 * `/public-engagement/service-requests/:id/location` already do. Implementing one
 * of these is the moment to settle its path, not before.
 *
 * The implementation work is tracked in
 * https://github.com/thebigthing313/simmer-mosquito/issues/163, which lists what
 * each remaining one needs.
 */

import type { DomainCommandType } from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import type { CommandContext } from './command-endpoint.js';

interface UnimplementedRoute {
	readonly verb: 'post' | 'patch' | 'delete';
	readonly path: string;
	/**
	 * Typed against the vocabulary rather than left a string, so a renamed or
	 * misspelled command fails the build here instead of shipping a route that
	 * reports a command nobody can find.
	 */
	readonly command: DomainCommandType;
}

/**
 * Every command with no writer, and where its endpoint will be.
 *
 * Exported so a test can hold it to the vocabulary and check that no two entries
 * claim the same verb and path — a duplicate would register twice and the second
 * would never be reached.
 */
export const unimplementedCommandRoutes: readonly UnimplementedRoute[] = [
	// A merge has no route at all. `foundation.updateAddressLocation` was stubbed
	// here beside it and is not any more: `/commands/addresses` names it, and
	// `writeAddressCommand` writes it.
	{ verb: 'post', path: '/foundation/addresses/merge', command: 'foundation.mergeAddresses' },

	{
		verb: 'post',
		path: '/larval-surveillance/habitats/merge',
		command: 'larvalSurveillance.mergeHabitats',
	},

	{
		verb: 'post',
		path: '/public-engagement/missions/:missionId/notifications',
		command: 'publicEngagement.generateMissionNotifications',
	},
];

/**
 * The refusal.
 *
 * `501` rather than a 4xx because nothing is wrong with the request: the caller
 * asked for something the server does not implement, which is what the status
 * means. It also keeps the two apart in logs, where a 4xx is somebody's mistake
 * and this is our missing feature.
 *
 * `error` and `reason` are the keys every other refusal uses, so a client reading
 * one reads this the same way. `command` is extra, and is what turns "this did
 * not work" into a name somebody can search for.
 */
function refuseUnimplemented(command: DomainCommandType) {
	return (context: CommandContext) =>
		context.json(
			{
				error: 'command_not_implemented',
				reason: `${command} is part of the domain vocabulary but no endpoint writes it yet.`,
				command,
			},
			501,
		);
}

export function registerUnimplementedCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	for (const route of unimplementedCommandRoutes) {
		app[route.verb](route.path, options.authContextMiddleware, refuseUnimplemented(route.command));
	}
}
