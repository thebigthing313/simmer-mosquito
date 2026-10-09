import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { useState } from 'react';
import { watchWrite } from '../../components/my-organization/helpers';

export interface SettingsSheetOptions<Values, Payload> {
	/** The values the sheet opens with. Read again every time it opens. */
	readonly values: Values;
	/** The write's input, from what the sheet holds. Throws on a value it cannot convert. */
	readonly convert: (values: Values) => Payload;
	readonly write: (payload: Payload) => Promise<unknown>;
	/** The toast's words when a refused write carries no reason of its own. */
	readonly failureMessage: string;
}

/**
 * A My Organization settings sheet's form and open state. Submitting converts
 * the values, closes the sheet and starts the write; a conversion that throws
 * leaves the sheet open with the message in the form's error alert, and a
 * write that fails afterwards is reported as a toast. Opening resets the form
 * to `values`.
 */
export function useSettingsSheet<Values, Payload>({
	values,
	convert,
	write,
	failureMessage,
}: SettingsSheetOptions<Values, Payload>) {
	const [open, setOpen] = useState(false);
	const form = useAppForm({
		defaultValues: values,
		onSubmit: ({ value }) => {
			const payload = convert(value);
			setOpen(false);
			watchWrite(write(payload), failureMessage);
		},
	});

	function changeOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(values);
		}
		setOpen(nextOpen);
	}

	return { form, open, changeOpen };
}

/** The form a settings sheet hands its body. */
export type SettingsSheetForm<Values> = ReturnType<
	typeof useSettingsSheet<Values, unknown>
>['form'];
