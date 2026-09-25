# SIMMER mosquito context

This is the lightweight domain index for SIMMER mosquito control language. Keep
it small enough to load often. For implementation details, load the linked
domain doc instead of expanding this file.

## Core language

| Term | Meaning | Avoid |
|---|---|---|
| **Organization** | A group that runs mosquito control and owns its operational records, settings, and field workflows. Any group that does the work: an abatement district, a city or county program, a health department, a university, a contractor. | agency, tenant, account |
| **Profile** | Organization-scoped person used for field attribution, audit attribution, and role-bound work. | user, login, account |
| **Membership** | A person's current access relationship to an organization through a role and profile. | permission row, user role |
| **Account** | What one person signs in with, held against a WorkOS identity and shared across every Organization they belong to. | user, login, seat |
| **Invitation** | An offer of access to an Organization, held against the address it was sent to and the role it would grant. Becomes an active Membership when the person accepts. | pending user, seat, signup |
| **Re-invitation** | A new offer to an address that already holds a live Invitation. May carry a different role, and ends the earlier offer. | resend, re-send invite |
| **SIMMER Operator** | Platform-side administrator for SIMMER-controlled setup and support workflows. | superuser, organization admin |
| **Address** | Organization-owned address book entry that can help choose locations without becoming canonical for operational records. | canonical location, property |
| **Region** | Organization-defined area used for GIS grouping, reporting, and spatial lookup. One boundary, in one piece or several. | district, zone |
| **Part** | One of the pieces of a record's geometry. Two or more parts store a Multi shape, one part stores the base shape, and part order carries no meaning. User-facing copy says "piece". | feature, shape, sub-geometry |
| **Covers no ground** | Said of a geometry that encloses zero area or spans zero length. Refused on write, naming the part. Distinct from **invalid**, a ring crossing itself, which SIMMER does not police. | empty, degenerate, invalid |
| **Global Taxonomy** | SIMMER-controlled mosquito genus/species vocabulary shared across organizations. | species list, organization species |
| **Organization Species** | Organization-selected subset of global species available for new data entry. | enabled species, species setting |
| **Organization Lookup** | Organization-owned catalog value used to configure surveillance or control workflows. | dropdown option, enum |
| **Delete** | Removing a record that should never have existed. Refused while any live record refers to it. | archive, retire, purge |
| **Deactivate** | Retiring a record that should not be referred to from now on. Leaves records that already name it alone. | delete, disable, archive |

### Create verbs

A surface that opens a create form names it with one verb per kind of record,
in its navigation entry, its page title and its heading alike. The verb says
what the form makes; the submit button says **Save** on every create and edit
form, because it names the act of committing, so an entry and its button are
expected to differ. **New** is not used.

- **Record** for work performed in the field: Inspection, Collection, Chemical
  Application, Biocontrol Action, Source Reduction, Outreach Action.
- **Create** for a thing brought into existence, a root record with no parent
  its form cannot open without: Habitat, Trap, Address, Region, Contact,
  Mission, Assignment, Requested Control Action, Service Request, Weather
  Station, Route.
- **Add** for a child attached to a parent that already exists, whose form
  cannot open without the parent's id: Samples to an Inspection, a stop to a
  Mission, a Notification Registration to a Contact or Address.

The noun is the record's term above, read from `RECORD_NOUNS` in `apps/web`,
and the verb is `CREATE_VERBS` in the same app's navigation module, so a surface
calls `createLabel` and reads both rather than spelling either.

## Workflow language

