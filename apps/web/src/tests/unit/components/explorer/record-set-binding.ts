/**
 * A `useRecordSetFilters` binding built without the hook, for suites that
 * render a set's controls or chips against filters they choose. The defaults
 * and the count come from the set itself, the way the hook resolves them, so a
 * suite cannot hand a component a count the set would not reach.
 */

import {
	resolveOrganizationSettings,
	type ServiceRequestOverdueDays,
} from '@simmer-mosquito/domain';
import { type Mock, vi } from 'vitest';
import {
	type RecordSet,
	type RecordSetContext,
	type RecordSetSurface,
	recordSetCounting,
	recordSetInert,
} from '../../../../components/explorer/record-set';
import type { RecordSetFilterBinding } from '../../../../hooks/explorer/use-record-set-filters';
import { countActiveFilters } from '../../../../lib/search-filters';

const BINDING_TODAY = '2026-10-09';

/** The context a set resolves in, with the Overdue threshold `overdueDays`. */
export function recordSetContext(overdueDays: ServiceRequestOverdueDays = 14): RecordSetContext {
	const { settings } = resolveOrganizationSettings({
		publicEngagement: { serviceRequestOverdueDays: overdueDays },
	});
	return { today: BINDING_TODAY, settings };
}

export type TestBinding<TFilters> = RecordSetFilterBinding<TFilters> & {
	readonly setFilters: Mock<(patch: Partial<TFilters>) => void>;
	readonly clearSearch: Mock<() => void>;
	readonly clearAll: Mock<() => void>;
};

/** `set`'s binding on `surface`, its filters the defaults with `patch` over them. */
export function recordSetBinding<TFilters extends object, TTile>(
	set: RecordSet<TFilters, TTile>,
	surface: RecordSetSurface,
	patch: Partial<TFilters> = {},
	context: RecordSetContext = recordSetContext(),
): TestBinding<TFilters> {
	const defaults = set.defaults(context, surface);
	const filters = { ...defaults, ...patch };
	const reset = vi.fn();
	const clearAll = vi.fn();
	return {
		filters,
		setFilters: vi.fn<(patch: Partial<TFilters>) => void>(),
		reset,
		activeCount: countActiveFilters(defaults, filters, recordSetCounting(set, context)),
		defaults,
		today: context.today,
		searchInput: '',
		setSearchInput: vi.fn(),
		clearSearch: vi.fn<() => void>(),
		clearAll,
		context,
		inert: recordSetInert(set, context),
	};
}
