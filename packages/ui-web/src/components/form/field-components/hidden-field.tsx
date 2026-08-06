'use client';

import { useFieldContext } from '../form-contexts';

export function HiddenField() {
	const field = useFieldContext<unknown>();

	return <input name={field.name} type="hidden" value={String(field.state.value ?? '')} />;
}
