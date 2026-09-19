#!/usr/bin/env node
/**
 * Holds what `apps/web` calls each record type to one register.
 *
 * `RECORD_NOUNS` in `apps/web/src/lib/record-nouns.ts` says what a record type
 * is called in the four shapes a screen asks for, keyed by the camelCase
 * domain vocabulary. Six components used to take a free-text noun instead and
 * every route spelled it at each call site, so one record type carried as many
 * spellings as it had call sites and seven of them disagreed with themselves: a
 * chemical application was an `application` in its result count and a `chemical
 * application` in its heading, a biocontrol action counted `releases`, an
 * outreach action counted `actions`, a weather station counted `stations`, and
 * a request for control and a service request both counted plain `requests`,
 * which is one word for two records on two surfaces a person moves between
 * (#894).
 *
 * Run it with `pnpm check:record-nouns`.
 *
 * ## What the compiler already holds, and what is left here
 *
 * Membership is the compiler's. The register is a `Record<RecordType, ...>`
 * over the domain's own `CommentTargetType` plus three widenings, and each of
 * the six components takes a `recordType` typed to that union, so a missing,
 * doubled or misspelled record type fails `tsc`. That is #644's shape and it
 * leaves this gate one question: is the noun written out again anywhere else.
 *
 * ## Four rules
 *
 * The register is whole: every entry carries all four forms, none empty, each
 * plural differs from the singular it pairs with, and **no two record types
 * share a form**.
 * That last one is the collision the sweep found rather than a tidiness rule:
 * `request` was the count noun for both a service request and a request for
 * control, and a person moving between those two surfaces read the same word
 * for two different records.
 *
 * Each of `NOUN_CONSUMERS` exists, declares the register-driven prop it is
 * listed with, and is passed no `noun` attribute at any call site. A component
 * on the list that no longer exists fails, so the list cannot go stale past a
 * rename.
 *
 * No module under `apps/web/src` writes a register form again, as a string
 * literal under a key or as a run of JSX text between two tags.
 *
 * ## The fourth rule, which is what the compiler cannot hold
 *
 * A literal written under the key `recordType` is one of the register's keys.
 * `tsc` holds that for every module that types the prop as `RecordType`, and
 * what it cannot see is a module that types it as `string`: `DetailPageHeader`
 * took the eyebrow's display text under the register's own prop name for
 * fourteen pages, `Biocontrol` and `Larval sample` beside `recordType="region"`
 * on the component next to it, and every gate stayed green because `title` is
 * deliberately not a `NOUN_KEYS` member and a display string is not a key
 * (#1020). So the gate reads the key by name rather than the prop by type,
 * over every string literal in the corpus, and a `recordType: 'Biocontrol'` is
 * a finding whatever the prop it feeds is declared as.
 *
 * `RecordRegionsBand` is the one reader whose `recordType` is a different
 * vocabulary, `RegionMembershipRecordType`, the table names ADR 0015's endpoint
 * takes, and the domain names the prop that way. Its entry in `NOUN_CONSUMERS`
 * says so under `keys`, and a literal inside its tag is read against that
 * list, which the gate reads out of the register the band declares rather than
 * spelling here.
 *
 * ## Why the corpus is both extensions
 *
 * It read `.tsx` alone until #968, and the three cleanup configs are what that
 * cost. `RECORD_CLEANUP_CONFIGS` wrote a `noun: { one, many }` pair for an
 * address, a habitat and a contact, which is the register a second time for
 * three of its twenty record types, and the page heading beside it read
 * `titleMany` out of the register: one page named its record two ways under a
 * clean summary line. The depth was never the problem, which is worth reading
 * before changing `keyBefore`. A literal under `noun: { one: 'address' }` is
 * read at `one`, `one` is a `NOUN_KEYS` name, and the probe pair says so. The
 * file is `record-cleanup-config.ts`, and nothing was looking at it.
 *
 * So the walk takes `.ts` too, 396 modules beside the 321 `.tsx`, and it found
 * exactly two things past the six this issue came for: `SEED_PARAMS` in
 * `components/search/search-seeds.ts` spelled `habitat` and `trap` for the
 * palette's pick step. Both now name a record type and read the register, which
 * is the same fix the configs took.
 *
 * The JSX half stays on `.tsx`, which is the one thing the extension decides
 * here. A bare `>` opens a run for `copyStrings` and a `.ts` module writes
 * plenty of them, so the run corpus is the files that can hold a run.
 *
 * ## What a noun literal is, and what it deliberately is not
 *
 * A string literal whose **whole** text is exactly one of the register's forms,
 * given under one of `NOUN_KEYS`. Both halves are the rule, and both are
 * narrower than they could be for reasons measured rather than assumed.
 *
 * Whole and exact, because a register form inside a longer sentence is
 * English. "No batches have been linked to this application" names the record
 * inside a page whose heading has already named it, and #894's own triage says
 * those read as prose and are not a second name. Case-sensitive because the
 * register now carries both cases of the plural and they are two different
 * answers: `traps` is the count noun in "3 traps" and `Traps` is the heading
 * over the list, so folding the case would report one where the other is right
 * and say nothing about which.
 *
 * `NOUN_KEYS` is an allowlist of five rather than a denylist, because the
 * denylist was measured first and does not work. A register form is an ordinary
 * discriminator all over this app: `recordType="region"`, `kind: 'habitat'`,
 * `entity_type: 'habitat'`, `route_type: 'habitat'`. Scanning every copy
 * position reports 430 of those. Widening the keys to `label` and `title`
 * reports 102 more, nearly all of them a field label naming a record, as in a
 * Details row reading `Habitat` above a link.
 *
 * So `title` stays out and `titleMany` is in, and **the line between them is
 * what the text sits over rather than who owns the records**: a title-cased
 * plural names a list of records and reads the register whoever owns them, and
 * a title-cased singular names one field and does not. #974 settled that
 * against the ownership reading, which would have let a heading over *linked*
 * records keep its own spelling. `JSX_FORM_NAMES` carries the measurement and
 * the two components that made ownership unstatable.
 *
 * #965 then took the key out of that sentence. `KEY_FREE_FORM_NAME` is the
 * title-cased plural read under **any key at all**, which is what the JSX half
 * had been doing since #966 and what the keyed half was asking differently of
 * the same string: an explorer heading under `title`, a back link under
 * `backLabel` and a sidebar entry under `label` are one idea written at three
 * keys, and a key list cannot name them without also taking the 56 singular
 * field labels beside them. That module's docblock carries the measurement.
 *
 * So what is left of the key rule is the five keys the components' contracts
 * are written in, for the three forms a discriminator can collide with, and the
 * gate is at zero with no allowance list and no marker vocabulary. A call site
 * wanting an exemption is a call site wanting its own spelling.
 *
 * The tests trees are out, which is `check:vocabulary`'s answer rather than
 * `check:map-palette`'s. `ResultMeta` takes a `CountNoun` pair, because a
 * surface may count something that is not a record, and the suite covering it
 * has to build one; a gate reading the suites would refuse the test that proves
 * the component works.
 *
 * `apps/admin` and `apps/mobile` are out, which is #894's own scope line: the
 * register is a web module until a second app needs it. Admin writes `title:
 * 'Contact'` and `label: 'Address'` about its own foundations screens, and
 * those are its copy rather than this register's.
 *
 * ## What no widening of this reaches, measured
 *
 * Every rule here compares a piece of copy against a **register form**, so what
 * it refuses is a second copy of the register's spelling. A string saying a
 * word the register does not carry is invisible to all of it, and #940 was
 * three of those: two toasts on the chemical create route and the mix preview
 * above the form counted `applications` where the register says `chemical
 * applications`.
 *
 * The brief blamed interpolation and that is not the mechanism. `copyStrings`
 * contributes a template's fixed chunks, so ` applications.` arrives here as a
 * literal and is read; it matches nothing because `applications` is not a form.
 * Trimming a chunk before matching changes nothing either, measured over the
 * 716 modules: 18 chunks trim to a form and **0** of them become findings,
 * because every one is a title-cased singular or a lowercase plural under a key
 * `NOUN_KEYS` does not carry.
 *
 * Reaching a divergent spelling needs a rule over the **tail word** of a
 * multi-word form, `applications` out of `chemical applications`, and the four
 * shapes of that were measured before being dropped. A form as a substring of
 * any copy is 1,425 findings. A tail word anywhere in any copy is 539. A tail
 * word opening a piece of copy is 156, and a whole text that is exactly a tail
 * word is 92, nearly all of them the discriminator class #894 declined. The
 * narrowest, a template chunk or a run opening on a tail word, is 6, and 4 of
 * the 6 are English rather than a record name: `Request a new link`, `Control
 * actions`, `Control type`, and the ` request failed (` chunk in
 * `use-paged-map-resource.ts`. After #940's fix that rule ships at one finding
 * needing the first marker this gate has ever had, to guard a class with no
 * members, so the fix is at the call site instead: `recordCount` in the
 * register module, which the three now call.
 *
 * ## The other half of the corpus: a run of JSX text
 *
 * `copyStrings` has read the text between two tags since `check:vocabulary`
 * needed it, and this gate was throwing it away: every run came back under no
 * key, `NOUN_KEYS` answered no, and a record's name written between two tags
 * was invisible. Two `Import Regions` labels sat that way while the sidebar
 * entry beside them read `titleMany` out of the register (#966), and a fix to
 * those two would have left the next copy exactly as invisible.
 *
 * So a run joins the corpus and is asked the whole-and-exact question the
 * literals are asked, against `JSX_FORM_NAMES` rather than against all four.
 * That is the departure worth reading: `NOUN_KEYS` decides what a keyed literal
 * is, and a run has no key, so the decision moves onto the forms. The parse is
 * shared and not copied. #588 is why: a bare `>` opens a run and `=>` is one,
 * which cost `check:vocabulary` two false readings when it widened, and a
 * second parse of JSX text here would have to get that right again.
 *
 * `JSX_NOUN_BACKLOG` was the price and is empty. Eleven runs named a record
 * when the corpus widened, five went in #974 and the last six in #965, so both
 * halves are at zero now and the register stands as the mechanism rather than
 * as a list.
 *
 * ## The floors, and the guard that is not one
 *
 * #591's rule twice. `MINIMUM_RECORD_TYPES` against a parse that has stopped
 * reading the register, which would leave nothing to look for and pass every
 * copy under the same summary line a clean run prints. `MINIMUM_FILES` against
 * a walk that has stopped finding the app.
 *
 * `PROBES` is the third guard and cannot be a floor. Both halves are at zero
 * now, so no count over the tree can say whether the detector still reads a
 * noun: a `NOUN_KEYS` that matched nothing at all, or a `KEY_FREE_FORM_NAME`
 * naming a form the register has not got, would print the same clean line.
 * Seventeen sources with known answers go through the same scan the files do,
 * nine holding a finding and eight holding none.
 *
 * It carries the whole of the JSX half's guard since #965 emptied
 * `JSX_NOUN_BACKLOG`, which is the one thing that register used to be that it
 * no longer is. While it held six modules, a run scan that broke read all six
 * as swept and failed on all six; empty, it says nothing about the scan. So the
 * run probes are the floor under it: `<h1>Traps</h1>` and
 * `<CardTitle>Samples</CardTitle>` fail a run that has stopped reading runs,
 * and the `{ jsx: false }` source beside them fails one that reads them in a
 * `.ts` module.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyStrings } from './lib/copy-strings.mjs';
import { scan } from './lib/masked-source.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import { lineOf } from './lib/source-position.mjs';
import { count, failure, trim } from './lib/style-gate.mjs';

const GATE = 'check-record-nouns';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

const WEB_ROOT = join(workspaceRoot, 'apps', 'web', 'src');
const REGISTER = join(WEB_ROOT, 'lib', 'record-nouns.ts');

/** The four shapes the register carries for every record type. */
const FORM_NAMES = ['one', 'many', 'title', 'titleMany'];

