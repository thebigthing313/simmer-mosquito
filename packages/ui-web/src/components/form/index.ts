/**
 * The SIMMER form kit: a TanStack Form hook pre-bound to field and form
 * components built from this package's primitives.
 *
 * `useAppForm` is the entry point. Its `fieldContext`/`formContext` are created
 * once, here, and shared by every app that mounts a form — which is the reason
 * this is a package rather than a copy per app: two `createFormHookContexts()`
 * calls would produce two context identities, and a field rendered under the
 * wrong one throws at runtime rather than at compile time.
 *
 * Nothing here knows about a domain. Validation that depends on SIMMER's command
 * builders stays in the app that owns the command — see
 * `apps/web/src/forms/domain-validation.ts`.
 */

export { useAppForm } from './app-form';
export {
	AutocompleteField,
	asMetadataValue,
	customFieldCount,
	customFieldDescriptors,
	customFieldEntries,
	customSchemaFor,
	type FieldOption,
	formatCustomFieldValue,
	HiddenField,
	JsonSchemaField,
	type JsonSchemaValue,
	MetadataField,
	type MetadataValue,
	MultiSelectField,
	NumberField,
	SelectField,
	SwitchField,
	TextareaField,
	TextField,
	UrlField,
	validateJsonSchemaValue,
	validateMetadataValue,
	validateSchemaMetadata,
} from './field-components';
export {
	AppFieldGroup,
	FormActions,
	FormErrorAlert,
	RecordFormPage,
	ResetButton,
	SubmitButton,
} from './form-components';
export type { RecordFormHeader } from './form-components/record-form-page';
export { errorMessagesFrom, type FieldErrorMessage } from './form-errors';
export { RequiredMark } from './required-mark';
