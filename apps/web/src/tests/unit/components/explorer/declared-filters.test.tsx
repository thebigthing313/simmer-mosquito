/** @vitest-environment jsdom */

/**
 * Every record set's chips against its count (#1421). The collapsed panel
 * reports `activeCount`, and the chip row is the reader's way to see and undo
 * what that count is counting, so the two have to agree on every set, on each
 * surface, for each filter the surface applies. Five sets once counted a moved
 * date window and drew no chip for it, which left a chip row holding only
 * "Clear all".
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectionFilterDeclarations } from '../../../../components/adult-surveillance/collections/collection-filters';
import { trapFilterDeclarations } from '../../../../components/adult-surveillance/traps/trap-filters';
import { biocontrolFilterDeclarations } from '../../../../components/control-operations/biocontrol/biocontrol-filters';
import { applicationFilterDeclarations } from '../../../../components/control-operations/chemical/application-filters';
import { sourceReductionFilterDeclarations } from '../../../../components/control-operations/source-reduction/source-reduction-filters';
import {
	DeclaredFilterChips,
	filterFields,
} from '../../../../components/explorer/declared-filters';
import {
	declaredKeys,
	type FilterDeclarations,
	type LooseDeclaration,
} from '../../../../components/explorer/filter-declarations';
import {
	type RecordSet,
	type RecordSetSurface,
	surfaceApplies,
} from '../../../../components/explorer/record-set';
import { addressFilterDeclarations } from '../../../../components/gis/addresses/address-filters';
import { habitatFilterDeclarations } from '../../../../components/larval-surveillance/habitats/habitat-filters';
import { inspectionFilterDeclarations } from '../../../../components/larval-surveillance/inspection-filters';
import { sampleFilterDeclarations } from '../../../../components/larval-surveillance/samples/sample-filters';
import { outreachFilterDeclarations } from '../../../../components/public-engagement/outreach/outreach-filters';
import { serviceRequestFilterDeclarations } from '../../../../components/public-engagement/service-requests/service-request-filters';
import { recordSetBinding, recordSetContext } from './record-set-binding';

// The option sources are catalog reads. With none loaded every id is one the
// catalog does not name, which is a chip all the same.
const NO_OPTIONS = { options: [], nameById: new Map() };
vi.mock('../../../../hooks/explorer/use-catalog-options', () => ({
	useCatalogOptions: () => NO_OPTIONS,
}));
vi.mock('../../../../hooks/explorer/use-region-options', () => ({
	useRegionOptions: () => NO_OPTIONS,
}));
vi.mock('../../../../hooks/explorer/use-insecticide-options', () => ({
	useInsecticideOptions: () => NO_OPTIONS,
}));
vi.mock('../../../../hooks/explorer/use-species-options', () => ({
	useSpeciesOptions: () => NO_OPTIONS,
}));
vi.mock('../../../../hooks/explorer/use-tag-options', () => ({
	useTagOptions: () => ({ options: [], byId: new Map() }),
}));

afterEach(cleanup);

/** Any set's filters, keyed loosely so one table can hold all eleven. */
type AnyFilters = Record<string, unknown>;

function nameOf(declaration: LooseDeclaration): string {
	return declaration.kind === 'dateRange' ? 'dates' : declaration.key;
}

/** Every record set's declarations. A set left off this list goes untested. */
const SETS: readonly (readonly [string, FilterDeclarations<AnyFilters>])[] = [
	['Traps', trapFilterDeclarations],
	['Collections', collectionFilterDeclarations],
	['Biocontrol Actions', biocontrolFilterDeclarations],
	['Chemical Applications', applicationFilterDeclarations],
	['Source Reductions', sourceReductionFilterDeclarations],
	['Address Book', addressFilterDeclarations],
	['Habitats', habitatFilterDeclarations],
	['Inspections', inspectionFilterDeclarations],
	['Samples', sampleFilterDeclarations],
	['Outreach Actions', outreachFilterDeclarations],
	['Service Requests', serviceRequestFilterDeclarations],
] as unknown as readonly (readonly [string, FilterDeclarations<AnyFilters>])[];

const SURFACES: readonly RecordSetSurface[] = ['map', 'table'];

/** A value off the default for each kind, moved by as many chips as it counts. */
function moved(
	declaration: LooseDeclaration,
	defaults: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	switch (declaration.kind) {
		case 'dateRange':
			return { from: '2025-06-01' };
		case 'text':
			return { [declaration.key]: 'marsh' };
		case 'flag':
			return { [declaration.key]: true };
		case 'idSet':
			return { [declaration.key]: new Set(['id-a', 'id-b']) };
		case 'choiceSet':
			return {
				[declaration.key]: new Set(declaration.options.slice(0, 2).map((option) => option.value)),
			};
		case 'choice': {
			const other = declaration.options.find(
				(option) => option.value !== defaults[declaration.key],
			);
			return { [declaration.key]: other?.value };
		}
	}
}

