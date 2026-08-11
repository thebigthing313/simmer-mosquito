/** @vitest-environment jsdom */
import type { RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REGION_DND_TYPE, type RegionDnd } from '../../../../../routes/gis/regions/-region-dnd';
import type { RegionRename } from '../../../../../routes/gis/regions/-region-rename';

// The row links to a region's detail page. Only `Link` needs standing in — it
// is the one import that demands a live router; the rest of the module is real.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('@tanstack/react-router')>()),
	Link: ({ children, ...rest }: { children?: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

const { FolderNode } = await import('../../../../../routes/gis/regions/index');

afterEach(cleanup);

const FOLDER = { id: 'folder-2', name: 'North side', description: null } as RegionFolderRow;
const REGION = { id: 'region-9', name: 'Elm St', regionFolderId: 'folder-2' } as RegionRow;

function stubDnd(overrides: Partial<RegionDnd> = {}): RegionDnd {
	return {
		draggingId: null,
		dropTarget: null,
		onDragStart: vi.fn(),
		onDragEnd: vi.fn(),
		onDragOverTarget: vi.fn(),
		onDropRegion: vi.fn(),
		...overrides,
	};
}

const RENAME: RegionRename = {
	renamingId: null,
	start: vi.fn(),
	commit: vi.fn(),
	cancel: vi.fn(),
};

function renderFolder(dnd: RegionDnd) {
	return render(
		<FolderNode
			dnd={dnd}
			expanded={true}
			focusedId={null}
			folder={FOLDER}
			onEdit={vi.fn()}
			onFocusRegion={vi.fn()}
			onToggleExpand={vi.fn()}
			onToggleFolder={vi.fn()}
			onToggleRegion={vi.fn()}
			regions={[REGION]}
			rename={RENAME}
			visibleIds={new Set()}
		/>,
	);
}

/** Just the DataTransfer surface the drop guards read. */
const dataTransfer = {
	types: [REGION_DND_TYPE],
	dropEffect: 'none',
	getData: (type: string) => (type === REGION_DND_TYPE ? 'region-1' : ''),
};

describe('folder drop zone', () => {
	/*
	 * The drop handlers used to sit on the folder header alone, with the rows
	 * rendered as a sibling outside it. Dropping onto a region already in the
	 * folder — the obvious target once the folder is open — reached nothing.
	 */
	it('takes a drop that lands on a region row inside the folder', () => {
		const dnd = stubDnd();
		renderFolder(dnd);

		fireEvent.drop(screen.getByText('Elm St'), { dataTransfer });

		expect(dnd.onDropRegion).toHaveBeenCalledWith('region-1', 'folder-2');
	});

	it('still takes a drop on the folder header', () => {
		const dnd = stubDnd();
		renderFolder(dnd);

		fireEvent.drop(screen.getByText('North side'), { dataTransfer });

		expect(dnd.onDropRegion).toHaveBeenCalledWith('region-1', 'folder-2');
	});

	// The same reach has to apply to the hover highlight, or the folder lights up
	// over an area that would not accept the drop.
	it('marks the folder hovered from a dragover on a row', () => {
		const dnd = stubDnd();
		renderFolder(dnd);

		fireEvent.dragOver(screen.getByText('Elm St'), { dataTransfer });

		expect(dnd.onDragOverTarget).toHaveBeenCalledWith({ kind: 'folder', folderId: 'folder-2' });
	});
});
