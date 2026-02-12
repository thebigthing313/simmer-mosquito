/**
 * create-types-files.ts
 *
 * Reads the Supabase-generated `src/database.types.ts` file using the
 * TypeScript Compiler API (AST-based, not regex) and produces one Zod
 * schema file per table in `src/tables/<table_name>.ts`.
 *
 * Each generated file contains:
 *   - <PascalName>BaseRowSchema  – mirrors the Row type
 *   - <PascalName>InsertSchema   – Row minus audit columns (created_at/by, updated_at/by)
 *   - <PascalName>UpdateSchema   – Insert minus `id`, all fields optional (.partial())
 *
 * Run via:  pnpm generate-types
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { _date } from 'zod/v4/core';

// ─── Configuration ──────────────────────────────────────────────────────────────

/**
 * Custom Zod overrides keyed by a *suffix* (matched via `endsWith`) or an
 * exact field name.  The value is the raw Zod expression string that will be
 * emitted.  Matching order: exact name first, then longest-suffix first.
 *
 * Add entries here to override the default type mapping for specific fields.
 */
const FIELD_OVERRIDES: Record<string, string> = {
	// All timestamp columns coming from Supabase as `string` should become Date
	_at: 'z.coerce.date<Date>()',
	_date: 'z.coerce.date<Date>()',
	_time: 'z.coerce.date<Date>()',

	// UUID primary / foreign keys – Supabase types them as `string`
	_id: 'z.uuid()',
	id: 'z.uuid()',
	_by: 'z.uuid()',

	// user_id is a UUID (e.g. profiles table)
	user_id: 'z.uuid()',
};

/**
 * Fields to completely **omit** from every generated schema.
 * Typically generated / internal Postgres columns that shouldn't be validated.
 */
const IGNORE_FIELDS: string[] = ['geom', 'geojson'];

/**
 * Audit columns that are always stripped from the **Insert** schema.
 * (They still appear in the BaseRow schema.)
 */
const AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by'];

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** snake_case → PascalCase */
function toPascalCase(s: string): string {
	return s
		.split('_')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join('');
}

/**
 * Return the override Zod expression for `fieldName`, or `undefined` if none
 * matches.  Exact-name matches take priority; then we try suffixes from
 * longest to shortest.
 */
function getOverride(fieldName: string): string | undefined {
	if (FIELD_OVERRIDES[fieldName] !== undefined) {
		return FIELD_OVERRIDES[fieldName];
	}

	// Sort suffixes longest-first so "_at" doesn't shadow "_created_at" etc.
	const suffixes = Object.keys(FIELD_OVERRIDES)
		.filter((k) => k.startsWith('_'))
		.sort((a, b) => b.length - a.length);

	for (const suffix of suffixes) {
		if (fieldName.endsWith(suffix)) {
			return FIELD_OVERRIDES[suffix];
		}
	}

	return undefined;
}

// ─── AST Utilities ──────────────────────────────────────────────────────────────

interface FieldInfo {
	name: string;
	tsType: string;
	nullable: boolean;
}

/** Get the name of a property from a PropertySignature node */
function propName(node: ts.PropertySignature): string {
	const { name } = node;
	if (!name) return '';
	if (ts.isIdentifier(name)) return name.text;
	if (ts.isStringLiteral(name)) return name.text;
	return name.getText();
}

/**
 * Serialize a TypeNode back to its source text representation.
 */
function typeToString(
	typeNode: ts.TypeNode,
	sourceFile: ts.SourceFile,
): string {
	return typeNode.getText(sourceFile).trim();
}

/**
 * Walk a TypeLiteralNode (the `{ ... }` body of Row/Insert/etc.) and extract
 * field information.
 */
function extractFields(
	typeLiteral: ts.TypeLiteralNode,
	sourceFile: ts.SourceFile,
): FieldInfo[] {
	const fields: FieldInfo[] = [];

	for (const member of typeLiteral.members) {
		if (!ts.isPropertySignature(member) || !member.type) continue;

		const name = propName(member);
		const tsType = typeToString(member.type, sourceFile);
		const nullable = tsType.includes('| null');

		fields.push({ name, tsType, nullable });
	}

	return fields;
}

/**
 * Find a property by name inside a TypeLiteralNode.
 * Returns the TypeLiteralNode of its value if the value is a type literal.
 */