/**
 * The two forms that are a plural, each against the singular it pairs with.
 *
 * Read rather than written out a second time, so a form added to `FORM_NAMES`
 * with a plural beside it joins the "the two differ" rule by being named here
 * and nowhere else.
 */
const PLURAL_OF = { many: 'one', titleMany: 'title' };

/** One entry of `RECORD_NOUNS`, read off the source of the register. */
const REGISTER_ENTRY = /\n\t([A-Za-z]+): \{([^}]*)\}/g;

/** One form inside an entry. */
const ENTRY_FORM = /\b(one|many|title|titleMany): '([^']*)'/g;

/**
 * The keys under which a string is a record's own noun rather than anything
 * else. The gate's header carries why this is five names and not a denylist.
 */
const NOUN_KEYS = new Set(['noun', 'one', 'many', 'titleMany', 'unavailableTitle']);

/**
 * The key whose literal value is the register's own key rather than any noun.
 *
 * Every module reading the register takes it under this name, so a literal
 * written under it anywhere in the corpus is one of the register's keys, and a
 * display string there is a component wearing the register's prop name over a
 * `string` type. Read off every string literal `scan` returns rather than off
 * `copyStrings`, because the question is the key and not whether the value is
 * copy. A comparison is not a key: `keyBefore` reads `recordType === 'x'` as
 * `-`, since the `=` it anchors on has another `=` in front of it.
 */
