import type { useCreateFoundation } from '../../hooks/mutations/use-create-foundation';

export type CreateFoundation = ReturnType<typeof useCreateFoundation>;

/** Runs the write, says whether it landed, and closes the dialog when it did. */
export type SubmitFoundation = (label: string, action: () => Promise<unknown>) => Promise<void>;

/** A name every kind requires, worded for the thing being added. */
export function requiredName(noun: string) {
	return ({ value }: { readonly value: string }) =>
		value.trim() === '' ? `${noun} is required.` : undefined;
}

/**
 * Non-empty sentinels. An optional select cannot carry an empty option value:
 * `SelectField` reads one as Radix resetting itself and drops it.
 */
export const UNFILED = 'unfiled';

export const NONE = 'none';

/** The `<form>` every foundation kind submits through. */
export function FoundationFormShell({
	onSubmit,
	children,
}: {
	readonly onSubmit: () => void;
	readonly children: React.ReactNode;
}) {
	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			{children}
		</form>
	);
}
