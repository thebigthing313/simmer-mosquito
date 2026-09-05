import { assertWriteReferences, sql } from '@simmer-mosquito/db';
import {
	addFormulationInsecticideCommand,
	type ControlOperationsCommand,
	removeFormulationInsecticideCommand,
	updateFormulationInsecticideCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import { requireStateAcknowledgement } from '../acknowledgements.js';
import type { AuthVariables } from '../auth-middleware.js';
import { acknowledged, readNumber, readText } from '../command-payload.js';
import {
	type CommandContext,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandEndpoint,
	type FormulationInsecticideRow,
	formulationInsecticideReturnColumns,
	type RouteOptions,
	runCommands,
	softDelete,
} from './shared.js';

// ===========================================================================
// Formulation insecticides
// ===========================================================================

export function registerFormulationInsecticideRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/formulation-insecticides',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, organization: ctx }) =>
				addFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: readText(payload.id) ?? '',
					formulationId: readText(payload.formulationId) ?? '',
					insecticideId: readText(payload.insecticideId) ?? '',
					amount: readNumber(payload.amount) ?? Number.NaN,
					unitId: readText(payload.unitId) ?? '',
				}),
			run: (context, commands) =>
				runFormulationInsecticideCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/control-operations/formulation-insecticides/:formulationInsecticideId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, organization: ctx, param }) =>
				updateFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: param('formulationInsecticideId'),
					...('insecticideId' in payload
						? { insecticideId: readText(payload.insecticideId) ?? '' }
						: {}),
					...('amount' in payload ? { amount: readNumber(payload.amount) ?? Number.NaN } : {}),
					...('unitId' in payload ? { unitId: readText(payload.unitId) ?? '' } : {}),
					acknowledgedDeactivateEmptyFormulation: acknowledged(
						payload,
						'acknowledgedDeactivateEmptyFormulation',
					),
				}),
			run: (context, commands) => runFormulationInsecticideCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/control-operations/formulation-insecticides/:formulationInsecticideId',
		options.authContextMiddleware,
		commandEndpoint({
			// An optional body, so the one thing a caller may need to say about a
			// removal has somewhere to go. Nothing is required of it: a request
			// with no body reads as it always did (#341).
			body: 'optional',
			build: ({ payload, organization: ctx, param }) =>
				removeFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: param('formulationInsecticideId'),
					acknowledgedDeactivateEmptyFormulation: acknowledged(
						payload,
						'acknowledgedDeactivateEmptyFormulation',
					),
				}),
			run: (context, commands) => runFormulationInsecticideCommands(context, options.db, commands),
		}),
	);
}

async function runFormulationInsecticideCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{
			db,
			write: writeFormulationInsecticideCommand,
			notFound: 'formulation_insecticide_not_found',
			key: 'formulationInsecticide',
		},
		commands,
		createdStatus,
	);
}

/**
 * Refuse taking the last thing out of a live recipe, unless the agency said to,
 * and report the formulation that is about to be emptied (#341).
 *
 * A formulation with no ingredients cannot be mixed and nothing can be applied
 * under it, while the row sits there looking like a product the agency still
 * has. That is a fact about one formulation rather than a count of what is
 * affected, so the sentence is the whole answer and `consequences` is empty.
 *
 * Only an active formulation asks. `docs/control-operations-domain.md` allows a
 * draft with zero components on purpose, so emptying an inactive one is the
 * state it is already allowed to be in and there is nothing to confirm.
 *
 * What counts as left over is that doc's "active, non-deleted insecticide
 * component": a row whose product is still in use. A formulation holding one
 * live component and one naming a retired insecticide is one removal away from
 * a recipe nothing can be mixed from, and counting rows alone would let that
 * through without a word.
 *
 * Returns the formulation to deactivate, or `null`. The doc is explicit that
 * confirming this deactivates the formulation rather than leaving an active
 * recipe with nothing in it, and the flag is named for that half.
 *
 * Only the removal reaches this. `updateFormulationInsecticide` declares the
 * same flag and cannot satisfy it: changing a component's product, amount or
 * unit leaves the row in place, so the recipe has exactly what it had before.
 * The flag stays on that command rather than being dropped, because dropping
 * one is a change to the vocabulary and this issue is about reading them.
 */
