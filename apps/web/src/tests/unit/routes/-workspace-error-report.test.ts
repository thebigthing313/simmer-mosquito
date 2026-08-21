import { describe, expect, it } from 'vitest';
import {
	buildErrorReport,
	describeError,
	joinStacks,
	type ReportContext,
} from '../../../routes/-workspace-error-report';

const CONTEXT: ReportContext = {
	version: '0.3.0',
	href: 'https://app.example.test/larval-surveillance/habitats',
	time: '2026-08-21T18:00:00.000Z',
	userAgent: 'Mozilla/5.0 (Test)',
};

describe('describeError', () => {
	it('reads name, message, and stack off a real Error', () => {
		const error = new TypeError('Failed to fetch');
		error.stack = 'TypeError: Failed to fetch\n    at loadShape';

		expect(describeError(error)).toEqual({
			name: 'TypeError',
			message: 'Failed to fetch',
			stack: 'TypeError: Failed to fetch\n    at loadShape',
		});
	});

	it('says so rather than showing an empty block when the Error carries no message', () => {
		expect(describeError(new Error('')).message).toBe('The error carried no message.');
	});

	it('takes a thrown string as the message', () => {
		expect(describeError('shape request refused')).toEqual({
			name: 'Error',
			message: 'shape request refused',
			stack: null,
		});
	});

	it.each([
		['undefined', undefined, 'undefined'],
		['null', null, 'null'],
		['an empty string', '', ''],
		['a plain object', { status: 503 }, '[object Object]'],
	])('names the value when %s is thrown', (_label, thrown, rendered) => {
		const details = describeError(thrown);

		expect(details.name).toBe('Unknown error');
		expect(details.message).toBe(`The workspace threw a value that is not an error: ${rendered}`);
		expect(details.stack).toBeNull();
	});
});

describe('joinStacks', () => {
	it('separates the two stacks with a blank line', () => {
		expect(joinStacks('at loadShape', 'at AppShellRoot')).toBe('at loadShape\n\nat AppShellRoot');
	});

	it.each([
		['no error stack', null, 'at AppShellRoot', 'at AppShellRoot'],
		['no component stack', 'at loadShape', undefined, 'at loadShape'],
		['neither', null, undefined, ''],
	])('skips %s', (_label, stack, componentStack, expected) => {
		expect(joinStacks(stack, componentStack)).toBe(expected);
	});
});

describe('buildErrorReport', () => {
	it('carries every fact a support thread needs', () => {
		const report = buildErrorReport(
			{ name: 'TypeError', message: 'Failed to fetch', stack: 'at loadShape' },
			'at AppShellRoot',
			CONTEXT,
		);

		expect(report).toBe(
			[
				'SIMMER 0.3.0 failed to load the workspace.',
				'',
				'Error: TypeError: Failed to fetch',
				'Page: https://app.example.test/larval-surveillance/habitats',
				'Time: 2026-08-21T18:00:00.000Z',
				'Browser: Mozilla/5.0 (Test)',
				'',
				'Stack:',
				'at loadShape',
				'',
				'Component stack:',
				'at AppShellRoot',
			].join('\n'),
		);
	});

	it('leaves out the sections the runtime did not supply', () => {
		const report = buildErrorReport(
			{ name: 'Unknown error', message: 'thrown undefined', stack: null },
			undefined,
			CONTEXT,
		);

		expect(report).not.toContain('Stack:');
		expect(report).not.toContain('Component stack:');
		expect(report).toContain('Error: Unknown error: thrown undefined');
	});
});
