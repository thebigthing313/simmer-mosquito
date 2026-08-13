/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import {
	allowRegionDrop,
	dropTargetFolderId,
	isHoveredDropTarget,
	REGION_DND_TYPE,
	type RegionDnd,
	readDraggedRegionId,
	regionDropZoneProps,
	useRegionDnd,
} from '../../../../../routes/gis/regions/-region-dnd';

afterEach(cleanup);

function bind() {
	const onMove = vi.fn();
	const { result } = renderHook(() => useRegionDnd(onMove));
	return { onMove, result };
}

/** Just the DataTransfer surface the guards read; jsdom implements none of it. */
function dataTransfer(types: readonly string[], payload: string) {
	return {
		types,
		dropEffect: 'none',
		getData: (type: string) => (types.includes(type) ? payload : ''),
	};
}

/** A drag event with just the DataTransfer surface the guards read. */
function dragEvent(types: readonly string[], payload = ''): React.DragEvent<HTMLElement> {
	return {
		preventDefault: vi.fn(),
		dataTransfer: dataTransfer(types, payload),
	} as unknown as React.DragEvent<HTMLElement>;
}

/** A RegionDnd whose calls are recorded; the hook's own state is tested above. */
function stubDnd(): RegionDnd & { onDropRegion: Mock; onDragOverTarget: Mock } {
	return {
		draggingId: null,
		dropTarget: null,
		onDragStart: vi.fn(),
		onDragEnd: vi.fn(),
		onDragOverTarget: vi.fn(),
		onDropRegion: vi.fn(),
	};
}

describe('useRegionDnd', () => {
	/*
	 * #140: dropping a region into another folder re-parents its row, so the
	 * element the drag started from unmounts and never fires `dragend`. The drop
	 * has to clear the dragging id itself or the moved region keeps rendering
	 * dimmed until something forces a full re-render.
	 */
	it('stops treating a region as dragging once it is dropped', () => {
		const { onMove, result } = bind();
		act(() => result.current.onDragStart('region-1'));
		expect(result.current.draggingId).toBe('region-1');

		act(() => result.current.onDropRegion('region-1', 'folder-2'));
		expect(result.current.draggingId).toBeNull();
		expect(result.current.dropTarget).toBeNull();
		expect(onMove).toHaveBeenCalledWith('region-1', 'folder-2');
	});

	it('tracks the hovered drop target and clears it on drop', () => {
		const { result } = bind();
		act(() => result.current.onDragStart('region-1'));
		act(() => result.current.onDragOverTarget({ kind: 'folder', folderId: 'folder-2' }));
		expect(result.current.dropTarget).toEqual({ kind: 'folder', folderId: 'folder-2' });

		act(() => result.current.onDropRegion('region-1', null));
		expect(result.current.dropTarget).toBeNull();
	});

	// A drag abandoned outside any target still ends on the source element.
	it('clears both on drag end', () => {
		const { onMove, result } = bind();
		act(() => result.current.onDragStart('region-1'));
		act(() => result.current.onDragOverTarget({ kind: 'folder', folderId: 'folder-2' }));
		act(() => result.current.onDragEnd());
		expect(result.current.draggingId).toBeNull();
		expect(result.current.dropTarget).toBeNull();
		expect(onMove).not.toHaveBeenCalled();
	});

	// The move handler is async in the route; the hook must not wait on it to
	// clear the dim, or the row stays dimmed for the length of the write.
	it('clears before the move it kicked off has settled', async () => {
		let settle = (): void => {};
		const onMove = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
		const { result } = renderHook(() => useRegionDnd(onMove));

		act(() => result.current.onDragStart('region-1'));
		act(() => result.current.onDropRegion('region-1', 'folder-2'));
		expect(result.current.draggingId).toBeNull();

		await act(async () => {
			settle();
		});
		expect(result.current.draggingId).toBeNull();
	});
});

