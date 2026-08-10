/** @vitest-environment jsdom */
import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	CatalogPage,
	CatalogRecordDialog,
	CatalogRowActions,
	CatalogSection,
	useCatalogDialogOpen,
	useCatalogSearch,
} from '../../../../components/catalog';

const Icon = iconRegistry.generic.component.icon;

afterEach(cleanup);

/**
 * The five lookup catalogs were five copies of one page (#99). These are the
 * decisions the shared frame now makes once, and which the copies had each
 * answered for themselves — the ones where a wrong answer is silent.
 */
describe('CatalogPage', () => {
	function page(props: { readonly canEdit: boolean; readonly isEmpty: boolean }) {
		return (
			<CatalogPage
				action={<button type="button">Add Method</button>}
				description="How your crews catch adult mosquitoes."
				emptyDescription="Every trap records the method that caught its mosquitoes."
				emptyTitle="No Collection Methods Yet"
				icon={Icon}
				title="Collection Methods"
				{...props}
			>
				<p>rows</p>
			</CatalogPage>
		);
	}

	it('says which access this reader has, in the badge the header carries', () => {
		const { rerender } = render(page({ canEdit: true, isEmpty: false }));
		expect(screen.getByText('Editor access')).toBeTruthy();

		rerender(page({ canEdit: false, isEmpty: false }));
		expect(screen.getByText('View only')).toBeTruthy();
	});

	// The header and the empty state offered the same way in on all five pages,
	// and on all five it was written twice.
	it('offers the same way in from the header and the empty state', () => {
		render(page({ canEdit: true, isEmpty: true }));

		expect(screen.getAllByRole('button', { name: 'Add Method' })).toHaveLength(2);
		expect(screen.queryByText('rows')).toBeNull();
	});
});

describe('CatalogSection', () => {
	const columns = (
		<TableRow>
			<TableHead>Method</TableHead>
		</TableRow>
	);

	it('stands the empty label in for the table rather than an empty table', () => {
		render(
			<CatalogSection
				columns={columns}
				count={0}
				emptyLabel="No active methods. Add one to start recording work."
				title="Active"
			>
				{[]}
			</CatalogSection>,
		);

		expect(screen.getByText('No active methods. Add one to start recording work.')).toBeTruthy();
		expect(screen.queryByRole('table')).toBeNull();
	});

	// habitat types clipped its table where the other two scrolled theirs, so a
	// narrow viewport could not reach the last columns on that page alone.
	it('scrolls a table too wide for its column rather than clipping it', () => {
		const { container } = render(
			<CatalogSection columns={columns} count={1} emptyLabel="unused" title="Active">
				<TableRow>
					<TableCell>Catch basin</TableCell>
				</TableRow>
			</CatalogSection>,
		);

		expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
		expect(container.querySelector('.overflow-hidden')).toBeNull();
	});
});

describe('CatalogRowActions', () => {
	function openMenu() {
		fireEvent.pointerDown(
			screen.getByRole('button', { name: /^Actions for/ }),
			new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
		);
	}

	/**
	 * Whether a doomed deactivation can be greyed out before the server refuses
	 * it depends on whether the referring records sync eagerly — traps do, control
	 * actions do not. The frame must take that as an answer, never compute one.
	 */
	it('disables the toggle and says why, only when told to', () => {
		const { rerender } = render(
			<CatalogRowActions
				isActive
				name="CDC light trap"
				onEdit={vi.fn()}
				onToggle={vi.fn()}
				toggleDisabled
				toggleHint="In use by 3 active traps."
			/>,
		);
		openMenu();
		expect(screen.getByText('In use by 3 active traps.')).toBeTruthy();

		rerender(
			<CatalogRowActions
				isActive
				name="CDC light trap"
				onEdit={vi.fn()}
				onToggle={vi.fn()}
				toggleHint="In use by 3 active traps."
			/>,
		);
		expect(screen.queryByText('In use by 3 active traps.')).toBeNull();
		expect(screen.getByText('Deactivate')).toBeTruthy();
	});

	// #65 again, from the other side: a manager may rename a control method but
	// not retire it, so the menu drops the item rather than showing it dead.
	it('drops the lifecycle item for a reader who may edit but not retire', () => {
		render(<CatalogRowActions isActive name="Truck ULV" onEdit={vi.fn()} />);
		openMenu();

		expect(screen.getByText('Edit')).toBeTruthy();
		expect(screen.queryByText('Deactivate')).toBeNull();
		expect(screen.queryByText('Reactivate')).toBeNull();
	});

	it('names the way back for a record that is already retired', () => {
		render(
			<CatalogRowActions isActive={false} name="Truck ULV" onEdit={vi.fn()} onToggle={vi.fn()} />,
		);
		openMenu();

		expect(screen.getByText('Reactivate')).toBeTruthy();
	});
});