/** A set's declarations, loosened for the switch above. */
function loose(declarations: FilterDeclarations<AnyFilters>): readonly LooseDeclaration[] {
	return declarations.list as unknown as readonly LooseDeclaration[];
}

function removeButtons(): readonly HTMLElement[] {
	return screen.queryAllByRole('button', { name: /^Remove .* filter$/ });
}

/** The declarations `surface` applies. */
function applied(declarations: FilterDeclarations<AnyFilters>, surface: RecordSetSurface) {
	const { applies } = declarations.set as unknown as {
		readonly applies: Readonly<Record<string, 'both' | RecordSetSurface>>;
	};
	return loose(declarations).filter((declaration) =>
		declaredKeys(declaration).every((key) => surfaceApplies(applies[key] ?? 'both', surface)),
	);
}

describe.each(SETS)('the %s chips', (_name, declarations) => {
	const set = declarations.set as unknown as RecordSet<Record<string, unknown>>;

	it('declare every filter key exactly once', () => {
		const keys = loose(declarations).flatMap(declaredKeys);
		expect([...keys].sort()).toEqual(Object.keys(set.codecs).sort());
	});

	describe.each(SURFACES)('on the %s', (surface) => {
		it('draw nothing with every filter at its default', () => {
			const binding = recordSetBinding(set, surface);
			render(<DeclaredFilterChips binding={binding} declarations={declarations} />);
			expect(binding.activeCount).toBe(0);
			expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
		});

		it.each(
			applied(declarations, surface).map((declaration): [string, LooseDeclaration] => [
				nameOf(declaration),
				declaration,
			]),
		)('draw one chip per %s value the count counts', (_filter, declaration) => {
			const defaults = set.defaults(recordSetContext(), surface);
			const binding = recordSetBinding(set, surface, moved(declaration, defaults));
			render(<DeclaredFilterChips binding={binding} declarations={declarations} />);

			expect(binding.activeCount).toBeGreaterThan(0);
			expect(removeButtons()).toHaveLength(binding.activeCount);
		});

		it('draw one chip per counted value with every filter moved at once', () => {
			const defaults = set.defaults(recordSetContext(), surface);
			const patch = Object.assign(
				{},
				...applied(declarations, surface).map((declaration) => moved(declaration, defaults)),
			);
			const binding = recordSetBinding(set, surface, patch);
			render(<DeclaredFilterChips binding={binding} declarations={declarations} />);

			expect(removeButtons()).toHaveLength(binding.activeCount);
		});
	});
});

describe('the date chip', () => {
	it('restores the default window and drops the count to zero', () => {
		const set = collectionFilterDeclarations.set as unknown as RecordSet<Record<string, unknown>>;
		const binding = recordSetBinding(set, 'map', { from: '2026-06-01' });
		render(
			<DeclaredFilterChips
				binding={binding}
				declarations={collectionFilterDeclarations as unknown as FilterDeclarations<AnyFilters>}
			/>,
		);

		expect(removeButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
			'Remove Dates: Jun 1–Oct 9 filter',
		]);
		fireEvent.click(removeButtons()[0] as HTMLElement);
		expect(binding.setFilters).toHaveBeenCalledWith({
			from: binding.defaults.from,
			to: binding.defaults.to,
		});
	});
});

describe('the Overdue chip', () => {
	const set = serviceRequestFilterDeclarations.set as unknown as RecordSet<Record<string, unknown>>;
	const declarations =
		serviceRequestFilterDeclarations as unknown as FilterDeclarations<AnyFilters>;

	it('turns the filter off', () => {
		const binding = recordSetBinding(set, 'map', { overdue: true });
		render(<DeclaredFilterChips binding={binding} declarations={declarations} />);

		fireEvent.click(screen.getByRole('button', { name: 'Remove Overdue filter' }));

		expect(binding.setFilters).toHaveBeenCalledWith({ overdue: false });
	});

	it('is neither drawn nor counted while the Organization threshold is off', () => {
		const binding = recordSetBinding(set, 'map', { overdue: true }, recordSetContext('off'));
		render(<DeclaredFilterChips binding={binding} declarations={declarations} />);

		expect(binding.activeCount).toBe(0);
		expect(screen.queryByText('Overdue')).toBeNull();
	});

	it('is left out of a chip row another filter keeps up while the threshold is off', () => {
		const binding = recordSetBinding(
			set,
			'map',
			{ overdue: true, status: 'open' },
			recordSetContext('off'),
		);
		render(<DeclaredFilterChips binding={binding} declarations={declarations} />);

		expect(binding.activeCount).toBe(1);
		expect(removeButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
			'Remove Status: Open filter',
		]);
	});

	it('draws no control while the threshold is off, and one while it is on', () => {
		const off = filterFields(
			declarations,
			recordSetBinding(set, 'map', {}, recordSetContext('off')),
		);
		const on = filterFields(declarations, recordSetBinding(set, 'map', {}, recordSetContext(14)));

		expect(off.overdue).toBeNull();
		expect(on.overdue).not.toBeNull();
	});
});