| Area | Terms | Detail |
|---|---|---|
| Adult surveillance | **Trap**, **Collection**, **Species Count**, **Bycatch** | `docs/adult-surveillance-domain.md` |
| Larval surveillance | **Habitat**, **Habitat Inspection**, **Ad Hoc Inspection**, **Positive Inspection**, **Inspection Sample**, **Unlabeled Sample**, **Sample Species Count**, **Larval Density** | `docs/larval-surveillance-domain.md` |
| Field-work support | **Comment**, **Tag**, **Additional Personnel**, **Route**, **Assignment**, **Assignment Item** | `docs/field-work-support-domain.md` |
| Control operations | **Control Method**, **Chemical Application**, **Source Reduction**, **Outreach Action**, **Biocontrol Action**, **Requested Control Action**, **Insecticide**, **Insecticide Batch**, **Formulation** | `docs/control-operations-domain.md` |
| Public engagement | **Contact**, **Service Request**, **Notification Type**, **Notification Registration**, **Mission Notification** | `docs/public-engagement-domain.md` |
| Mission dispatch | **Mission**, **Mission Item**, **Mission Progress** | `docs/mission-dispatch-domain.md` |
| Weather | **Weather Station**, **Weather Summary**, **Weather Summary Import** | `docs/weather-domain.md` |
| Organization settings | Timezone, unit defaults, larval density policy, control defaults, public engagement defaults, **Species Key Binding** | `docs/organization-settings-domain.md` |
| Foundation/reference data | Addresses, regions, taxonomy, organization species, organization lookup catalogs | `docs/foundation-domain.md` |

## Relationship cues

- An **Organization** owns operational records and settings.
- A **Profile** belongs to one **Organization**; a **Membership** links an
  **Account** to one organization/profile/role relationship.
- **Address Geometry** is a convenience source. Later address edits do not move
  operational records.
- A **Trap** can produce many **Collections**; a **Collection** can have many
  **Species Counts**.
- A **Habitat** can have many **Habitat Inspections**; an **Ad Hoc Inspection**
  may be promoted into a **Habitat**.
- A **Positive Inspection** is a wet inspection indicating breeding: `is_wet`
  and a density other than `none` or a larvae count above zero, which is the
  larval doc's breeding rule and holds under every density policy. A dry
  inspection is a real inspection that found nothing, so it counts among
  inspections and never among positive ones.
- The six **life stage** flags on a larval inspection, eggs, first through
  fourth instar and pupae, are one complete observation. A flag that is false
  says the stage was **absent**, never that it was not recorded.
- A period, a day, a month or a year, is **partial** when today falls inside
  it, and only the current period ever is. A comparison against a partial
  period is cut like for like by calendar date, each earlier period through
  the same date within itself, clamped to that period's last day; a day is
  never cut.
- An active **Habitat** is **untreated** while its latest inspection came back
  heavy or very heavy, no **Chemical Application**, **Source Reduction** or
  **Biocontrol Action** dated on or after that inspection names the habitat or
  the inspection, and no unresolved **Requested Control Action** names it. A
  later inspection at a lower density clears it on its own; a request for
  control takes it off the untreated list without treating it.
- A **Route** is reusable planning; an **Assignment** is dated field work; a
  **Mission** is scheduled control-work dispatch.
- A **Requested Control Action** may later be linked to a performed **Chemical
  Application**, **Source Reduction**, **Outreach Action**, or **Biocontrol
  Action**.
- A **Formulation** helps calculate one or more chemical applications, but
  those applications do not store the formulation as historical source data.
- **Delete** and **Deactivate** are not degrees of the same act. Delete says the
  record was a mistake, so anything referring to it proves otherwise and refuses
  the delete. Deactivate says the record was real and its use has ended, so it
  never touches what already names it and only stops new references.
- A **Service Request** belongs to a **Contact** and location. An open one is
  **in progress** once it is a stop on an **Assignment**, whatever that
  assignment's state; a comment on it is not progress. Before that it is
  **new**.
- A **Service Request** is **received** on its request date, the day the
  Organization took it, and that is the day it counts on. When the row was
  entered is not a domain date.
- A **Requested Control Action** is **assigned** while a **Mission Item** on a
  scheduled or in-progress **Mission** names it. A stop on a completed or
  cancelled mission leaves an unresolved request unassigned again.
- A **Mission** contains ordered **Mission Items**; a mission item can produce
  zero or more performed control actions.

## Location source terms