describe('region drop targets', () => {
	// "Unfiled" is a place, not a folder, so the folder it writes is null.
	it('writes null for unfiled and the id for a folder', () => {
		expect(dropTargetFolderId({ kind: 'unfiled' })).toBeNull();
		expect(dropTargetFolderId({ kind: 'folder', folderId: 'folder-2' })).toBe('folder-2');
	});

	it('highlights only the zone being hovered', () => {
		const { result } = bind();
		act(() => result.current.onDragStart('region-1'));
		act(() => result.current.onDragOverTarget({ kind: 'folder', folderId: 'folder-2' }));

		expect(isHoveredDropTarget(result.current, { kind: 'folder', folderId: 'folder-2' })).toBe(
			true,
		);
		expect(isHoveredDropTarget(result.current, { kind: 'folder', folderId: 'folder-3' })).toBe(
			false,
		);
		expect(isHoveredDropTarget(result.current, { kind: 'unfiled' })).toBe(false);
	});

	it('highlights unfiled without matching any folder', () => {
		const { result } = bind();
		act(() => result.current.onDragStart('region-1'));
		act(() => result.current.onDragOverTarget({ kind: 'unfiled' }));

		expect(isHoveredDropTarget(result.current, { kind: 'unfiled' })).toBe(true);
		expect(isHoveredDropTarget(result.current, { kind: 'folder', folderId: 'folder-2' })).toBe(
			false,
		);
	});

	// A stale hover left over from an ended drag must not light anything up.
	it('highlights nothing when no drag is in progress', () => {
		const { result } = bind();
		act(() => result.current.onDragStart('region-1'));
		act(() => result.current.onDragOverTarget({ kind: 'unfiled' }));
		act(() => result.current.onDragEnd());

		expect(isHoveredDropTarget(result.current, { kind: 'unfiled' })).toBe(false);
	});
});

// Which element these end up on is what region-drop-zone.test.tsx holds; this
// covers what they do once an event reaches them.
describe('regionDropZoneProps', () => {
	it('drops onto a folder as that folder', () => {
		const dnd = stubDnd();
		const props = regionDropZoneProps(dnd, { kind: 'folder', folderId: 'folder-2' });
		props.onDrop?.(dragEvent([REGION_DND_TYPE], 'region-1'));
		expect(dnd.onDropRegion).toHaveBeenCalledWith('region-1', 'folder-2');
	});

	it('drops to unfiled as a null folder', () => {
		const dnd = stubDnd();
		const props = regionDropZoneProps(dnd, { kind: 'unfiled' });
		props.onDrop?.(dragEvent([REGION_DND_TYPE], 'region-1'));
		expect(dnd.onDropRegion).toHaveBeenCalledWith('region-1', null);
	});

	it('marks the zone hovered on dragover', () => {
		const dnd = stubDnd();
		const props = regionDropZoneProps(dnd, { kind: 'folder', folderId: 'folder-2' });
		props.onDragOver?.(dragEvent([REGION_DND_TYPE], 'region-1'));
		expect(dnd.onDragOverTarget).toHaveBeenCalledWith({ kind: 'folder', folderId: 'folder-2' });
	});

	it('ignores a drag that is not carrying a region', () => {
		const dnd = stubDnd();
		const props = regionDropZoneProps(dnd, { kind: 'folder', folderId: 'folder-2' });
		props.onDragOver?.(dragEvent(['text/plain'], 'whatever'));
		props.onDrop?.(dragEvent(['text/plain'], 'whatever'));
		expect(dnd.onDragOverTarget).not.toHaveBeenCalled();
		expect(dnd.onDropRegion).not.toHaveBeenCalled();
	});

	// An empty payload under the right type is a drag we cannot act on.
	it('ignores a region drag carrying no id', () => {
		const dnd = stubDnd();
		const props = regionDropZoneProps(dnd, { kind: 'folder', folderId: 'folder-2' });
		props.onDrop?.(dragEvent([REGION_DND_TYPE], ''));
		expect(dnd.onDropRegion).not.toHaveBeenCalled();
	});
});

describe('region drop guards', () => {
	it('accepts a region drag and asks for a move cursor', () => {
		const event = dragEvent([REGION_DND_TYPE], 'region-1');
		expect(allowRegionDrop(event)).toBe(true);
		expect(event.preventDefault).toHaveBeenCalled();
		expect(event.dataTransfer.dropEffect).toBe('move');
		expect(readDraggedRegionId(event)).toBe('region-1');
	});

	it('ignores anything that is not a region drag', () => {
		const event = dragEvent(['text/plain'], 'whatever');
		expect(allowRegionDrop(event)).toBe(false);
		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(readDraggedRegionId(event)).toBeNull();
	});
});