const REGISTER_KEY = 'recordType';

/**
 * The forms a run of JSX text is read against, out of the four.
 *
 * A run sits under no key, so `NOUN_KEYS` cannot answer for it, and the answer
 * is the one that list already carries: `title` is out and the three beside it
 * are in. So a JSX run is compared against `one`, `many` and `titleMany`, which
 * is `NOUN_KEYS` read as a rule about forms rather than about keys.
 *
 * ## The rule, and the one #974 rejected
 *
 * **A title-cased plural names a list of records and reads the register whoever
 * owns them; a title-cased singular names one field and does not.** The line is
 * what the text sits over, a list or a field, and number is the readable proxy
 * for it. That is why `title` is out of both halves and `titleMany` is in, and
 * it decides the singular and the plural the same way.
 *
 * The competing rule was ownership: a heading naming a record the surface does
 * not own is a label, so the five plural headings over *linked* records would
 * have come off the backlog for a written reason rather than by a fix. It was
 * measured before being dropped. Of the 24 title-cased plurals in `apps/web`
 * that name a record type, 19 name the surface's own records and 13 of those
 * already read the register, so the number rule costs five call sites and no
 * exemptions. Ownership also cannot be stated without contradicting a component
 * this gate already lists: `RecordRegionsBand` takes a `recordType` and reads
 * the register for its host record's `one`, then spelled `Regions` by hand for
 * the linked records below it, in the same file. `traps/$id.tsx` did the same
 * thing over one list, reading `recordNoun('collection')` for the pagination
 * count and writing `Collections` in the tab above it, which is #968's finding
 * with the extension put back.
 *
 * The singular stays out on its own measurement rather than for symmetry.
 * Widening `NOUN_KEYS` to `title` is 73 findings, nearly all a field label in a
 * Details row, and the four runs between two tags are the same shape: two
 * `<TableHead>` column heads, a picker button, and a `Contact` heading over an
 * Organization's email and phone, which is not the Contact record at all.
 *
 * Whole and exact stays the rule, so `Import Regions` between two tags is not a
 * finding. The verb is the call site's own word and no register carries it,
 * which is what `createLabel` in the sidebar already says; what the register
 * owns is the name after it, and interpolating the name ends the run.
 */
const JSX_FORM_NAMES = ['one', 'many', 'titleMany'];