async function formulationLeftEmptyBy(
	trx: ControlOperationsTransaction,
	payload: {
		readonly formulationInsecticideId: string;
		readonly organizationId: string;
		readonly acknowledgedDeactivateEmptyFormulation: boolean;
	},
): Promise<string | null> {
	const parent = await trx
		.selectFrom('formulation_insecticides as removed')
		.innerJoin('formulations as parent', 'parent.id', 'removed.formulation_id')
		.select(['parent.id as formulation_id', 'parent.is_active as is_active'])
		.where('removed.id', '=', payload.formulationInsecticideId)
		.where('removed.organization_id', '=', payload.organizationId)
		.where('removed.deleted_at', 'is', null)
		.where('parent.deleted_at', 'is', null)
		.executeTakeFirst();

	if (parent === undefined || parent.is_active !== true) {
		return null;
	}

	// "Active component" is the doc's phrase and it means the component's product
	// is still in use, not the row. A recipe whose only other ingredient names a
	// retired insecticide cannot be mixed either, so the join is what makes the
	// question the one the doc asks.
	const remaining = await trx
		.selectFrom('formulation_insecticides as sibling')
		.innerJoin('insecticides as product', 'product.id', 'sibling.insecticide_id')
		.select(({ fn }) => fn.countAll<string>().as('count'))
		.where('sibling.formulation_id', '=', parent.formulation_id)
		.where('sibling.organization_id', '=', payload.organizationId)
		.where('sibling.id', '!=', payload.formulationInsecticideId)
		.where('sibling.deleted_at', 'is', null)
		.where('product.is_active', '=', true)
		.where('product.deleted_at', 'is', null)
		.executeTakeFirst();

	if (Number.parseInt(remaining?.count ?? '0', 10) > 0) {
		return null;
	}

	requireStateAcknowledgement({
		state: true,
		acknowledgement: 'acknowledgedDeactivateEmptyFormulation',
		acknowledged: payload.acknowledgedDeactivateEmptyFormulation === true,
		message: 'This is the last ingredient in the formulation, which leaves the recipe empty.',
	});

	return parent.formulation_id;
}

/**
 * Take an emptied formulation out of use, in the same transaction as the
 * removal that emptied it. An active recipe with nothing in it is the state the
 * confirmation was about.
 */
async function deactivateEmptiedFormulation(
	trx: ControlOperationsTransaction,
	formulationId: string,
	organizationId: string,
	actorProfileId: string,
): Promise<void> {
	await trx
		.updateTable('formulations')
		.set({
			is_active: false,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', formulationId)
		.where('organization_id', '=', organizationId)
		.execute();
}

export async function writeFormulationInsecticideCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<FormulationInsecticideRow | null> {
	switch (command.type) {
		case 'controlOperations.addFormulationInsecticide': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: [
					{
						column: 'formulation_id',
						catalog: 'formulation',
						id: command.payload.formulationId,
						label: 'formulation',
					},
					{
						column: 'insecticide_id',
						catalog: 'insecticide',
						id: command.payload.insecticideId,
						label: 'insecticide',
					},
				],
			});
			const row = await trx
				.insertInto('formulation_insecticides')
				.values({
					id: command.payload.formulationInsecticideId,
					organization_id: command.payload.organizationId,
					formulation_id: command.payload.formulationId,
					insecticide_id: command.payload.insecticideId,
					amount: command.payload.amount,
					unit_id: command.payload.unitId,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(formulationInsecticideReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'controlOperations.updateFormulationInsecticide': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: {
					kind: 'update',
					table: 'formulation_insecticides',
					recordId: command.payload.formulationInsecticideId,
				},
				references:
					'insecticideId' in command.payload.changes
						? [
								{
									column: 'insecticide_id',
									catalog: 'insecticide',
									id: command.payload.changes.insecticideId ?? null,
									label: 'insecticide',
								},
							]
						: [],
			});
			const row = await trx
				.updateTable('formulation_insecticides')
				.set({
					...('insecticideId' in command.payload.changes
						? { insecticide_id: command.payload.changes.insecticideId }
						: {}),
					...('amount' in command.payload.changes
						? { amount: command.payload.changes.amount }
						: {}),
					...('unitId' in command.payload.changes
						? { unit_id: command.payload.changes.unitId }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.formulationInsecticideId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(formulationInsecticideReturnColumns)
				.executeTakeFirst();
			return row ?? null;
		}
		case 'controlOperations.removeFormulationInsecticide': {
			const emptied = await formulationLeftEmptyBy(trx, command.payload);
			const row = await softDelete(
				trx,
				'formulation_insecticides',
				command.payload.formulationInsecticideId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				formulationInsecticideReturnColumns,
			);
			if (emptied !== null) {
				await deactivateEmptiedFormulation(
					trx,
					emptied,
					command.payload.organizationId,
					command.payload.actorProfileId,
				);
			}
			return row;
		}
		default:
			throw new Error(`Unsupported formulation insecticide command: ${command.type}`);
	}
}
