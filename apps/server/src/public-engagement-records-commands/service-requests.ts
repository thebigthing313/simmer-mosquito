import { randomUUID } from 'node:crypto';
import { applyRecordDeletion, sql } from '@simmer-mosquito/db';
import {
	type ContactReferenceInput,
	closeServiceRequestCommand,
	createServiceRequestCommand,
	deleteServiceRequestCommand,
	type PublicEngagementCommand,
	reopenServiceRequestCommand,
	type ServiceRequestLocationInput,
	updateServiceRequestContactCommand,
	updateServiceRequestDetailsCommand,
	updateServiceRequestLocationCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	invalidUpdate,
	localDateColumn,
	type PublicEngagementDb,
	type PublicEngagementTransaction,
	type RouteOptions,
	readDate,
	resolveContact,
	resolveServiceRequestAddress,
	runCommands,
	type SafeServiceRequest,
	serviceRequestReturnColumns,
	softDelete,
	toSafeServiceRequest,
	updateRow,
} from './shared.js';

// ===========================================================================
// Service requests
// ===========================================================================

export function registerServiceRequestRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/public-engagement/service-requests',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createServiceRequestCommand({
					...ctx,
					serviceRequestId: readText(payload.id) ?? '',
					contact: payload.contact as ContactReferenceInput,
					location: payload.location as ServiceRequestLocationInput,
					intakeType: (readText(payload.intakeType) ?? '') as never,
					requestDate: readText(payload.requestDate) ?? '',
					details: readText(payload.details) ?? '',
					receivedByProfileId: readNullableText(payload.receivedByProfileId),
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/public-engagement/service-requests/:serviceRequestId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildServiceRequestUpdateCommands(authContext, param('serviceRequestId'), payload),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/public-engagement/service-requests/:serviceRequestId/contact',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateServiceRequestContactCommand({
					...ctx,
					serviceRequestId: param('serviceRequestId'),
					contact: payload.contact as ContactReferenceInput,
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/public-engagement/service-requests/:serviceRequestId/location',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateServiceRequestLocationCommand({
					...ctx,
					serviceRequestId: param('serviceRequestId'),
					location: payload.location as ServiceRequestLocationInput,
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/public-engagement/service-requests/:serviceRequestId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteServiceRequestCommand({
					...ctx,
					serviceRequestId: param('serviceRequestId'),
				}),
			run: (context, commands) => runServiceRequestCommands(context, options.db, commands),
		}),
	);
}

