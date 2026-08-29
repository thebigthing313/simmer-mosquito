/**
 * Every route module the server registers, in one list, called from one place.
 *
 * `main.ts` used to make these calls at module scope, which meant nothing could
 * import them. `cors-options.test.ts` walks the registered routes to check them
 * against the CORS table, and with no importable list it rebuilt one by hand.
 * A hand-mirrored list does not fail when a module is missing from it. The walk
 * simply never sees that module and reports clean over the routes it happens to
 * know about. It had already drifted by two, `registerRegionMembershipRoutes`
 * and `registerWeatherImportRoute`, both admitted by a prefix that already
 * allowed their verb rather than by any check, and it let `GET /search` ship
 * with no CORS surface at all (#280).
 *
 * So the walk and the server read this function. Adding a module here is what
 * puts it in front of the checks; forgetting to add it here is a route the
 * server does not serve, which is not a silent failure.
 *
 * Two things stay in `main.ts`. The middleware loops (`CORS_SURFACES`,
 * `COMPRESSED_READ_PREFIXES`, `PRIVATE_READ_PREFIXES`) run before the routes and
 * have their own tests. And `/debug/auth-context`, which is registered only
 * outside production and mounts its own `cors()` block rather than sitting in
 * the table, so it is the one route the walk is not asked to admit. A route
 * that does not exist in production cannot ship a cross-origin refusal.
 *
 * Everything `main.ts` used to write inline is a module now: `session-routes.ts`
 * has `/health` and the four WorkOS session routes,
 * `operator-organization-routes.ts` has the three that create and read agencies.
 */

import type { Kysely, SimmerDatabase } from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import { registerAdminFoundationRoutes } from './admin-foundations.js';
import { type AdminInvitationAuth, registerAdminInvitationRoutes } from './admin-invitations.js';
import { registerAdultSurveillanceCommandRoutes } from './adult-surveillance-commands/index.js';
import type { AuthMailer } from './auth-email.js';
import type { AuthVariables } from './auth-middleware.js';
import {
	type AuthUserFlows,
	type FinalizeWorkOsSession,
	registerAuthUserRoutes,
} from './auth-user-commands.js';
import { registerControlAssetCommandRoutes } from './control-asset-commands.js';
import { registerControlMethodCommandRoutes } from './control-method-commands.js';
import { registerControlOperationsCommandRoutes } from './control-operations-commands/index.js';
import { registerControlProductCommandRoutes } from './control-product-commands.js';
import { registerFieldWorkCommandRoutes } from './field-work-commands/index.js';
import { registerFoundationCommandRoutes } from './foundation-commands/index.js';
import { registerFoundationGeographyCommandRoutes } from './foundation-geography-commands/index.js';
import { registerGeocoderRoutes } from './geocoder.js';
import { registerLarvalSurveillanceCommandRoutes } from './larval-surveillance-commands/index.js';
import { registerMapTileRoutes } from './map-tiles.js';
import type { MembershipAuth } from './membership-commands.js';
import { registerMissionDispatchCommandRoutes } from './mission-dispatch-commands/index.js';
import {
	type OperatorOrganizationAuth,
	registerOperatorOrganizationRoutes,
} from './operator-organization-routes.js';
import { registerOrganizationSettingsCommandRoutes } from './organization-settings-commands.js';
import { registerProfileCommandRoutes } from './profile-commands.js';
import { registerPublicEngagementCommandRoutes } from './public-engagement-commands.js';
import { registerPublicEngagementRecordRoutes } from './public-engagement-records-commands/index.js';
import { registerRecordDeletionRoutes } from './record-deletion.js';
import { registerRecordMergeReadRoutes } from './record-merge-reads.js';
import { registerRegionMembershipRoutes } from './region-membership.js';
import { registerSearchRoutes } from './search.js';
import { registerServiceRequestNearbyRoutes } from './service-request-nearby.js';
import {
	registerSessionRoutes,
	type SessionAuth,
	type SessionRouteOptions,
} from './session-routes.js';
import { registerSyncShapeRoutes } from './sync-shapes.js';
import { registerTableCommandSurface } from './table-commands/index.js';
import { registerWeatherImportRoute } from './weather-commands/index.js';

/**
 * What the route modules need, as the narrowest shape both callers can build.
 *
 * `auth` is the intersection of the three views the modules take of the WorkOS
 * client rather than the client itself, and `mailer` and `finalizeSession` are
 * interfaces for the same reason. The route walk stands these up inert, because
 * it cannot hold a real WorkOS client or send email to find out which paths
 * exist.
 */