function findTypeLiteralProperty(
	typeLiteral: ts.TypeLiteralNode,
	name: string,
): ts.TypeLiteralNode | undefined {
	for (const member of typeLiteral.members) {
		if (!ts.isPropertySignature(member)) continue;
		const memberName =
			member.name && ts.isIdentifier(member.name) ? member.name.text : '';
		if (
			memberName === name &&
			member.type &&
			ts.isTypeLiteralNode(member.type)
		) {
			return member.type;
		}
	}
	return undefined;
}

/**
 * Resolve enum values from the Enums type literal in the AST.
 * Returns a Map<enumName, string[]>.
 */
function extractEnums(
	enumsLiteral: ts.TypeLiteralNode,
	_sourceFile: ts.SourceFile,
): Map<string, string[]> {
	const map = new Map<string, string[]>();

	for (const member of enumsLiteral.members) {
		if (!ts.isPropertySignature(member) || !member.type) continue;
		const name = propName(member);
		const values = extractUnionStringValues(member.type);
		if (values.length > 0) {
			map.set(name, values);
		}
	}

	return map;
}

/**
 * Extract string literal values from a union type like: "a" | "b" | "c"
 */
function extractUnionStringValues(typeNode: ts.TypeNode): string[] {
	const values: string[] = [];

	if (ts.isUnionTypeNode(typeNode)) {
		for (const t of typeNode.types) {
			if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) {
				values.push(t.literal.text);
			}
		}
	} else if (
		ts.isLiteralTypeNode(typeNode) &&
		ts.isStringLiteral(typeNode.literal)
	) {
		values.push(typeNode.literal.text);
	}

	return values;
}

// ─── Zod mapping ────────────────────────────────────────────────────────────────

/**
 * Map a field to a Zod expression, applying overrides and type mappings.
 */
function zodExpressionForField(
	field: FieldInfo,
	enumMap: Map<string, string[]>,
): string | null {
	if (IGNORE_FIELDS.includes(field.name)) return null;

	const override = getOverride(field.name);
	if (override !== undefined) {
		return field.nullable ? `${override}.nullable()` : override;
	}

	// Strip nullability for base type resolution
	const baseType = field.tsType.replace(/\s*\|\s*null\s*/g, '').trim();

	let zodBase: string;

	if (baseType === 'string') {
		zodBase = 'z.string()';
	} else if (baseType === 'number') {
		zodBase = 'z.number()';
	} else if (baseType === 'boolean') {
		zodBase = 'z.boolean()';
	} else if (baseType === 'Json') {
		zodBase = 'z.unknown()';
	} else if (baseType === 'unknown') {
		zodBase = 'z.unknown()';
	} else if (baseType.includes('Database') && baseType.includes('Enums')) {
		// e.g. Database["public"]["Enums"]["aerial_inspection_result"]
		const enumMatch = baseType.match(/\["(\w+)"\]\s*$/);
		if (enumMatch?.[1]) {
			const enumName = enumMatch[1];
			const enumValues = enumMap.get(enumName);
			if (enumValues && enumValues.length > 0) {
				zodBase = `z.enum([${enumValues.map((v) => `'${v}'`).join(', ')}])`;
			} else {
				zodBase = 'z.string()';
			}
		} else {
			zodBase = 'z.string()';
		}
	} else {
		// Fallback – treat as string
		zodBase = 'z.string()';
	}

	return field.nullable ? `${zodBase}.nullable()` : zodBase;
}

// ─── Main ───────────────────────────────────────────────────────────────────────

