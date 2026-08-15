/**
 * Routes for the commands the domain declares and nothing writes yet.
 *
 * Twenty of the 271 names in the vocabulary have no handler: the global taxonomy
 * writes, two merges, an address location update, mission notification
 * generation, and every `weather.*` write. Until now that was invisible — a
 * client naming one of them got a 404 from Hono, which is the same answer it
 * gets for a typo, so an unbuilt feature and a misspelled path were
 * indistinguishable.
 *
 * These routes exist to answer differently. Each one is registered, authorized
 * like any other command endpoint, and then refuses with `501` and the command
 * it would have run. Nothing is written and nothing is validated: a refusal that
 * checked the payload first would be an implementation with the write missing,
 * which is not what this is.
 *
 * ## What is deliberately not here
 *
 * The taxonomy writes are operator work, and today `/admin/genera` and
 * `/admin/species` serve them by calling `createGenusWithTxid` and its siblings
 * directly — no command is ever built. Those routes still work and are untouched.
 * The stubs below register the *command* path for the same table without the
 * operator middleware, because the split between operator and agency doors is a
 * question for whoever implements them rather than one to answer with a stub.
 *
 * The paths are the obvious reading of the existing conventions, not a decision.
 * Sub-paths for lifecycle transitions (`/deactivate`, `/location`) follow what
 * `/adult-surveillance/collections/:id/collect` and
 * `/public-engagement/service-requests/:id/location` already do. Implementing one
 * of these is the moment to settle its path, not before.
 *
 * The implementation work is tracked in
 * https://github.com/thebigthing313/simmer-mosquito/issues/163, which lists all
 * twenty and what each one needs.
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
	// Global taxonomy. Operator-owned, and served today by `/admin/*` routes that
	// write directly instead of building a command.
	{ verb: 'post', path: '/foundation/genera', command: 'foundation.createGenus' },
	{ verb: 'patch', path: '/foundation/genera/:genusId', command: 'foundation.updateGenus' },
	{ verb: 'delete', path: '/foundation/genera/:genusId', command: 'foundation.deleteGenus' },
	{ verb: 'post', path: '/foundation/species', command: 'foundation.createSpecies' },
	{ verb: 'patch', path: '/foundation/species/:speciesId', command: 'foundation.updateSpecies' },
	{ verb: 'delete', path: '/foundation/species/:speciesId', command: 'foundation.deleteSpecies' },

	// Addresses. The existing PATCH builds `updateAddressDetails` and only that, so
	// a location change has nowhere to go; a merge has no route at all.
	{
		verb: 'post',
		path: '/foundation/addresses/:addressId/location',
		command: 'foundation.updateAddressLocation',
	},
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

	// Weather stations.
	{ verb: 'post', path: '/weather/stations', command: 'weather.createWeatherStation' },
	{
		verb: 'patch',
		path: '/weather/stations/:weatherStationId',
		command: 'weather.updateWeatherStationDetails',
	},
	{
		verb: 'post',
		path: '/weather/stations/:weatherStationId/location',
		command: 'weather.updateWeatherStationLocation',
	},
	{
		verb: 'post',
		path: '/weather/stations/:weatherStationId/deactivate',
		command: 'weather.deactivateWeatherStation',
	},
	{
		verb: 'post',
		path: '/weather/stations/:weatherStationId/reactivate',
		command: 'weather.reactivateWeatherStation',
	},
	{
		verb: 'delete',
		path: '/weather/stations/:weatherStationId',
		command: 'weather.deleteWeatherStation',
	},

	// Weather summaries.
	{ verb: 'post', path: '/weather/summaries', command: 'weather.createWeatherSummary' },
	{
		verb: 'patch',
		path: '/weather/summaries/:weatherSummaryId',
		command: 'weather.updateWeatherSummary',
	},
	{
		verb: 'delete',
		path: '/weather/summaries/:weatherSummaryId',
		command: 'weather.deleteWeatherSummary',
	},
	{
		verb: 'post',
		path: '/weather/summary-imports/commit',
		command: 'weather.commitWeatherSummaryImport',
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
