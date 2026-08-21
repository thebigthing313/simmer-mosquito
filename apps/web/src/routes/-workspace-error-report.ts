/**
 * What the workspace error surface knows about a thrown value, and the plain
 * text report it hands to the clipboard.
 *
 * These are separate from the component because they are the part that has to be
 * right. The surface renders once, when the app is already broken, so nobody
 * clicks through it twice to check it: `describeError` runs against values a
 * boundary can genuinely catch, and `buildErrorReport` takes its page context as
 * an argument rather than reading `window`, so both are provable in a test.
 */

export interface ErrorDetails {
	readonly name: string;
	readonly message: string;
	readonly stack: string | null;
}

/** Page context stamped into a copied report. */
export interface ReportContext {
	readonly version: string;
	readonly href: string;
	readonly time: string;
	readonly userAgent: string;
}

/**
 * `errorComponent` is typed as receiving an `Error`, but a boundary catches
 * whatever was thrown. A string, a rejected object, `undefined` from a bare
 * `throw`: all of them reach the surface, and none of them have a `.message`.
 */
export function describeError(error: unknown): ErrorDetails {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message === '' ? 'The error carried no message.' : error.message,
			stack: error.stack ?? null,
		};
	}

	return describeThrownValue(error);
}

function describeThrownValue(error: unknown): ErrorDetails {
	if (typeof error === 'string' && error !== '') {
		return { name: 'Error', message: error, stack: null };
	}

	// `String('')` is empty, and naming the value would leave the sentence hanging
	// on its colon. An empty string carries no more than a bare `throw` does, so
	// both land on the same line.
	const rendered = String(error);

	return {
		name: 'Unknown error',
		message:
			rendered === ''
				? 'The workspace threw a value that is not an error, and it was empty.'
				: `The workspace threw a value that is not an error: ${rendered}`,
		stack: null,
	};
}

/** The two stacks as one block, skipping whichever the runtime did not supply. */
export function joinStacks(stack: string | null, componentStack: string | undefined): string {
	return [stack, componentStack].filter((part) => Boolean(part)).join('\n\n');
}

export function buildErrorReport(
	details: ErrorDetails,
	componentStack: string | undefined,
	context: ReportContext,
): string {
	const lines = [
		`SIMMER ${context.version} failed to load the workspace.`,
		'',
		`Error: ${details.name}: ${details.message}`,
		`Page: ${context.href}`,
		`Time: ${context.time}`,
		`Browser: ${context.userAgent}`,
	];

	if (details.stack !== null) {
		lines.push('', 'Stack:', details.stack);
	}

	if (componentStack !== undefined) {
		lines.push('', 'Component stack:', componentStack);
	}

	return lines.join('\n');
}