function main() {
	const rootDir = import.meta.dirname;
	const typesFilePath = path.join(rootDir, 'src', 'database.types.ts');
	const outDir = path.join(rootDir, 'src', 'tables');

	if (!fs.existsSync(typesFilePath)) {
		console.error(`❌  database.types.ts not found at ${typesFilePath}`);
		return process.exit(1);
	}

	const sourceText = fs.readFileSync(typesFilePath, 'utf-8');
	const sourceFile = ts.createSourceFile(
		'database.types.ts',
		sourceText,
		ts.ScriptTarget.Latest,
		/* setParentNodes */ true,
	);

	// ── Find the `Database` type alias ──────────────────────────────────────
	let databaseType: ts.TypeLiteralNode | undefined;

	ts.forEachChild(sourceFile, (node) => {
		if (
			ts.isTypeAliasDeclaration(node) &&
			node.name.text === 'Database' &&
			ts.isTypeLiteralNode(node.type)
		) {
			databaseType = node.type;
		}
	});

	if (!databaseType) {
		console.error(
			'❌  Could not find `Database` type alias in database.types.ts',
		);
		return process.exit(1);
	}

	// ── Navigate: Database → public → Tables ────────────────────────────────
	const publicSchema = findTypeLiteralProperty(databaseType, 'public');
	if (!publicSchema) {
		console.error('❌  Could not find `public` schema in Database type');
		return process.exit(1);
	}

	const tablesObj = findTypeLiteralProperty(publicSchema, 'Tables');
	if (!tablesObj) {
		console.error('❌  Could not find `Tables` in public schema');
		return process.exit(1);
	}

	// ── Extract enums ───────────────────────────────────────────────────────
	const enumsObj = findTypeLiteralProperty(publicSchema, 'Enums');
	const enumMap = enumsObj
		? extractEnums(enumsObj, sourceFile)
		: new Map<string, string[]>();

	// ── Iterate over each table ─────────────────────────────────────────────
	interface TableDef {
		name: string;
		fields: FieldInfo[];
	}

	const tables: TableDef[] = [];

	for (const member of tablesObj.members) {
		if (!ts.isPropertySignature(member)) continue;
		const tableName = propName(member);

		// The table value should be a type literal with `Row`, `Insert`, `Update`
		if (!member.type || !ts.isTypeLiteralNode(member.type)) continue;

		const rowLiteral = findTypeLiteralProperty(member.type, 'Row');
		if (!rowLiteral) continue;

		const fields = extractFields(rowLiteral, sourceFile);
		tables.push({ name: tableName, fields });
	}

	if (tables.length === 0) {
		console.error('❌  No tables found in Database.public.Tables');
		return process.exit(1);
	}

	// ── Ensure output directory exists ──────────────────────────────────────
	fs.mkdirSync(outDir, { recursive: true });

	const now = new Date().toISOString();

	// ── Generate one file per table ─────────────────────────────────────────
	for (const table of tables) {
		const pascal = toPascalCase(table.name);

		const baseFields: string[] = [];
		const insertFields: string[] = [];

		for (const field of table.fields) {
			const zodExpr = zodExpressionForField(field, enumMap);
			if (zodExpr === null) continue; // ignored

			baseFields.push(`\t${field.name}: ${zodExpr},`);

			// Insert schema omits audit fields
			if (!AUDIT_FIELDS.includes(field.name)) {
				insertFields.push(`\t${field.name}: ${zodExpr},`);
			}
		}

		const hasAuditFields = table.fields.some((f) =>
			AUDIT_FIELDS.includes(f.name),
		);
		const hasIdField = table.fields.some((f) => f.name === 'id');

		let fileContent = `// Auto-generated by create-types-files.ts — ${now}\n`;
		fileContent += `// Do not edit manually.\n\n`;
		fileContent += `import z from 'zod';\n\n`;

		// ── BaseRowSchema ───────────────────────────────────────────────────
		fileContent += `export const ${pascal}BaseRowSchema = z.object({\n`;
		fileContent += baseFields.join('\n');
		fileContent += `\n});\n`;
		fileContent += `\nexport type ${pascal}BaseRow = z.infer<typeof ${pascal}BaseRowSchema>;\n`;

		// ── InsertSchema ────────────────────────────────────────────────────
		if (hasAuditFields) {
			fileContent += `\n`;
			fileContent += `export const ${pascal}InsertSchema = z.object({\n`;
			fileContent += insertFields.join('\n');
			fileContent += `\n});\n`;
		} else {
			fileContent += `\n`;
			fileContent += `export const ${pascal}InsertSchema = ${pascal}BaseRowSchema;\n`;
		}
		fileContent += `\nexport type ${pascal}Insert = z.infer<typeof ${pascal}InsertSchema>;\n`;

		// ── UpdateSchema ────────────────────────────────────────────────────
		if (hasIdField) {
			fileContent += `\n`;
			fileContent += `export const ${pascal}UpdateSchema = ${pascal}InsertSchema.omit({ id: true }).partial();\n`;
		} else {
			fileContent += `\n`;
			fileContent += `export const ${pascal}UpdateSchema = ${pascal}InsertSchema.partial();\n`;
		}
		fileContent += `\nexport type ${pascal}Update = z.infer<typeof ${pascal}UpdateSchema>;\n`;

		const outFile = path.join(outDir, `${table.name}.ts`);
		fs.writeFileSync(outFile, fileContent, 'utf-8');
		console.log(`  ✔  ${table.name}.ts`);
	}

	console.log(`\n✅  Generated ${tables.length} schema files in src/tables/`);
}

main();