describe('useCatalogSearch', () => {
	const active = [{ name: 'Catch basin' }, { name: 'Storm drain' }];
	const inactive = [{ name: 'Tire pile' }];
	const matches = (row: { name: string }, query: string) => row.name.toLowerCase().includes(query);

	function Probe({ query }: { readonly query: string }) {
		const search = useCatalogSearch(active, inactive, matches);
		const { setSearch } = search;

		useEffect(() => {
			setSearch(query);
		}, [query, setSearch]);

		return (
			<output>
				{`${search.filteredActive.length}/${search.filteredInactive.length} of ${search.total}, matches=${search.hasMatches}`}
			</output>
		);
	}

	it('filters both halves of the lifecycle and reports the totals', () => {
		render(<Probe query="drain" />);

		expect(screen.getByRole('status').textContent).toBe('1/0 of 3, matches=true');
	});

	it('leaves every row alone when nothing has been typed', () => {
		render(<Probe query="" />);

		expect(screen.getByRole('status').textContent).toBe('2/1 of 3, matches=true');
	});

	it('reports no matches rather than an empty list', () => {
		render(<Probe query="zzz" />);

		expect(screen.getByRole('status').textContent).toBe('0/0 of 3, matches=false');
	});
});

describe('useCatalogDialogOpen', () => {
	function Probe({
		open,
		onOpenChange,
	}: {
		readonly open?: boolean | undefined;
		readonly onOpenChange?: ((next: boolean) => void) | undefined;
	}) {
		const [isOpen, setOpen] = useCatalogDialogOpen(open, onOpenChange);
		return (
			<button onClick={() => setOpen(!isOpen)} type="button">
				{isOpen ? 'open' : 'closed'}
			</button>
		);
	}

	it('keeps its own state when no controlled pair is passed', () => {
		render(<Probe />);
		expect(screen.getByRole('button').textContent).toBe('closed');

		fireEvent.click(screen.getByRole('button'));
		expect(screen.getByRole('button').textContent).toBe('open');
	});

	it('defers to the row menu that opened it', () => {
		const onOpenChange = vi.fn();
		render(<Probe onOpenChange={onOpenChange} open />);
		expect(screen.getByRole('button').textContent).toBe('open');

		fireEvent.click(screen.getByRole('button'));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		// Still open: the caller owns the state and has not changed it.
		expect(screen.getByRole('button').textContent).toBe('open');
	});
});

describe('CatalogRecordDialog', () => {
	it('mounts nothing but its trigger while closed', () => {
		render(
			<CatalogRecordDialog
				actions={<button type="button">Save</button>}
				description="Manage the label."
				onOpenChange={vi.fn()}
				onSubmit={vi.fn()}
				open={false}
				title="Add Habitat Type"
				trigger={<button type="button">Add Habitat Type</button>}
			>
				<input aria-label="Name" />
			</CatalogRecordDialog>,
		);

		expect(screen.getByRole('button', { name: 'Add Habitat Type' })).toBeTruthy();
		expect(screen.queryByLabelText('Name')).toBeNull();
	});

	it('submits the fields without navigating the page', () => {
		const onSubmit = vi.fn();
		render(
			<CatalogRecordDialog
				actions={<button type="submit">Save</button>}
				description="Manage the label."
				onOpenChange={vi.fn()}
				onSubmit={onSubmit}
				open
				title="Add Habitat Type"
			>
				<input aria-label="Name" />
			</CatalogRecordDialog>,
		);

		expect(screen.getByLabelText('Name')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		expect(onSubmit).toHaveBeenCalledTimes(1);
	});
});
