'use client';

import { createFormHook } from '@tanstack/react-form';
import {
	AutocompleteField,
	HiddenField,
	JsonSchemaField,
	MetadataField,
	NumberField,
	SelectField,
	SwitchField,
	TextareaField,
	TextField,
} from './field-components';
import {
	AppFieldGroup,
	FormActions,
	FormErrorAlert,
	ResetButton,
	SubmitButton,
} from './form-components';
import { fieldContext, formContext } from './form-contexts';

export const { useAppForm, withForm, withFieldGroup, useTypedAppFormContext, extendForm } =
	createFormHook({
		fieldContext,
		formContext,
		fieldComponents: {
			AutocompleteField,
			HiddenField,
			JsonSchemaField,
			MetadataField,
			NumberField,
			SelectField,
			SwitchField,
			TextareaField,
			TextField,
		},
		formComponents: {
			AppFieldGroup,
			FormActions,
			FormErrorAlert,
			ResetButton,
			SubmitButton,
		},
	});