function buildServiceRequestUpdateCommands(
	authContext: AuthContext,
	serviceRequestId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: PublicEngagementCommand[] = [];

	const detailKeys = ['requestDate', 'intakeType', 'receivedByProfileId', 'details'];
	if (detailKeys.some((key) => key in payload)) {
		const result = createCommand(() =>
			updateServiceRequestDetailsCommand({
				...ctx,
				serviceRequestId,
				...('requestDate' in payload ? { requestDate: readText(payload.requestDate) ?? '' } : {}),
				...('intakeType' in payload
					? { intakeType: (readText(payload.intakeType) ?? '') as never }
					: {}),
				...('receivedByProfileId' in payload
					? { receivedByProfileId: readNullableText(payload.receivedByProfileId) }
					: {}),
				...('details' in payload ? { details: readText(payload.details) ?? '' } : {}),
				acknowledgedClosedRequestChange: true,
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('contactId' in payload) {
		const result = createCommand(() =>
			updateServiceRequestContactCommand({
				...ctx,
				serviceRequestId,
				contact: { kind: 'existing', contactId: readText(payload.contactId) ?? '' },
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('closedAt' in payload) {
		const closedAt = readDate(payload.closedAt);
		const result = createCommand(() =>
			closedAt !== null
				? closeServiceRequestCommand({
						...ctx,
						serviceRequestId,
						resolutionCommentId: randomUUID(),
						resolutionSummary: readText(payload.resolutionSummary) ?? 'Closed',
						closedAt,
					})
				: reopenServiceRequestCommand({
						...ctx,
						serviceRequestId,
						reopenCommentId: randomUUID(),
						reopenReason: 'Reopened',
					}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('service request');
	}
	return { ok: true, commands };
}

async function runServiceRequestCommands(
	context: CommandContext,
	db: PublicEngagementDb,
	commands: readonly PublicEngagementCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{
			db,
			write: writeServiceRequestCommand,
			notFound: 'service_request_not_found',
			key: 'serviceRequest',
		},
		commands,
		createdStatus,
	);
}

async function writeServiceRequestCommand(
	trx: PublicEngagementTransaction,
	command: PublicEngagementCommand,
): Promise<SafeServiceRequest | null> {
	switch (command.type) {
		case 'publicEngagement.createServiceRequest': {
			const contactId = await resolveContact(
				trx,
				command.payload.organizationId,
				command.payload.contact,
				command.payload.actorProfileId,
			);
			const addressId = await resolveServiceRequestAddress(
				trx,
				command.payload.organizationId,
				command.payload.location.address,
				command.payload.actorProfileId,
			);
			const row = await trx
				.insertInto('service_requests')
				.values({
					id: command.payload.serviceRequestId,
					organization_id: command.payload.organizationId,
					intake_type: command.payload.intakeType,
					request_date: localDateColumn(command.payload.requestDate),
					geom: geojsonToGeom(command.payload.location.geometry),
					address_id: addressId,
					contact_id: contactId,
					received_by_profile_id: command.payload.receivedByProfileId,
					details: command.payload.details,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(serviceRequestReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeServiceRequest(row);
		}
		case 'publicEngagement.updateServiceRequestDetails':
			return updateServiceRequest(
				trx,
				command.payload.serviceRequestId,
				command.payload.organizationId,
				{
					...('requestDate' in command.payload.changes &&
					command.payload.changes.requestDate !== undefined
						? { request_date: localDateColumn(command.payload.changes.requestDate) }
						: {}),
					...('intakeType' in command.payload.changes
						? { intake_type: command.payload.changes.intakeType }
						: {}),
					...('receivedByProfileId' in command.payload.changes
						? { received_by_profile_id: command.payload.changes.receivedByProfileId ?? null }
						: {}),
					...('details' in command.payload.changes
						? { details: command.payload.changes.details }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'publicEngagement.updateServiceRequestContact': {
			const contactId = await resolveContact(
				trx,
				command.payload.organizationId,
				command.payload.contact,
				command.payload.actorProfileId,
			);
			return updateServiceRequest(
				trx,
				command.payload.serviceRequestId,
				command.payload.organizationId,
				{
					contact_id: contactId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		}
		case 'publicEngagement.updateServiceRequestLocation': {
			const addressId = await resolveServiceRequestAddress(
				trx,
				command.payload.organizationId,
				command.payload.location.address,
				command.payload.actorProfileId,
			);
			return updateServiceRequest(
				trx,
				command.payload.serviceRequestId,
				command.payload.organizationId,
				{
					geom: geojsonToGeom(command.payload.location.geometry),
					address_id: addressId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		}
		case 'publicEngagement.closeServiceRequest':
			return updateServiceRequest(
				trx,
				command.payload.serviceRequestId,
				command.payload.organizationId,
				{
					closed_at: command.payload.closedAt === null ? sql`now()` : command.payload.closedAt,
					closed_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'publicEngagement.reopenServiceRequest':
			return updateServiceRequest(
				trx,
				command.payload.serviceRequestId,
				command.payload.organizationId,
				{
					closed_at: null,
					closed_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
			);
		case 'publicEngagement.deleteServiceRequest':
			await applyRecordDeletion(trx, {
				recordType: 'serviceRequest',
				recordId: command.payload.serviceRequestId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'service_requests',
				command.payload.serviceRequestId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				serviceRequestReturnColumns,
				toSafeServiceRequest,
			);
		default:
			throw new Error(`Unsupported service request command: ${command.type}`);
	}
}

async function updateServiceRequest(
	trx: PublicEngagementTransaction,
	serviceRequestId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<SafeServiceRequest | null> {
	return updateRow(
		trx,
		'service_requests',
		serviceRequestId,
		organizationId,
		set,
		serviceRequestReturnColumns,
		toSafeServiceRequest,
	);
}
