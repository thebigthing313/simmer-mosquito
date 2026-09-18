/** The name fields, with the undefined ones left off the object. */
export function personNameFields(input: {
	readonly firstName?: string;
	readonly lastName?: string;
}): { readonly firstName?: string; readonly lastName?: string } {
	return {
		...(input.firstName === undefined ? {} : { firstName: input.firstName }),
		...(input.lastName === undefined ? {} : { lastName: input.lastName }),
	};
}
