/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormulationCatalog } from '../../../../../components/control-operations/chemical/formulation-catalog';
import { FormulationSection } from '../../../../../components/control-operations/chemical/formulation-section';
import type { InsecticideCatalog } from '../../../../../components/control-operations/chemical/insecticide-catalog';
import { InsecticideSection } from '../../../../../components/control-operations/chemical/insecticide-section';
import type { FormulationMutations } from '../../../../../hooks/mutations/use-formulation-mutations';
import type { InsecticideMutations } from '../../../../../hooks/mutations/use-insecticide-mutations';
import type {
	FormulationComponentRecord,
	FormulationRecord,
} from '../../../../../hooks/queries/use-formulation-records';
import type { InsecticideRecord } from '../../../../../hooks/queries/use-insecticide-records';
import type { UnitLabel } from '../../../../../hooks/queries/use-unit-labels';

afterEach(cleanup);

const gallon: UnitLabel = {
	abbreviation: 'gal',
	code: 'gallon',
	id: 'unit-gallon',
	unitName: 'Gallon',
	unitType: 'volume',
} as UnitLabel;

const vectobac: InsecticideRecord = {
	activeIngredient: 'Bti',
	defaultUnitId: gallon.id,
	id: 'insecticide-vectobac',
	isActive: true,
	labelUrl: null,
	metadata: { lot: 'A' },
	msdsUrl: null,
	registrationNumber: '73049-38',
	shorthand: 'VectoBac',
	tradeName: 'VectoBac 12AS',
	type: 'larvicide',
};

function insecticideCatalog(setActive = vi.fn(() => Promise.resolve())): InsecticideCatalog {
	return {
		allProducts: [vectobac],
		batchMutations: {} as InsecticideCatalog['batchMutations'],
		batchTrackingEnabled: true,
		canManage: true,
		mutations: { canWrite: true, setActive } as unknown as InsecticideMutations,
		units: [gallon],
	};
}

const emptyMix: FormulationRecord = {
	batchSize: 26,
	batchUnitId: gallon.id,
	description: null,
	formulationName: 'Adulticide tank mix',
	id: 'formulation-tank',
	isActive: false,
};

function formulationCatalog(): FormulationCatalog {
	return {
		canManage: true,
		componentsByFormulation: new Map<string, readonly FormulationComponentRecord[]>(),
		insecticideById: new Map([[vectobac.id, vectobac]]),
		insecticides: [vectobac],
		mutations: { canWrite: true, setActive: vi.fn() } as unknown as FormulationMutations,
		unitById: new Map([[gallon.id, gallon]]),
		units: [gallon],
	};
}

function openMenu(name: string) {
	fireEvent.pointerDown(
		screen.getByRole('button', { name: `Actions for ${name}` }),
		new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
	);
}

/**
 * Insecticides and Formulations expand into a second tier, and that was never
 * a reason for a different row (#1666): they carry the row menu, the
 * Active/Inactive sections and the name-cell badge every other catalog has.
 */
describe('a catalog whose rows expand', () => {
	it('puts edit and the reversible retire behind the row menu, not inline', () => {
		const setActive = vi.fn(() => Promise.resolve());
		render(
			<InsecticideSection
				catalog={insecticideCatalog(setActive)}
				emptyLabel="unused"
				rows={[vectobac]}
				title="Active"
				tone="active"
			/>,
		);

		expect(screen.queryByRole('button', { name: /^Deactivate/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull();

		openMenu('VectoBac 12AS');
		expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeTruthy();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Deactivate' }));
		expect(setActive).toHaveBeenCalledWith(vectobac.id, false);
	});

	it('draws no Status or Metadata column', () => {
		render(
			<InsecticideSection
				catalog={insecticideCatalog()}
				emptyLabel="unused"
				rows={[vectobac]}
				title="Active"
				tone="active"
			/>,
		);
		const heads = screen.getAllByRole('columnheader').map((head) => head.textContent);

		expect(heads).not.toContain('Status');
		expect(heads).not.toContain('Metadata');
		expect(screen.queryByText('Configured')).toBeNull();
	});

	it('heads the rows with the lifecycle side and its count, as the other catalogs do', () => {
		render(
			<FormulationSection
				catalog={formulationCatalog()}
				emptyLabel="unused"
				rows={[emptyMix]}
				title="Inactive"
				tone="inactive"
			/>,
		);

		expect(screen.getByRole('heading', { name: 'Inactive' })).toBeTruthy();
		const row = screen.getByRole('row', { name: /Adulticide tank mix/ });
		expect(within(row).getByText('Inactive')).toBeTruthy();
		expect(screen.queryByRole('columnheader', { name: 'Status' })).toBeNull();
	});

	// A mix with no products has nothing to expand into applications, so its
	// first activation stays unavailable, now as a menu item with the reason.
	it('keeps an empty mix from being activated, and says why', () => {
		render(
			<FormulationSection
				catalog={formulationCatalog()}
				emptyLabel="unused"
				rows={[emptyMix]}
				title="Inactive"
				tone="inactive"
			/>,
		);
		openMenu('Adulticide tank mix');

		const activate = screen.getByRole('menuitem', { name: 'Activate' });
		expect(activate.getAttribute('aria-disabled')).toBe('true');
		expect(screen.getByText('Add a product first')).toBeTruthy();
	});
});