/**
 * The form that names a list of records whatever key it is written under.
 *
 * `NOUN_KEYS` decides what a keyed literal is, and this is the one form that
 * does not ask it. **A title-cased plural is a list of records and reads the
 * register whatever key it sits under; every other form is a record's own noun
 * only under one of `NOUN_KEYS`.** That is #974's rule with the key taken out
 * of it, and it is what puts the two halves of this gate on one sentence: a run
 * of JSX text has no key and has been read against `titleMany` since #966, so a
 * keyed literal asking a different question of the same string was the seam.
 *
 * ## What it costs, and the widening it replaces
 *
 * Measured on `develop` at 28ca37e0, against the 717 modules under
 * `apps/web/src`. 509 keyed literals write a register form somewhere outside
 * the register, and every one of them is outside `NOUN_KEYS`, which is what a
 * gate at zero means. 46 of the 509 write a **title-cased plural**, and all 46
 * are copy: an explorer heading, a create form's back link, a sidebar entry
 * over a list, a chart series, a detail row over several linked records, and
 * the noun in a failed request's message. None is a discriminator, and that is
 * the measurement the rule turns on rather than an argument: a discriminator in
 * this app is the camelCase domain key or the snake_case column, `region`,
 * `habitat`, `source_reduction`, so it can only ever collide with `one`, and
 * `one` still needs a key.
 *
 * The widening this replaces is adding `label` and `title` to `NOUN_KEYS`,
 * which the gate's header has reported as 73 findings since #894 and which
 * measures at 102 now that the corpus takes `.ts`: 71 under `label` and 31
 * under `title`. 56 of those 102 are a **title-cased singular**, a Details row
 * reading `Habitat` above a link or a `<TableHead>` over a column, and naming
 * another record in one field is not this register's business. So the key list
 * cannot settle it in either direction, and the form can: number is the
 * readable proxy for what the text sits over, a list or a field.
 *
 * It is also the answer to the thing #965 asked for, which is a test rather
 * than a list. A key added to a component's contract next week needs no edit
 * here to have its plural headings held, because the rule never reads the key.
 */
const KEY_FREE_FORM_NAME = 'titleMany';

/**
 * The runs of JSX text that already write a record's name, by module.
 *
 * **Empty, and the JSX half is at zero with the literal half.** It shipped as a
 * backlog in #966 because a rule at zero would have failed every branch on
 * history: 11 runs named a record between two tags when the corpus widened.
 * Five went in #974, the plural headings over linked records, and the six left
 * were two explorer `<h1>` and four back links naming a surface, which is what
 * #965 came for and what it swept. So a run naming a record now fails the
 * branch that writes it, with no entry to add it to.
 *
 * It stays declared rather than being deleted, and that is the one thing to
 * read before removing it. `againstBacklog` fails in both directions the way
 * `REACT_RULE_BACKLOG` does, so an entry that excuses nothing fails: the empty
 * object is what makes the next branch that writes a run meet a gate at zero,
 * and the next branch that needs a backlog has the mechanism rather than a
 * rewrite. `MANUAL_MEMO_BACKLOG` is the same shape after its own strip
 * finished.
 */
const JSX_NOUN_BACKLOG = {};

/**
 * The modules whose copy comes from the register, and the prop each takes
 * instead of a noun.
 *
 * `ExplorerHeader` takes `counts` rather than `recordType` because a surface
 * may count something that is not a record: the daily-work map counts entries,
 * which span four record types and are none of them. Its prop takes a record
 * type or a pair, and the pair is what keeps that one surface honest without a
 * free-text noun on the five components that name a record.
 *
 * The last two are hooks rather than components, and #940 is why they are
 * here. `usePagedMapResource` names the failed request and took a free-text
 * `label`, which five of the nine explorers filled from the register and four
 * spelled themselves. The attribute half of this rule is inert for a hook,
 * since nothing writes `<usePagedMapResource noun=`, and the half that does the
 * work is the other one: the prop has to still be there, so putting `label`
 * back fails the branch that does it.
 *
 * `DetailPageHeader` and `MapCardEyebrow` are #1020's, the detail eyebrow and
 * the map card's. Each took the display text under a `string` prop, which is
 * the shape the fourth rule exists for.
 *
 * `keys` names a declaration in the module whose object keys are what its
 * `recordType` takes when that is not the register's key. One entry carries it:
 * `RecordRegionsBand` takes the region-membership table name, which the domain
 * calls `recordType` too, and maps it to the register through
 * `RECORD_TYPE_BY_TABLE`. The gate reads the table names off that map rather
 * than writing them here, so a table the band learns is one edit.
 */
const NOUN_CONSUMERS = [
	{
		name: 'DetailPageHeader',
		module: 'components/record/detail-page-header.tsx',
		prop: 'recordType',
	},
	{ name: 'MapCardEyebrow', module: 'components/map/map-card.tsx', prop: 'recordType' },
	{
		name: 'RecordUnavailable',
		module: 'components/record/record-unavailable.tsx',
		prop: 'recordType',
	},
	{
		name: 'RecordDetailPage',
		module: 'components/record/record-detail-page.tsx',
		prop: 'recordType',
	},
	{
		name: 'RecordEditFrame',
		module: 'components/record/record-edit-frame.tsx',
		prop: 'recordType',
	},
	{
		name: 'RecordRegionsBand',
		module: 'components/map/record-regions-band.tsx',
		prop: 'recordType',
		keys: 'RECORD_TYPE_BY_TABLE',
	},
	{ name: 'DangerZoneCard', module: 'components/danger-zone-card.tsx', prop: 'recordType' },
	{ name: 'ExplorerHeader', module: 'components/explorer/explorer-header.tsx', prop: 'counts' },
	{
		name: 'usePagedMapResource',
		module: 'hooks/explorer/use-paged-map-resource.ts',
		prop: 'recordType',
	},
	{
		name: 'useExplorerResource',
		module: 'hooks/explorer/use-explorer-resource.ts',
		prop: 'recordType',
	},
];

/**
 * The floors, both #591's.
 *
 * 15 record types against a parse that has stopped reading the register, under
 * the 20 it carries today. 550 modules against a walk that has stopped finding
 * the app, under the 717 `.ts` and `.tsx` outside its tests tree. Neither is a
 * ratchet: this gate is at zero, so the numbers move only when a screen or a
 * record type is added, and raising them buys nothing.
 */
