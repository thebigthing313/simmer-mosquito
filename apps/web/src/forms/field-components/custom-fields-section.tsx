import {
	customFieldCount,
	customSchemaFor,
	FormSection,
	type MetadataValue,
	validateSchemaMetadata,
} from '@simmer-mosquito/ui-web/components/form';

/** One lookup row a schema may be read off, as `customSchemaFor` takes it. */
interface CustomSchemaRow {
	readonly id: string;
	readonly customSchema?: unknown;
}

/** The section heading, for the five forms that group their fields into sections. */
const customFieldsTitle = 'Custom Fields';

/** The field's own label, for the three forms that use no sections. */
const metadataLabel = 'Metadata';

/** What a method's custom fields are, said once for all five method forms. */
const methodFieldsDescription = 'Extra details you collect for this method.';

/**
 * The metadata editor every record form ends up wanting, in the three shapes
 * this app actually renders it in.
 *
 * `ui-web` owns the editor. What it cannot know is where the schema comes from:
 * an organization declares its custom fields on a method or a type, so the
 * schema a record form edits under is chosen by another field on the same form.
 * That subscription is the one thing this adds, and it is why the module sits
 * here rather than in the kit (ADR 0006).
 *
 * Five forms held a byte-identical copy of it, description string included, and
 * two more held the manual editor with only their own copy differing. The three
 * shapes are now parameters:
 *
 * - a schema chosen by a method field, which renders nothing when the method
 *   declares no fields;
 * - the same, plus {@link allowExtra}, which is the habitat form;
 * - manual mode, with no catalog, which is the region and weather forms.
 *
 * The early return is a consequence of {@link allowExtra} rather than a fourth
 * parameter: with ad-hoc keys refused there is nothing to type into a schema
 * that declares no fields, and with them allowed the editor is still an editor.
 *
 * The `form` is untyped for the reason `FirstCommentSection`'s is: `useAppForm`
 * returns no exported instance type, and a generic here would infer from one
 * position and check nothing.
 */
export function CustomFieldsSection({
	form,
	catalog,
	schemaField,
	allowExtra = false,
	framed = true,
	description = methodFieldsDescription,
	emptyDescription,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	/**
	 * The lookup rows the schema is read off, usually the organization's method
	 * or type catalog. Omitted for manual mode, which has no schema.
	 */
	readonly catalog?: readonly CustomSchemaRow[];
	/** The form field naming the catalog row. Required alongside {@link catalog}. */
	readonly schemaField?: string;
	/**
	 * Accept keys the schema never declared, and keep rendering when it declares
	 * none. The habitat form is the only surface that does, so a habitat can
	 * carry notes its type never asked for.
	 */
	readonly allowExtra?: boolean;
	/** Render inside a `Custom Fields` section rather than as a labelled field. */
	readonly framed?: boolean;
	/** What the fields are, shown when the schema declares some. */
	readonly description?: string;
	/** What they are when it declares none. Only reached under {@link allowExtra}. */
	readonly emptyDescription?: string;
}) {
	if (catalog === undefined || schemaField === undefined) {
		return (
			<MetadataBox
				description={description}
				form={form}
				framed={framed}
				mode={{ kind: 'manual' }}
			/>
		);
	}

	return (
		<form.Subscribe
			selector={(state: { values: Record<string, string | null> }) => state.values[schemaField]}
		>
			{(schemaId: string | null) => {
				const schema = customSchemaFor(catalog, schemaId ?? null);
				const declaresFields = customFieldCount(schema) > 0;
				if (!(declaresFields || allowExtra)) {
					return null;
				}
				return (
					<MetadataBox
						description={declaresFields ? description : (emptyDescription ?? description)}
						form={form}
						framed={framed}
						mode={{ kind: 'schema', schema, allowExtra }}
						validate={validateSchemaMetadata(schema)}
					/>
				);
			}}
		</form.Subscribe>
	);
}

/**
 * What the editor is rendering under. The kit's own `MetadataMode` is not
 * exported, and this is the half of it these three shapes reach.
 */
type MetadataBoxMode =
	| { readonly kind: 'manual' }
	| { readonly kind: 'schema'; readonly schema: MetadataValue; readonly allowExtra: boolean };

/** The editor itself, bound to the form's `metadata` field. */
function MetadataBox({
	form,
	description,
	framed,
	mode,
	validate,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly description: string;
	readonly framed: boolean;
	readonly mode: MetadataBoxMode;
	readonly validate?: ReturnType<typeof validateSchemaMetadata>;
}) {
	const field = (
		<form.AppField
			name="metadata"
			{...(validate === undefined ? {} : { validators: { onSubmit: validate } })}
		>
			{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
			{(bound: any) => (
				<bound.MetadataField
					description={description}
					{...(framed ? {} : { label: metadataLabel })}
					mode={mode}
				/>
			)}
		</form.AppField>
	);

	return framed ? <FormSection title={customFieldsTitle}>{field}</FormSection> : field;
}
