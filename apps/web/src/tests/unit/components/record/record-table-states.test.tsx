/** @vitest-environment jsdom */
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	RecordTableEmpty,
	type RecordTableScope,
} from '../../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../../components/record/record-table-unavailable';

const HabitatIcon = iconRegistry.entities.habitat.icon;

function renderEmpty({
	isError = false,
	isFiltered = false,
	isLoading = false,
	onClearFilters = vi.fn(),
	scope = { kind: 'active' },
}: {
	readonly isError?: boolean;
	readonly isFiltered?: boolean;
	readonly isLoading?: boolean;
	readonly onClearFilters?: () => void;
	readonly scope?: RecordTableScope;
} = {}) {
	return render(
		<RecordTableEmpty
			emptyDescription="Active habitats show here as crews add them."
			filteredDescription="No habitat matches what is set above."
			icon={HabitatIcon}
			isError={isError}
			isFiltered={isFiltered}
			isLoading={isLoading}
			onClearFilters={onClearFilters}
			recordType="habitat"
			scope={scope}
		/>,
	);
}

/**
 * The four states the eleven record tables each wrote out by hand, and the
 * titles they spelled, which now come from the register.
 */
describe('RecordTableEmpty', () => {
	afterEach(cleanup);

	it('draws nothing on a failed read, since the strip above already says so', () => {
		const { container } = renderEmpty({ isError: true, isFiltered: true, isLoading: true });

		expect(container.innerHTML).toBe('');
	});

	it('draws the placeholder rows while the read is in flight', () => {
		renderEmpty({ isLoading: true, isFiltered: true });

		expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
		expect(screen.queryByText('No Habitats Match')).toBeNull();
	});

	it('names the filters as the reason and offers to clear them', () => {
		const onClearFilters = vi.fn();
		renderEmpty({ isFiltered: true, onClearFilters });

		expect(screen.getByText('No Habitats Match')).toBeTruthy();
		expect(screen.getByText('No habitat matches what is set above.')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
		expect(onClearFilters).toHaveBeenCalledTimes(1);
	});

	it('says what the list holds when nothing is set and nothing is there', () => {
		renderEmpty();

		expect(screen.getByText('No Active Habitats')).toBeTruthy();
		expect(screen.getByText('Active habitats show here as crews add them.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Clear Filters' })).toBeNull();
	});

	it.each([
		[{ kind: 'active' }, 'No Active Habitats'],
		[{ kind: 'yet' }, 'No Habitats Yet'],
		[{ kind: 'lastDays', days: 30 }, 'No Habitats in the Last 30 Days'],
		[{ kind: 'thisYear' }, 'No Habitats This Year'],
	] as const)('titles the %o scope %s', (scope, title) => {
		renderEmpty({ scope });

		expect(screen.getByText(title)).toBeTruthy();
	});
});

describe('RecordTableUnavailable', () => {
	afterEach(cleanup);

	it('names the records in sentence case and retries on Try Again', () => {
		const onRetry = vi.fn();
		render(<RecordTableUnavailable onRetry={onRetry} recordType="application" />);

		expect(screen.getByText('Chemical applications could not be loaded.')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
