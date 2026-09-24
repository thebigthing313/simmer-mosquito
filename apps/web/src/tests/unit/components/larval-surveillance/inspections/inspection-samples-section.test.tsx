/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InspectionSampleDraft } from '../../../../../components/larval-surveillance/inspections/inspection-form-values';
import { SamplesSection } from '../../../../../components/larval-surveillance/inspections/inspection-samples-section';

afterEach(cleanup);

const DRAFTS: readonly InspectionSampleDraft[] = [
	{ id: 'sample-1', label: 'CUP-17' },
	{ id: 'sample-2', label: '' },
];

function renderSection(inspectorName: string | null, inspectionDate = '2026-09-24') {
	const onChange = vi.fn<(next: readonly InspectionSampleDraft[]) => void>();
	render(
		<SamplesSection
			inspectionDate={inspectionDate}
			inspectorName={inspectorName}
			isEditing={false}
			onChange={onChange}
			value={DRAFTS}
		/>,
	);
	return onChange;
}

describe('SamplesSection', () => {
	it("generates a label from the inspector's initials into the one row", () => {
		const onChange = renderSection('William Lynch');

		fireEvent.click(screen.getByRole('button', { name: 'Generate a label for sample 2' }));

		const [next] = onChange.mock.calls[0] ?? [];
		expect(next?.[0]).toEqual({ id: 'sample-1', label: 'CUP-17' });
		expect(next?.[1]?.id).toBe('sample-2');
		expect(next?.[1]?.label).toMatch(/^WL-0924-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$/);
	});

	it('leaves the initials off when no inspector is picked', () => {
		const onChange = renderSection(null);

		fireEvent.click(screen.getByRole('button', { name: 'Generate a label for sample 1' }));

		expect(onChange.mock.calls[0]?.[0]?.[0]?.label).toMatch(/^0924-[0-9A-HJKMNP-TV-Z]{4}-.$/);
	});

	it('cannot generate before the inspection has a date', () => {
		renderSection('William Lynch', '');

		expect(screen.getByRole('button', { name: 'Generate a label for sample 1' })).toHaveProperty(
			'disabled',
			true,
		);
	});

	it('keeps a typed label as typed', () => {
		const onChange = renderSection('William Lynch');

		fireEvent.change(screen.getByLabelText('Sample 2 label'), { target: { value: 'A-3' } });

		expect(onChange.mock.calls[0]?.[0]?.[1]).toEqual({ id: 'sample-2', label: 'A-3' });
	});
});
