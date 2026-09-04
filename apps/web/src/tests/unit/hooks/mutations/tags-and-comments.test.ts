/** @vitest-environment jsdom */

/**
 * What a Tag or a comment write dispatches.
 *
 * Two surfaces that hang off every record rather than belonging to one domain,
 * and both have a spelling nothing else checks. A Tag's colour is a hex string
 * the agency chose and the client used to upper-case it, which made the same
 * colour two values. A comment's `entity_type` is stored snake_case while the
 * domain speaks camelCase, so `serviceRequest` reaching the column unconverted
 * attaches the note to a type no read matches.
 *
 * The lifecycle is the other half. A Tag created with the switch off used to be
 * written active, and a pin used to be a column the server read to work out what
 * had happened. Both are commands now, and which one is named is what these
 * assert.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryCollections } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const TARGET = '44444444-4444-4444-8444-444444444444';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const { dispatches, lastChanges, lastIntents, lastWrite, resetDispatches, stubApi } = await import(
	'./dispatch-harness'
);
const { useTagMutations } = await import('../../../../hooks/mutations/use-tag-mutations');
const { useCommentMutations } = await import('../../../../hooks/mutations/use-comment-mutations');

/** Lower-case on purpose: the assertions below are about the case surviving. */
const COLOR = '#a3e635';

beforeEach(() => {
	installMemoryCollections();
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function tagFields(overrides: Record<string, unknown> = {}) {
	return {
		name: 'Chronic source',
		description: 'Comes back every season.',
		color: COLOR,
		isActive: true,
		...overrides,
	};
}

describe('a tag write', () => {
	it('names the create alone for a tag the dialog left active', async () => {
		const { result } = renderHook(() => useTagMutations());

		await result.current.create(tagFields());

		expect(lastIntents()).toEqual(['fieldWork.createTag']);
	});

	it('names the retirement beside the create when the switch was off', async () => {
		// The POST this replaces had no `is_active` in it, so a tag created inactive
		// was written active and the switch flicked back on when the write synced.
		const { result } = renderHook(() => useTagMutations());

		await result.current.create(tagFields({ isActive: false }));

		expect(lastIntents()).toEqual(['fieldWork.createTag', 'fieldWork.deactivateTag']);
		expect(lastWrite().row).toMatchObject({ is_active: false });
	});

	it('hands back the id it wrote, so the caller can select the new tag', async () => {
		const { result } = renderHook(() => useTagMutations());

		const id = await result.current.create(tagFields());

		expect(lastWrite().row).toMatchObject({ id });
	});

	it('stores the colour exactly as the agency picked it', async () => {
		// Upper-casing it here made `#a3e635` and `#A3E635` two colours, and the
		// swatch that read the row back stopped matching the one in the picker.
		const { result } = renderHook(() => useTagMutations());

		await result.current.create(tagFields());
		expect(lastWrite().row).toMatchObject({ color: COLOR });

		await result.current.save(RECORD, tagFields({ color: '#f43f5e' }), tagFields());
		expect(lastChanges().color).toBe('#f43f5e');
	});

	it('sends only the columns that moved, because an empty update is refused', async () => {
		const { result } = renderHook(() => useTagMutations());

		await result.current.save(RECORD, tagFields({ name: 'Chronic breeder' }), tagFields());

		expect(lastIntents()).toEqual(['fieldWork.updateTag']);
		expect(lastChanges().tag_name).toBe('Chronic breeder');
		expect(Object.keys(lastChanges())).not.toContain('color');
		expect(Object.keys(lastChanges())).not.toContain('description');
	});

	it('names the lifecycle direction alone when a save only flipped the switch', async () => {
		// `is_active` still travels, because an update whose changes are all
		// lifecycle has no diff and TanStack DB sends nothing for one.
		const { result } = renderHook(() => useTagMutations());

		await result.current.save(RECORD, tagFields({ isActive: false }), tagFields());

		expect(lastIntents()).toEqual(['fieldWork.deactivateTag']);
		expect(lastChanges().is_active).toBe(false);
		expect(Object.keys(lastChanges())).not.toContain('tag_name');
	});

	it('names both on one write when a save renamed and restored at once', async () => {
		// `activateTag` rather than `reactivateTag`: the Tag commands were named
		// before the eight lookup catalogs settled on the other word.
		const { result } = renderHook(() => useTagMutations());

		await result.current.save(
			RECORD,
			tagFields({ name: 'Chronic breeder' }),
			tagFields({ isActive: false }),
		);

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual(['fieldWork.updateTag', 'fieldWork.activateTag']);
	});

	it('dispatches nothing when the dialog was saved untouched', async () => {
		const { result } = renderHook(() => useTagMutations());

		await result.current.save(RECORD, tagFields(), tagFields());

		expect(dispatches()).toHaveLength(0);
	});

	it('reads the row menu toggle for its direction', async () => {
		const { result } = renderHook(() => useTagMutations());

		await result.current.setActive(RECORD, false);
		expect(lastIntents()).toEqual(['fieldWork.deactivateTag']);
		expect(lastChanges().is_active).toBe(false);

		await result.current.setActive(RECORD, true);
		expect(lastIntents()).toEqual(['fieldWork.activateTag']);
		expect(lastChanges().is_active).toBe(true);
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useTagMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['fieldWork.deleteTag']);
	});
});

describe('a comment write', () => {
	it('writes the target type in the spelling the column holds', async () => {
		// The domain says `serviceRequest`, the column says `service_request`. An
		// unconverted value writes a row no thread ever reads back.
		const { result } = renderHook(() => useCommentMutations());

		await result.current.add({ type: 'serviceRequest', id: TARGET }, 'Caller rang again');

		expect(lastIntents()).toEqual(['fieldWork.addComment']);
		expect(lastWrite().row).toMatchObject({
			entity_type: 'service_request',
			entity_id: TARGET,
			comment_text: 'Caller rang again',
		});
	});

	it('leaves a single-word target type alone', async () => {
		const { result } = renderHook(() => useCommentMutations());

		await result.current.add({ type: 'habitat', id: TARGET }, 'Silted over');

		expect(lastWrite().row).toMatchObject({ entity_type: 'habitat' });
	});

	it('hands back the id it minted, so the thread can single the note out', async () => {
		const { result } = renderHook(() => useCommentMutations());

		const id = await result.current.add({ type: 'trap', id: TARGET }, 'Battery replaced');

		expect(lastWrite().row).toMatchObject({ id, is_pinned: false });
	});

	it('names the edit and moves only the text', async () => {
		const { result } = renderHook(() => useCommentMutations());

		await result.current.edit(RECORD, 'Caller rang twice');

		expect(lastIntents()).toEqual(['fieldWork.updateComment']);
		expect(lastChanges().comment_text).toBe('Caller rang twice');
		expect(Object.keys(lastChanges())).not.toContain('is_pinned');
	});

	it('reads the pin for its direction rather than leaving the column to say it', async () => {
		// A double toggle is then a refusal rather than a silent no-op, which is
		// what the endpoint now requires.
		const { result } = renderHook(() => useCommentMutations());

		await result.current.setPinned(RECORD, true);
		expect(lastIntents()).toEqual(['fieldWork.pinComment']);
		expect(lastChanges().is_pinned).toBe(true);

		await result.current.setPinned(RECORD, false);
		expect(lastIntents()).toEqual(['fieldWork.unpinComment']);
		expect(lastChanges().is_pinned).toBe(false);
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useCommentMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['fieldWork.deleteComment']);
	});
});