const MINIMUM_RECORD_TYPES = 15;
const MINIMUM_FILES = 550;

/**
 * Seventeen sources with known answers, handed to the same scan the app goes
 * through.
 *
 * The eight that hold nothing are the shapes a wider rule reads wrong: a
 * discriminator under a key that is not copy, a register form inside a longer
 * sentence, a title-cased singular between two tags and the same singular under
 * a key, and a lowercase plural under a key that is not copy. The two singulars
 * are the pair the whole rule turns on: a rule one notch wider reads a label
 * above a link as a heading naming this surface's record, and 56 of the app's
 * 102 findings under `label` and `title` are it. The lowercase plural is the
 * other side of the same line, because `many` is a form a discriminator can
 * carry and `rowsKey: 'habitats'` is five call sites here.
 *
 * `<h1 title="Traps">` was a no until #965 and is now a yes, which is the rule
 * change written where a reader meets it: a title-cased plural names a list of
 * records whatever key it is written under. The `backLabel` beside it is the
 * same disjunct read at a second key, and it is worth its place because the key
 * is the half the rule deliberately stopped reading, so a regression that put
 * an allowlist back would pass a probe naming a key that happened to be on it.
 *
 * The `titleMany` literal and the `<h1>Traps</h1>` beside it are the same
 * string read under the two halves, which is the pair to keep: the first says
 * the key rule still reads a literal and the second says the whole-run rule
 * still reads a run, and neither can stand in for the other.
 *
 * The last three are #968's, and they come in the same shape. The `noun: { one
 * }` pair nested two objects deep is what three cleanup configs wrote, and
 * `keyBefore` reads it at `one` rather than at `noun`, so a nested literal was
 * always a finding and the corpus was what could not see it. Its no is the same
 * nesting under `recordType`, because a key this register does not own answers
 * no however deep it sits, and the pair is what says the depth is not what the
 * rule turns on. The `{ jsx: false }` run is the other half of the widening:
 * the same source as the run probe above it, read as a `.ts` module, where a
 * run is not a thing the file has.
 *
 * The last two are #974's, and they are the two sides of the rule it settled.
 * The `<CardTitle>Samples</CardTitle>` is the plural over *linked* records, the
 * shape the inspection page drew, and it is a finding because number decides
 * and not ownership. The `<TableHead>Habitat</TableHead>` beside it is the same
 * question in the singular and is not, because a column head names a field.
 * Neither can stand in for the other and no count over the tree replaces
 * either: the JSX half is a per-module ratchet, so a rule that answered yes to
 * both would fail on six modules and read as a regression rather than as the
 * detector having lost the singular.
 */
const PROBES = [
	{ source: 'const a = <Thing noun="habitat" />;', finds: 'habitat' },
	{
		source: "const a = { one: 'service request', many: 'service requests' };",
		finds: 'service request',
	},
	{
		source: 'const a = <Thing unavailableTitle="Request for Control" />;',
		finds: 'Request for Control',
	},
	{ source: "const a = { titleMany: 'Traps' };", finds: 'Traps' },
	{ source: 'const a = <h1>Traps</h1>;', finds: 'Traps' },
	{ source: "const a = { address: { noun: { one: 'habitat' } } };", finds: 'habitat' },
	{ source: 'const a = <Thing recordType="habitat" kind="trap" />;', finds: null },
	{ source: 'const a = <p>No batches have been linked to this application.</p>;', finds: null },
	{ source: 'const a = <h1 title="Traps">{heading}</h1>;', finds: 'Traps' },
	{
		source: 'const a = <Thing backLabel="Requests for Control" />;',
		finds: 'Requests for Control',
	},
	{ source: 'const a = <DetailRow label="Habitat" />;', finds: null },
	{ source: "const a = { rowsKey: 'habitats', rowKey: 'habitat' };", finds: null },
	{ source: 'const a = <CardTitle>Habitat</CardTitle>;', finds: null },
	{ source: "const a = { address: { noun: { recordType: 'habitat' } } };", finds: null },
	{ source: 'const a = <h1>Traps</h1>;', options: { jsx: false }, finds: null },
	{ source: 'const a = <CardTitle>Samples</CardTitle>;', finds: 'Samples' },
	{ source: 'const a = <TableHead>Habitat</TableHead>;', finds: null },
];

function main() {
	const register = readRegister();
	const forms = {
		all: new Set(register.flatMap((entry) => FORM_NAMES.map((name) => entry.forms[name]))),
		jsx: new Set(register.flatMap((entry) => JSX_FORM_NAMES.map((name) => entry.forms[name]))),
		keyFree: new Set(register.map((entry) => entry.forms[KEY_FREE_FORM_NAME])),
	};
	const problems = [...registerProblems(register), ...componentProblems()];

	const files = [...typeScriptFilesUnder(WEB_ROOT)];
	if (files.length < MINIMUM_FILES) {
		fail(
			`found ${count(files.length, 'module')} under apps/web/src, fewer than the ${MINIMUM_FILES} this expects. The walk has stopped finding the app, so a noun written outside the register now passes this. Fix the walk in scripts/check-record-nouns.mjs, or lower MINIMUM_FILES if that many modules were genuinely deleted.`,
		);
	}

	const keys = {
		register: new Set(register.map((entry) => entry.recordType)),
		foreign: foreignVocabularies(),
	};
	const findings = files
		.filter((file) => file !== REGISTER)
		.flatMap((file) => {
			const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
			return [
				...nounLiteralsIn(file, source, forms, { jsx: file.endsWith('.tsx') }),
				...foreignKeysIn(file, source, keys),
			];
		});

	const backlog = againstBacklog(findings.filter((finding) => finding.kind === 'jsx'));
	const reported = [...findings.filter((finding) => finding.kind !== 'jsx'), ...backlog.over];

	if (problems.length + backlog.problems.length > 0 || reported.length > 0) {
		report([...problems, ...backlog.problems], reported);
		return;
	}

	checkProbes(forms);
	checkKeyProbes(keys);

	console.log(
		`Record nouns: ${count(register.length, 'record type')} in the register, ${NOUN_CONSUMERS.length} modules reading it, every ${REGISTER_KEY} a register key and no noun written again across ${files.length} modules${sweptOrAllowed()}`,
	);
}

