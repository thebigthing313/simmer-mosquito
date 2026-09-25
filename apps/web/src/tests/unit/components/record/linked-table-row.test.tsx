/** @vitest-environment jsdom */
import { Table, TableBody, TableCell } from '@simmer-mosquito/ui-web/components/ui/table';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClampedTextCell, LinkedTableRow } from '../../../../components/record/linked-table-row';

/**
 * Only a 16px chevron opened a record from the table views. The row opens it
 * now by clicking that link, which stays the one focusable element.
 */
describe('LinkedTableRow', () => {
	afterEach(cleanup);

	function renderRow(onOpen: () => void, onOther = vi.fn()) {
		render(
			<Table>
				<TableBody>
					<LinkedTableRow
						action={
							<a
								href="/records/1"
								onClick={(event) => {
									event.preventDefault();
									onOpen();
								}}
							>
								View
							</a>
						}
					>
						<TableCell>Culvert 12</TableCell>
						<TableCell>
							<button onClick={onOther} type="button">
								Other
							</button>
						</TableCell>
					</LinkedTableRow>
				</TableBody>
			</Table>,
		);
	}

	it('opens the record from a click anywhere in the row', () => {
		const onOpen = vi.fn();
		renderRow(onOpen);

		fireEvent.click(screen.getByText('Culvert 12'));

		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	it('leaves a click on a control inside the row to that control', () => {
		const onOpen = vi.fn();
		const onOther = vi.fn();
		renderRow(onOpen, onOther);

		fireEvent.click(screen.getByRole('button', { name: 'Other' }));

		expect(onOther).toHaveBeenCalledTimes(1);
		expect(onOpen).not.toHaveBeenCalled();
	});

	it('keeps the link the only focusable way in', () => {
		renderRow(vi.fn());

		expect(screen.getByRole('row').getAttribute('tabindex')).toBeNull();
		expect(screen.getByRole('link', { name: 'View' })).toBeTruthy();
	});
});

describe('ClampedTextCell', () => {
	afterEach(cleanup);

	it('clamps the text and keeps the whole of it in the tooltip', () => {
		const text = 'Drainage ditch behind the school, dry most of the summer.';
		render(
			<Table>
				<TableBody>
					<tr>
						<ClampedTextCell empty="none" text={text} />
					</tr>
				</TableBody>
			</Table>,
		);

		const block = screen.getByText(text);
		expect(block.className).toContain('line-clamp-2');
		expect(block.getAttribute('title')).toBe(text);
	});
});
