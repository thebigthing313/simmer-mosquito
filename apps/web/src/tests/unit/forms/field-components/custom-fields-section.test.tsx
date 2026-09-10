/** @vitest-environment jsdom */
/**
 * The three shapes the record forms render the metadata editor in.
 *
 * Eight forms held this block and nothing rendered any of them. The case worth
 * holding is the early return: a method that declares no custom fields draws no
 * section at all, while the habitat form draws its editor either way because it
 * accepts keys the type never declared. Those two answers used to sit in
 * separate copies, so nothing said they were the same rule read twice.
 */
import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CustomFieldsSection } from '../../../../forms/field-components/custom-fields-section';

/** The flat shape the schema editor writes, one declared text field. */
const CATALOG = [
	{
		id: 'method-1',
		customSchema: { waterDepth: { label: 'Water Depth', order: 0, type: 'text' } },
	},
	{ id: 'method-2', customSchema: null },
];

// This app's vitest run sets no globals, so nothing unmounts a render for us.
afterEach(cleanup);

function Harness({
	methodId,
	...section
}: {
	readonly methodId?: string | null;
	readonly catalog?: readonly { readonly id: string; readonly customSchema?: unknown }[];
	readonly schemaField?: string;
	readonly allowExtra?: boolean;
	readonly framed?: boolean;
	readonly description?: string;
	readonly emptyDescription?: string;
}) {
	const form = useAppForm({ defaultValues: { metadata: null, methodId: methodId ?? null } });
	return (
		<form.AppForm>
			<CustomFieldsSection form={form} {...section} />
		</form.AppForm>
	);
}

describe('a schema chosen by a method field', () => {
	it('renders the declared field under its section', () => {
		render(<Harness catalog={CATALOG} methodId="method-1" schemaField="methodId" />);

		expect(screen.getByText('Custom Fields')).toBeTruthy();
		expect(screen.getByText('Water Depth')).toBeTruthy();
		expect(screen.getByText('Extra details you collect for this method.')).toBeTruthy();
	});

	it('renders nothing when the method declares no fields', () => {
		render(<Harness catalog={CATALOG} methodId="method-2" schemaField="methodId" />);

		expect(screen.queryByText('Custom Fields')).toBeNull();
	});

	it('renders nothing when no method is chosen', () => {
		render(<Harness catalog={CATALOG} methodId={null} schemaField="methodId" />);

		expect(screen.queryByText('Custom Fields')).toBeNull();
	});
});

describe('a schema that accepts extra keys', () => {
	it('renders the declared field and its own copy', () => {
		render(
			<Harness
				allowExtra
				catalog={CATALOG}
				description="Fields this habitat type collects, plus any notes of your own."
				emptyDescription="Optional structured notes for habitat details of your own."
				framed={false}
				methodId="method-1"
				schemaField="methodId"
			/>,
		);

		expect(screen.getByText('Metadata')).toBeTruthy();
		expect(screen.getByText('Water Depth')).toBeTruthy();
		expect(
			screen.getByText('Fields this habitat type collects, plus any notes of your own.'),
		).toBeTruthy();
	});

	it('still renders when the type declares no fields, under the empty copy', () => {
		render(
			<Harness
				allowExtra
				catalog={CATALOG}
				description="Fields this habitat type collects, plus any notes of your own."
				emptyDescription="Optional structured notes for habitat details of your own."
				framed={false}
				methodId="method-2"
				schemaField="methodId"
			/>,
		);

		expect(screen.getByText('Metadata')).toBeTruthy();
		expect(
			screen.getByText('Optional structured notes for habitat details of your own.'),
		).toBeTruthy();
	});
});

describe('manual mode', () => {
	it('renders the labelled editor with no catalog and no section', () => {
		render(<Harness description="Optional structured notes." framed={false} />);

		expect(screen.getByText('Metadata')).toBeTruthy();
		expect(screen.getByText('Optional structured notes.')).toBeTruthy();
		expect(screen.queryByText('Custom Fields')).toBeNull();
	});
});
