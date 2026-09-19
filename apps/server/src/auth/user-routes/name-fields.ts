/** The optional name fields a payload reader nulled, as the keys WorkOS takes. */
export function nameFields(value: {
	readonly firstName: string | null;
	readonly lastName: string | null;
}): { readonly firstName?: string; readonly lastName?: string } {
	return {
		...(value.firstName === null ? {} : { firstName: value.firstName }),
		...(value.lastName === null ? {} : { lastName: value.lastName }),
	};
}
