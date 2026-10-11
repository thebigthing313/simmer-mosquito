import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import type { DrawLocation } from '../map/use-draw-location';

/** A form-level `onSubmit` validator, such as one `domainValidator` returns. */
type RecordFormValidate<TValues> = (input: { readonly value: TValues }) => unknown;

export interface RecordFormOptions<TValues> {
	readonly defaultValues: TValues;
	/** The form's rules, run on submit. Usually the domain builder through `domainValidator`. */
	readonly validate: RecordFormValidate<TValues>;
	/** The form's map location, for a record that has one. Its missing shape refuses the save. */
	readonly location?: DrawLocation | undefined;
	/**
	 * Whether these values need a shape on the map. Left out, they always do.
	 * The inspection and collection forms need one only in ad hoc mode.
	 */
	readonly needsShape?: ((value: TValues) => boolean) | undefined;
	/** Runs once the values pass and the shape, where one is needed, is drawn. */
	readonly onSubmit: (value: TValues) => Promise<void>;
}

/**
 * A record form's `useAppForm`: the validator, and the missing-shape check
 * for a form with a map, reported in the same pass as a refused field.
 */
export function useRecordForm<TValues>({
	defaultValues,
	validate,
	location,
	needsShape,
	onSubmit,
}: RecordFormOptions<TValues>) {
	const checkShape = (value: TValues): boolean => {
		if (location === undefined) {
			return true;
		}
		if (needsShape !== undefined && !needsShape(value)) {
			location.clearError();
			return true;
		}
		return location.requireGeometry();
	};

	return useAppForm({
		defaultValues,
		validators: { onSubmit: validate },
		onSubmitInvalid: ({ value }) => {
			checkShape(value);
		},
		onSubmit: async ({ value }) => {
			if (!checkShape(value)) {
				return;
			}
			await onSubmit(value);
		},
	});
}
