import { FormSection } from '@simmer-mosquito/ui-web/components/form';

/**
 * The box every create form ends with, bound to that form's `comment` field.
 *
 * It renders nothing on an edit. The gate lives here rather than at the six
 * call sites so the create-only rule is stated once: a form that forgets it
 * would append a new comment on every save (see `useRecordExtras`).
 *
 * The copy lives here because this is the only thing that renders it.
 *
 * The `form` is untyped for the same reason the service request form's
 * subcomponents are: `useAppForm` returns no exported instance type, and a
 * generic here would infer from one position and check nothing.
 */
/** Section heading. Plural because the record's thread is what it opens. */
const firstCommentTitle = 'Comments';

const firstCommentLabel = 'Comment';

const firstCommentDescription = 'Saved as the first comment on this record.';

const firstCommentPlaceholder = 'Add a note for this record…';

export function FirstCommentSection({
	form,
	mode,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly mode: 'create' | 'edit';
}) {
	if (mode === 'edit') {
		return null;
	}
	return (
		<FormSection title={firstCommentTitle}>
			<form.AppField name="comment">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<field.TextareaField
						description={firstCommentDescription}
						label={firstCommentLabel}
						placeholder={firstCommentPlaceholder}
						rows={3}
					/>
				)}
			</form.AppField>
		</FormSection>
	);
}
