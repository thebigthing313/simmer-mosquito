/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	allowRegionDrop,
	REGION_DND_TYPE,
	readDraggedRegionId,
	useRegionDnd,
} from '../../../../../routes/gis/regions/-region-dnd';

afterEach(cleanup);

function bind() {
	const onMove = vi.fn();
	const { result } = renderHook(() => useRegionDnd(onMove));
	return { onMove, result };
}

/** A drag event with just the DataTransfer surface the guards read. */
function dragEvent(types: readonly string[], payload = ''): React.DragEvent<HTMLElement> {
	const preventDefault = vi.fn();
	return {
		preventDefault,
		dataTransfer: {
			types,
			dropEffect: 'none',
			getData: (type: string) => (types.includes(type) ? payload : ''),
		},
	} as unknown as React.DragEvent<HTMLElement>;
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
		expect(result.current.dropTargetKey).toBeNull();
		expect(onMove).toHaveBeenCalledWith('region-1', 'folder-2');
	});

	it('tracks the hovered drop target and clears it on drop', () => {
		const { result } = bind();
		act(() => result.current.onDragStart('region-1'));
		act(() => result.current.onDragOverTarget('folder-2'));
		expect(result.current.dropTargetKey).toBe('folder-2');

		act(() => result.current.onDropRegion('region-1', null));
		expect(result.current.dropTargetKey).toBeNull();
	});

	// A drag abandoned outside any target still ends on the source element.
	it('clears both on drag end', () => {
		const { onMove, result } = bind();
		act(() => result.current.onDragStart('region-1'));
		act(() => result.current.onDragOverTarget('folder-2'));
		act(() => result.current.onDragEnd());
		expect(result.current.draggingId).toBeNull();
		expect(result.current.dropTargetKey).toBeNull();
		expect(onMove).not.toHaveBeenCalled();
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
