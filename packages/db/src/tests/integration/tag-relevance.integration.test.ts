import { TAG_TARGET_ENTITY_TYPES } from '@simmer-mosquito/domain';
import { expect, it } from 'vitest';
import { sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';
import { createOrganization } from '../../test-support/row-fixtures.js';

/**
 * The check on `tags.relevant_entity_types` against the domain register.
 *
 * The column holds the record types a Tag is meant for, spelled the way
 * `tag_items.entity_type` spells them, and the migration holds it to the six
 * taggable targets with a `<@` membership check. No static gate reads a SQL
 * check's member list, so this is what keeps that constraint and
 * `TAG_TARGET_ENTITY_TYPES` from drifting. ADR 0018's nine geometry CHECKs are
 * held the same way, and `docs/tag-relevance-spec.md` says why.
 *
 * The members are read back by writing rows rather than by parsing the
 * constraint's source: `pg_get_constraintdef` renders an array literal with
 * casts and whitespace of Postgres's choosing, and a regex over that is the
 * migration-text parse this repo has paid for twice.
 *
 * Both directions, because a check is two failures. A name the register carries
 * that the constraint refuses leaves an editor unable to save what the picker
 * offers, and a name the constraint accepts that the register does not carry is
 * a value no reader knows what to do with.
 */
describeDbIntegration('tag relevance', () => {
	it('accepts every register member and the empty set', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);

			const insert = (name: string, relevantEntityTypes: readonly string[]) =>
				sql`
					insert into tags (organization_id, tag_name, relevant_entity_types)
					values (${organizationId}, ${name}, ${[...relevantEntityTypes]}::text[])
				`.execute(db);

			// The empty set is the column's default and means relevant everywhere.
			await expect(insert('everywhere', [])).resolves.toBeDefined();

			for (const entityType of TAG_TARGET_ENTITY_TYPES) {
				await expect(insert(`only ${entityType}`, [entityType])).resolves.toBeDefined();
			}

			await expect(insert('all six', TAG_TARGET_ENTITY_TYPES)).resolves.toBeDefined();
		});
	});

	it('refuses a name the register does not carry', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);

			// `serviceRequest` is the domain's camelCase spelling of a member the
			// column holds in snake_case. It has to be refused here, or both
			// spellings reach the picker and one of them matches nothing.
			for (const refused of ['serviceRequest', 'inspection', '']) {
				await expect(
					sql`
						insert into tags (organization_id, tag_name, relevant_entity_types)
						values (${organizationId}, ${`refused ${refused}`}, ${[refused]}::text[])
					`.execute(db),
				).rejects.toThrow(/tags_relevant_entity_types_known/);
			}
		});
	});
});
