import type { AuthOrganizationChoice } from '../client/outcomes.js';

export function readOrganizationChoices(value: unknown): readonly AuthOrganizationChoice[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const choices: AuthOrganizationChoice[] = [];
	for (const entry of value) {
		if (typeof entry === 'object' && entry !== null) {
			const id = (entry as { id?: unknown }).id;
			const name = (entry as { name?: unknown }).name;
			if (typeof id === 'string') {
				choices.push({ id, name: typeof name === 'string' ? name : id });
			}
		}
	}

	return choices;
}
