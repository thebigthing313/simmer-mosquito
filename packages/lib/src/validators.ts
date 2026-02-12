import z from 'zod';

export const ValidEmailSchema = z.email('Please enter a valid email address');
export const ValidUUIDSchema = z.uuid('This field is required.');
export const ValidStringSchema = (min?: number, max?: number) => {
	let schema = z.string('This field is required.');
	if (min !== undefined) {
		schema = schema.min(
			min,
			`This field must be at least ${min} characters long.`,
		);
	}
	if (max !== undefined) {
		schema = schema.max(
			max,
			`This field must be at most ${max} characters long.`,
		);
	}
	return schema;
};
export const ValidURLSchema = z.url('Please enter a valid URL');
