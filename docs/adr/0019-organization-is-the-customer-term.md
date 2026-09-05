# ADR 0019: Organization is the word for the customer, and an Organization is a record

Status: Accepted

Date: 2026-09-04

## Context

`CONTEXT.md` named the customer an **Agency** and told everyone to avoid tenant
and account. The schema has always called it `organizations`: 6,294 identifier
uses, `organization_id` on every owned root record, and WorkOS's own word for the
same object. So the product ran two vocabularies, and the seam went through what
a user reads. `apps/web/src/routes/my-organization/-components/general.tsx:100`
said "the agency profile details available to organization members" in one
sentence. The same page labelled the field "Organization name" and drew the
values under it with `AgencyDetailLine`. Seventeen copies of "Organization
details are still loading." shipped against two of "Agency details are still
loading."

Agency was also wrong on the facts. Not every customer is an agency. Abatement
districts, city and county programs, health departments, universities and
contractors all run mosquito control, there is no `type` column on
`organizations` to enumerate them, and the range cannot be predicted. Any narrow
word names one kind of customer and misnames the rest.

## Decision

**Organization** is the customer, and it is the word on screen, not only the word
in the code. `agency` joins `tenant` and `account` on its Avoid list.

**An Organization is a record SIMMER owns**, with an id, memberships and
settings. Text somebody typed is not an Organization, even when it names a real
body.

## Considered options

**Keep Agency.** Rejected on the facts above.

**Let Organization cover a Contact's employer too.** Rejected, and this is the
half a future reader is most likely to undo, because collapsing the two looks
like tidying up. `contacts` already carries both `organization_id`, which decides
who may read the row, and `company`, where that member of the public works. One
word for both puts two organizations on one row, one of them the key every
authorization filter uses. A contacts filter labelled Organization could then
mean who the contact works for or whose data you are looking at, and one of those
readings is a permissions question. **Company** stays the label.

## Consequences

- `tenant` leaves the prose as well as the model. `organization` is the word,
  including where the old text said tenant scope and tenant-owned rows.
- **Account** becomes the term for the login a person signs in with, which is why
  it stays on the Avoid lists for Organization and Profile: those are the two
  things it must not be confused with.
- Earlier ADRs are not rewritten. ADR 0011's filename and its uses of agency stay
  as they are. An ADR records what was decided when it was decided, and editing
  the old ones erases the fact that the term changed.
- Outstanding renames: roughly 400 identifiers, 43 copy strings in `apps/web`,
  `PRODUCT.md` and seven other doc files. The route `/my-organization` and the
  navigation label were already right.
- Nothing enforces this. A `check:vocabulary` gate over copy strings would hold
  the Avoid lists the way `check:column-vocabularies` holds the enums.

#493 amends the last bullet. The gate was built in #539 and runs in `ci.yml`, so
the decision is enforced over the copy it was written about. It parses
`CONTEXT.md` rather than copying it, in two halves: the Avoid column of the Core
language table, and the "Not a term" bullets in the Ambiguities section. #552
extended it with the per-string `// vocabulary-ignore` marker that let `site` and
`seat` join `agency` and `tenant`, so the enforced set is four words and there is
no allowance count. `account`, `user` and `login` are still outside it, because
nothing yet tells the banned sense of those from the term.

What the gate reads is copy: string literals and JSX text under `apps/web/src`,
`apps/admin/src` and `apps/mobile/src`. Comments and prose are not copy and are
not gated, so those went by issue instead. #534 and #565 took agency and tenant
out of the comments, #536 out of the docs that say which word to use, #566 out of
`scripts/`, and #562 out of the eight doc files this ADR named outstanding.