Use **Location Source Flow** for allowed movement from one domain record or
manual geometry into another record's stored operational geometry. Domain docs
own the allowed source flows for each workflow.

Common source terms:

- **Manual Drawing**: user-provided GeoJSON geometry.
- **Address Geometry**: stored point geometry associated with an address.
- **Trap Geometry**: point geometry stored for an adult surveillance trap.
- **Habitat Geometry**: point, line, or polygon geometry stored for a reusable
  larval surveillance habitat.
- **Ad Hoc Inspection Geometry**: geometry stored on a one-off larval inspection.
- **Habitat Inspection Geometry**: snapshot copied from the habitat when the
  inspection is recorded.
- **Control Action Geometry**: geometry stored for a performed control action.
- **Requested Control Action Geometry**: geometry stored before actual control
  work exists.
- **Mission Item Geometry**: authoritative target geometry for one ordered
  mission item.
- **Weather Station Geometry**: explicit point geometry for a station.

## Geometry shape terms

- A **Part** is one of the pieces of a multipart geometry. A record with two or
  more parts stores a Multi shape; one part stores the base shape. Part order
  carries no meaning. The draw control and the import preview call a part a
  **piece** on screen, which is the word a user reads for the thing they drew.
- A geometry **covers no ground** when it encloses zero area or spans zero
  length. It is distinct from invalid, which is about a ring crossing itself and
  which SIMMER does not police.

## Ambiguities to preserve

- "Application" can mean software or control work. Use **Chemical Application**
  for performed insecticide work.
- "Notification" can mean preference, generated worklist row, or delivery. Use
  **Notification Type**, **Notification Registration**, and **Mission
  Notification** for the v1 concepts.
- "Organization" is the group the signed-in person belongs to, never a member of
  the public. An Organization is a record SIMMER owns, with an id, memberships,
  and settings; text somebody typed is not one, even when it names a real body.
  Where a **Contact** works is text, labelled **Company**. The rule binds on
  labels, filters, headings, and columns; lowercase "organization" in a sentence
  is not a term.
- "Requested Control Action" is the term; **request for control** is its display
  form. The route, the sidebar entry, the index title and every heading on the
  record already read that way, because the record is a request rather than a
  performed action, and the term reads as though the control work happened. The
  term stays as the name of the record across the domain docs, the commands and
  the tables; the display form is what a person sees, and it is written once, in
  `apps/web/src/lib/record-nouns.ts`.
- "Ad Hoc" is the term; **one-off** is its display form. An **Ad Hoc
  Inspection** is what the schema, the commands and these docs call an
  inspection filed at no Habitat, and a person reads "One-off inspection",
  "One-off sample" and "One-off collection". The same split the Requested
  Control Action bullet above makes, and for the same reason: the term names
  the record and the display form is what a surface draws. It is not in the
  Avoid column, because the domain spelling is correct wherever it appears and
  an entry there would fail on `recordAdHocInspectionCommand` at every call
  site. What a record with no Habitat and no Trap is actually called is the
  ladder in `apps/web/src/lib/coordinate-label.ts` and its twin in
  `apps/web/src/hooks/queries/trap-view.ts`: the Habitat or Trap, then the
  Address, then the coordinates, and the display form only when the record
  carries none of them.
- "District" can mean the **Organization** itself, since an abatement district is
  one, or a piece of its geography, which is a **Region**. Not a term: write
  Organization or Region.
- "Site" reads as a **Habitat** to one person and a **Trap** to the next, so it
  is not a shared abstraction. Not a term: write the concrete record, Habitat,
  Trap, Address, Service Request, Mission Item. A workflow that proves a generic
  site model is worth it has to replace this entry first.

The Avoid column above is one half of the register `pnpm check:vocabulary` reads.
The sentence "Not a term:" in this section is the other half, for a word the
table cannot hold because it stands for no single term. It has to open a
sentence, on a bullet that opens with the word in quotes, because the
Organization bullet ends "is not a term" and means the opposite. Two bullets say
it, and the gate fails if it can no longer find both.