export interface ServerDeps {
	readonly db: Kysely<SimmerDatabase>;
	readonly auth: AuthUserFlows &
		AdminInvitationAuth &
		MembershipAuth &
		SessionAuth &
		OperatorOrganizationAuth;
	readonly mailer: AuthMailer;
	readonly sessionProvider: SessionRouteOptions['sessionProvider'];
	readonly localIdentityResolver: SessionRouteOptions['localIdentityResolver'];
	readonly nodeEnv: SessionRouteOptions['nodeEnv'];
	readonly appOrigin: string;
	readonly appOrigins: readonly string[];
	readonly setAuthCookie: SessionRouteOptions['setAuthCookie'];
	readonly finalizeSession: FinalizeWorkOsSession;
	/** `null` turns address lookup off; `geocoder.ts` answers 503 rather than throwing. */
	readonly geocoderApiKey: string | null;
	/** `null` turns the Electric proxy off; `sync-shapes.ts` refuses rather than throwing. */
	readonly electricUrl: string | null;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	readonly operatorAuthContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export function registerAllRoutes(app: Hono<{ Variables: AuthVariables }>, deps: ServerDeps): void {
	const { db, auth, authContextMiddleware, operatorAuthContextMiddleware } = deps;

	registerSessionRoutes(app, {
		auth,
		sessionProvider: deps.sessionProvider,
		localIdentityResolver: deps.localIdentityResolver,
		nodeEnv: deps.nodeEnv,
		appOrigin: deps.appOrigin,
		appOrigins: deps.appOrigins,
		setAuthCookie: deps.setAuthCookie,
		finalizeSession: deps.finalizeSession,
	});

	registerAuthUserRoutes(app, {
		auth,
		mailer: deps.mailer,
		appOrigin: deps.appOrigin,
		finalizeSession: deps.finalizeSession,
	});

	registerOperatorOrganizationRoutes(app, { db, auth, operatorAuthContextMiddleware });
	registerAdminInvitationRoutes(app, { db, auth, operatorAuthContextMiddleware });
	registerAdminFoundationRoutes(app, { db, operatorAuthContextMiddleware });

	registerFoundationCommandRoutes(app, { db, authContextMiddleware });
	registerFoundationGeographyCommandRoutes(app, { db, authContextMiddleware });
	registerControlMethodCommandRoutes(app, { db, authContextMiddleware });
	registerControlAssetCommandRoutes(app, { db, authContextMiddleware });
	registerControlProductCommandRoutes(app, { db, authContextMiddleware });
	registerOrganizationSettingsCommandRoutes(app, { db, authContextMiddleware });
	registerProfileCommandRoutes(app, { db, authContextMiddleware });
	registerPublicEngagementCommandRoutes(app, { db, authContextMiddleware });
	registerLarvalSurveillanceCommandRoutes(app, { db, authContextMiddleware });
	registerAdultSurveillanceCommandRoutes(app, { db, authContextMiddleware });
	registerControlOperationsCommandRoutes(app, { db, authContextMiddleware });
	registerFieldWorkCommandRoutes(app, { db, authContextMiddleware });
	registerMissionDispatchCommandRoutes(app, { db, authContextMiddleware });
	registerPublicEngagementRecordRoutes(app, { db, authContextMiddleware });

	registerMapTileRoutes(app, { db, authContextMiddleware });
	registerSearchRoutes(app, { db, authContextMiddleware });
	registerServiceRequestNearbyRoutes(app, { db, authContextMiddleware });
	registerRecordDeletionRoutes(app, { db, authContextMiddleware });
	registerRecordMergeReadRoutes(app, { db, authContextMiddleware });
	registerRegionMembershipRoutes(app, { db, authContextMiddleware });
	registerGeocoderRoutes(app, { apiKey: deps.geocoderApiKey, authContextMiddleware });

	// The `/commands/{table}` surface, which the sync collections write through.
	// Additive: the domain-shaped endpoints above are untouched, and both reach
	// the same commands, permissions and write transaction.
	registerTableCommandSurface(app, {
		db,
		auth,
		authContextMiddleware,
		operatorAuthContextMiddleware,
	});

	// The one weather command the table surface has no shape for, see the module.
	registerWeatherImportRoute(app, { db, authContextMiddleware });

	registerSyncShapeRoutes(app, {
		electricUrl: deps.electricUrl,
		authContextMiddleware,
		operatorAuthContextMiddleware,
	});
}
