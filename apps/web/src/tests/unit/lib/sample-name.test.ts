import { describe, expect, it } from 'vitest';
import { sampleName } from '../../../lib/sample-name';

const ID = '0f3c9b21-77e2-4d51-9b0a-2c6d5e8f1a34';

describe('sampleName', () => {
	it('reads the crew label when there is one', () => {
		expect(sampleName({ id: ID, displayName: 'Catch basin A' })).toBe('Catch basin A');
	});

	// A label of spaces is a label nobody typed, so it names nothing on screen.
	it('falls back when the label is blank', () => {
		expect(sampleName({ id: ID, displayName: '   ' })).toBe('Sample 0f3c9b21');
	});

	it('falls back when there is no label', () => {
		expect(sampleName({ id: ID, displayName: null })).toBe('Sample 0f3c9b21');
	});

	it('falls back when the row carries no label column', () => {
		expect(sampleName({ id: ID, displayName: undefined })).toBe('Sample 0f3c9b21');
	});

	it('trims the padding off a label with content', () => {
		expect(sampleName({ id: ID, displayName: ' Catch basin A ' })).toBe('Catch basin A');
	});
});