/**
 * The vocabularies a listed reader's `recordType` takes when it is not the
 * register's key, as the tag that takes it against the keys it takes.
 *
 * One today, read off the map `RecordRegionsBand` declares rather than spelled
 * here. A `keys` declaration that reads empty is a problem
 * `listedComponentProblems` reports rather than an exemption that widens, and
 * every literal inside that tag is a finding besides, which is loud in both
 * directions; the alternative is a band that learned a table nothing checks.
 */
function foreignVocabularies() {
	return NOUN_CONSUMERS.filter((component) => component.keys !== undefined).map((component) => ({
		name: component.name,
		keys: declaredKeysOf(component),
	}));
}

/** The object keys of the declaration a reader names under `keys`, off its source. */
function declaredKeysOf(component) {
	const source = readSource(join(WEB_ROOT, ...component.module.split('/'))) ?? '';
	const start = source.indexOf(`const ${component.keys}`);
	const body = start === -1 ? '' : source.slice(start, source.indexOf('\n};', start));
	return new Set([...body.matchAll(/\n\t([A-Za-z_]+): '/g)].map((match) => match[1]));
}

/**
 * Every `REGISTER_KEY` literal in one file that is not a register key.
 *
 * A literal inside a tag whose reader declares another vocabulary is read
 * against that vocabulary instead. The tag is found off the masked copy, where
 * a string body is blank, so a `>` inside an attribute cannot close it early.
 */
function foreignKeysIn(file, source, keys) {
	const { literals, masked } = scan(source);
	const tags = foreignTagsIn(masked, keys.foreign);

	return literals
		.filter((literal) => keyBefore(source, literal.index) === REGISTER_KEY)
		.map((literal) => ({
			literal,
			tag: tags.find((span) => literal.index > span.start && literal.index < span.end),
		}))
		.filter(({ literal, tag }) => !(tag?.keys ?? keys.register).has(literal.text))
		.map(({ literal, tag }) => keyFinding(file, source, literal, tag));
}

/** Where each tag that takes another vocabulary opens and closes, off the masked copy. */
function foreignTagsIn(masked, foreign) {
	return foreign.flatMap((vocabulary) =>
		[...masked.matchAll(new RegExp(`<${vocabulary.name}\\b[^>]*>`, 'g'))].map((match) => ({
			...vocabulary,
			start: match.index,
			end: match.index + match[0].length,
		})),
	);
}

/** One `REGISTER_KEY` literal that is not a key, in the shape `report` prints. */
function keyFinding(file, source, literal, tag) {
	return {
		kind: 'key',
		where: pathFrom(workspaceRoot, file).split(sep).join('/'),
		at: `${pathFrom(workspaceRoot, file)}:${lineOf(source, literal.index)}`,
		line: trim(
			source
				.slice(source.lastIndexOf('\n', literal.index) + 1)
				.split('\n')[0]
				.trim(),
		),
		text: literal.text,
		message:
			tag === undefined
				? `"${literal.text}" is written under ${REGISTER_KEY} and is not one of the register's keys. That name means the register's key wherever it is written: pass the key and let the component look the noun up.`
				: `"${literal.text}" is written under ${REGISTER_KEY} on <${tag.name}> and is not one of the keys that reader declares.`,
	};
}

/**
 * How the summary line ends, which depends on whether the backlog holds
 * anything.
 *
 * It is empty today, so the line says what the run covered rather than naming a
 * register with nothing in it. The other half is what a future backlog would
 * print, and it stays here for the reason the register itself does.
 */
const sweptOrAllowed = () => {
	const allowed = Object.keys(JSX_NOUN_BACKLOG).length;
	return allowed === 0
		? ', as a literal under any key or as a run of JSX text.'
		: ` beyond the ${count(allowed, 'module')} JSX_NOUN_BACKLOG still holds.`;
};

/** `RECORD_NOUNS` as `[{ recordType, forms }]`, read off the register's source. */
function readRegister() {
	const source = readFileSync(REGISTER, 'utf8').replaceAll('\r\n', '\n');
	const body = source.slice(source.indexOf('const RECORD_NOUNS'));
	const entries = [...body.matchAll(REGISTER_ENTRY)].map((match) => ({
		recordType: match[1],
		forms: Object.fromEntries([...match[2].matchAll(ENTRY_FORM)].map((form) => [form[1], form[2]])),
	}));

	if (entries.length < MINIMUM_RECORD_TYPES) {
		fail(
			`read ${count(entries.length, 'record type')} out of ${pathFrom(workspaceRoot, REGISTER)}, fewer than the ${MINIMUM_RECORD_TYPES} this expects. The parse has stopped reading the register, so there is nothing left to look for and every copy of a noun passes. Fix REGISTER_ENTRY in scripts/check-record-nouns.mjs, or lower MINIMUM_RECORD_TYPES if that many record types were genuinely deleted.`,
		);
	}
	return entries;
}

/** What is wrong with the register itself, as sentences. */
function* registerProblems(register) {
	const seen = new Map();
	for (const entry of register) {
		yield* entryProblems(entry);
		yield* collisionProblems(entry, seen);
	}
}

/** What is wrong with one entry on its own: a missing form, or no plural in it. */
function* entryProblems({ recordType, forms }) {
	const missing = FORM_NAMES.filter((name) => (forms[name] ?? '') === '');
	if (missing.length > 0) {
		yield `${recordType} has no ${missing.join(' and no ')}. Every record type carries all ${FORM_NAMES.length} forms, because a component asking for one it has not got renders "undefined" on a heading.`;
		return;
	}
	for (const [plural, singular] of Object.entries(PLURAL_OF)) {
		if (forms[singular] === forms[plural]) {
			yield `${recordType} spells its ${singular} and its ${plural} the same way, "${forms[singular]}". A heading over a list then names one record where it means several.`;
		}
	}
}

/**
 * A form this entry shares with one already read, recording each as it goes.
 *
 * The collision is the finding rather than a tidiness rule: `request` was the
 * count noun for both a service request and a request for control, and a person
 * moving between those two surfaces read one word for two records.
 */
function* collisionProblems({ recordType, forms }, seen) {
	for (const name of FORM_NAMES) {
		const first = seen.get(forms[name]);
		if (first !== undefined && first !== recordType) {
			yield `${recordType} and ${first} both say "${forms[name]}". One word for two records is what #894 found in the count nouns, where a service request and a request for control both counted "requests", and a person moving between the two surfaces cannot tell them apart.`;
		}
		seen.set(forms[name], recordType);
	}
}

/** What is wrong with the listed modules that read the register, as sentences. */
function* componentProblems() {
	for (const component of NOUN_CONSUMERS) {
		yield* listedComponentProblems(component);
	}
	for (const file of [...typeScriptFilesUnder(WEB_ROOT)].filter((file) => file.endsWith('.tsx'))) {
		yield* nounPropsAt(file, readSource(file) ?? '');
	}
}

/** Whether one listed module is still there and still declares its prop. */
function* listedComponentProblems(component) {
	const source = readSource(join(WEB_ROOT, ...component.module.split('/')));
	if (source === null) {
		yield `${component.name} is listed here as reading the register and ${component.module} does not exist. Point NOUN_CONSUMERS at where it moved, or drop the entry if it is gone.`;
		return;
	}
	if (!source.includes(component.prop)) {
		yield `${component.module} no longer declares a ${component.prop} prop, so nothing says where its copy comes from. A module naming a record takes the register's key and looks the noun up.`;
	}
	yield* vocabularyProblems(component);
}

/** Whether a listed module that names another vocabulary under `keys` still declares it. */
function* vocabularyProblems(component) {
	if (component.keys !== undefined && declaredKeysOf(component).size === 0) {
		yield `${component.module} no longer declares ${component.keys}, which is where NOUN_CONSUMERS says its ${component.prop} vocabulary is read from. Point the entry's keys at where it moved, or drop keys if the prop takes the register's key now.`;
	}
}

/** A `noun` attribute passed to one of the components, which is the prop the register replaced. */
function* nounPropsAt(file, source) {
	const names = NOUN_CONSUMERS.map((component) => component.name).join('|');
	const element = new RegExp(`<(${names})\\b[^>]*?\\bnoun\\s*=`, 'gs');

	for (const match of source.matchAll(element)) {
		yield `${pathFrom(workspaceRoot, file)}:${lineOf(source, match.index)} passes a noun to <${match[1]}>. That prop is the register's now: pass the record type and the component looks the noun up.`;
	}
}

/**
 * Every register form written out again in one file, as a literal or as JSX
 * text.
 *
 * `options.jsx` is off for a `.ts` module, because a run of JSX text is a thing
 * only a `.tsx` module has. `copyStrings` reads a bare `>` as opening a run, so
 * leaving it on over the 396 `.ts` modules would put ordinary comparisons and
 * generics into the run corpus and answer against `JSX_FORM_NAMES` on whatever
 * came back.
 */
function nounLiteralsIn(file, source, forms, options = { jsx: true }) {
	return copyStrings(source)
		.filter((copy) => isNoun(copy, source, forms, options))
		.map((copy) => ({
			kind: copy.kind,
			where: pathFrom(workspaceRoot, file).split(sep).join('/'),
			at: `${pathFrom(workspaceRoot, file)}:${lineOf(source, copy.index)}`,
			line: trim(
				source
					.slice(source.lastIndexOf('\n', copy.index) + 1)
					.split('\n')[0]
					.trim(),
			),
			text: textOf(copy),
		}));
}

/**
 * Whether one piece of copy writes a record's name.
 *
 * Whole and exact either way. What differs is which forms are in scope and what
 * "whole" means: a literal is its own text, and a run of JSX text is the run
 * with its indentation off, against `JSX_FORM_NAMES`.
 *
 * A literal is asked two questions rather than one. `KEY_FREE_FORM_NAME` is the
 * title-cased plural, which names a list of records under any key at all, and
 * every other form is a record's own noun only under one of `NOUN_KEYS`.
 */
function isNoun(copy, source, forms, options) {
	return copy.kind === 'jsx'
		? options.jsx && forms.jsx.has(textOf(copy))
		: isNounLiteral(copy, source, forms);
}

/**
 * Whether a keyed literal writes a record's name, which is two questions.
 *
 * A title-cased plural names a list of records under any key. Every other form
 * needs one of `NOUN_KEYS`, because `one` and `many` are what a discriminator
 * collides with.
 */
const isNounLiteral = (copy, source, forms) =>
	forms.keyFree.has(copy.text) ||
	(forms.all.has(copy.text) && NOUN_KEYS.has(keyBefore(source, copy.index)));

/** What a piece of copy says, with a run's surrounding indentation taken off. */
const textOf = (copy) => (copy.kind === 'jsx' ? copy.text.replace(/\s+/g, ' ').trim() : copy.text);

/**
 * The JSX findings a module is allowed, and the entries that no longer match.
 *
 * Both directions, which is what makes a swept module a branch that edits this
 * file rather than one that quietly leaves headroom behind.
 */
function againstBacklog(findings) {
	const byModule = new Map();
	for (const finding of findings) {
		byModule.set(finding.where, [...(byModule.get(finding.where) ?? []), finding]);
	}

	const problems = Object.entries(JSX_NOUN_BACKLOG).flatMap(([where, allowed]) =>
		(byModule.get(where) ?? []).length < allowed
			? [
					`${where} is down to ${count((byModule.get(where) ?? []).length, 'record name')} written as JSX text and JSX_NOUN_BACKLOG allows ${allowed}. The work is done and the allowance is headroom the next copy would land inside: take the entry down in scripts/check-record-nouns.mjs, or off it when the number is zero.`,
				]
			: [],
	);

	const over = [...byModule].flatMap(([where, found]) =>
		found.length > (JSX_NOUN_BACKLOG[where] ?? 0) ? found : [],
	);

	return { problems, over };
}

/**
 * The attribute or property name a literal was given under, or `-`.
 *
 * Read off the raw source rather than the masked copy, because masking blanks a
 * string body and the name in front of it is code either way.
 */
function keyBefore(source, index) {
	const before = source.slice(Math.max(0, index - 60), index);
	return before.match(/([A-Za-z][\w-]*)\s*[=:]\s*['"`]?$/)?.[1] ?? '-';
}

/**
 * Six sources with known answers for the fourth rule, three holding a finding
 * and three holding none.
 *
 * It cannot be a floor for the reason `PROBES` cannot: the rule is at zero, so
 * a `REGISTER_KEY` that matched nothing would print the same clean line. The
 * yeses are the eyebrow #1020 found, a display string under the key in an
 * object, the same under the key as a JSX attribute, and a table name outside
 * the one tag that takes it. The noes are the register's key itself, a table
 * name inside `RecordRegionsBand`, which is the one reader whose vocabulary is
 * not the register's, and a comparison, because `=== 'x'` is not a key.
 */
const KEY_PROBES = [
	{ source: "const a = { header: { recordType: 'Biocontrol' } };", finds: 'Biocontrol' },
	{
		source: 'const a = <DetailPageHeader recordType="Biocontrol Action" />;',
		finds: 'Biocontrol Action',
	},
	{ source: 'const a = <Thing recordType="habitats" />;', finds: 'habitats' },
	{ source: "const a = { recordType: 'biocontrolAction' };", finds: null },
	{ source: 'const a = <RecordRegionsBand recordId={id} recordType="habitats" />;', finds: null },
	{ source: "const a = recordType === 'Biocontrol';", finds: null },
];

/** Refuse a run whose key scan reads any of the known-answer sources wrong. */
function checkKeyProbes(keys) {
	const wrong = KEY_PROBES.filter((probe) => {
		const found = [...foreignKeysIn('probe.tsx', probe.source, keys)];
		return probe.finds === null ? found.length > 0 : found[0]?.text !== probe.finds;
	});

	if (wrong.length > 0) {
		fail(
			`the key scan read ${count(wrong.length, 'probe')} wrong, so this run's clean zero is the detector failing rather than every ${REGISTER_KEY} being a register key. The first is: ${wrong[0].source}`,
		);
	}
}

/** Refuse a run whose scan reads any of the known-answer sources wrong. */
function checkProbes(forms) {
	const wrong = PROBES.filter((probe) => {
		const found = nounLiteralsIn('probe.tsx', probe.source, forms, probe.options ?? { jsx: true });
		return probe.finds === null ? found.length > 0 : found[0]?.text !== probe.finds;
	});

	if (wrong.length > 0) {
		fail(
			`the scan read ${count(wrong.length, 'probe')} wrong, so this run's clean zero is the detector failing rather than the app being consistent. No count over the tree can catch that, because this gate is at zero. The first is: ${wrong[0].source}`,
		);
	}
}

function report(problems, findings) {
	console.error(`${GATE}: ${count(problems.length + findings.length, 'problem')}.\n`);
	for (const problem of problems) {
		console.error(`  ${problem}\n`);
	}
	for (const finding of findings) {
		console.error(
			`  ${finding.at}\n    ${finding.line}\n    ${finding.message ?? nounMessage(finding)}\n`,
		);
	}
	process.exitCode = 1;
}

const nounMessage = (finding) =>
	`"${finding.text}" is the register's word for a record type. Read it out of ${pathFrom(workspaceRoot, REGISTER).split(sep).join('/')} rather than writing it here.`;

/** One module's source, or `null` when it is not there. */
function readSource(module) {
	try {
		return readFileSync(module, 'utf8').replaceAll('\r\n', '\n');
	} catch {
		return null;
	}
}

main();
