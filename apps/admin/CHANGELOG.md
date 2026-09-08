# @simmer-mosquito/admin

## 0.6.0 — 2026-09-08

### Minor Changes

- Changed: the operator console no longer calls a customer an agency. Not every
  customer is one, and the console has always routed the directory at
  `/organizations` while the button above it read Create Agency.

  The section is Organizations now, from the sidebar label and the breadcrumb down
  to the directory heading, the create form, and the Organization id on a
  customer's detail page. The unlinked warning reads "1 organization is not linked
  to WorkOS, so nobody there can sign in", which also stops the same sentence using
  organization for two different things.

  Where the noun was doing no work it is gone. The global taxonomy and units pages
  say "Changes apply to everyone using this genus" and "will be removed for
  everyone", the foundations page offers "The first traps" and "Load the district
  boundaries from the KML, KMZ, or GeoJSON they sent", and the members list asks
  you to "Invite the first owner or admin below".

  Changed: deleting a species from the global taxonomy names what still cites it as
  an organization species list, not an agency species list. That count is what the
  refusal is counted from, so it is the sentence you read before confirming.

- Changed: an operator console form that will not save now says which field is
  missing. Nine of the eleven forms greyed Save out while something was empty,
  which told you nothing about what, and the two that needed a shape on a map went
  further: pressing Add did nothing at all and said nothing about why. Genera,
  species, units, and the six foundation forms name the missing part instead, and
  a region or an address without a location asks for one.

  Changed: a refused save on a global catalog form reads as an alert above the
  fields rather than a line of red text under them, and it carries the server's own
  words. Save comes back as soon as you change something.

  Changed: the Genus, Folder, Lure, Address, Species, Measures, and System pickers
  in the console are the same select the rest of SIMMER uses, and a required field
  is marked in its label. Nothing about what they store changed.

- Changed: the Foundations page reads a region boundary file one record per
  feature. A boundary drawn on several separated lots comes across whole, instead
  of silently becoming its first lot. When the file holds nothing the page can
  use, the message counts every feature it skipped rather than only those of
  another geometry kind.

- Added: the staging environment banner now sits above the signed-out pages too:
  the landing page, sign in, sign up, forgot and reset password, accept
  invitation, and the operations console's sign in. It says the deployment is a
  copy of the production system that the next refresh erases, and expands to say
  that sign-in details are the real production ones and that staging does not
  allow changes to sign-in accounts, Memberships, roles, Organizations, or
  invitations.
  Four of those pages are ones staging refuses, so the rule is now readable before
  the form is filled in. Production shows nothing.

### Patch Changes

- Changed: the dash a table draws where a record carries no value now announces
  itself as "Not recorded" to a screen reader. It used to name itself with a hover
  tooltip on the sixteen columns that went through a component, and with nothing
  at all on the twelve that wrote the character themselves, so the two apps read
  the same absence three different ways and one of them read out the punctuation.

  The twelve are four columns on a habitat's history, the inspector, applicator,
  dip and larvae counts; the custom fields a catalog row declares; a density
  badge with no reading; the route list's stop count; a route stop with no
  address; a trap collection with no date; the two weather summary readings; and
  the operator console's organization facts.

  Nothing looks different. The dash is the same mark in the same place, and a
  detail row still spells "Not recorded" out in words, because a row has room for
  them and a column repeating down a long list does not.

- Fixed: clearing a search box now clears what it was narrowing. On the traps,
  habitats, addresses, regions, weather station and service request lists, and on
  the add-a-stop picker in the route editor, the X emptied the field and left the
  list filtered on the text that had just gone from the screen until the pause
  behind the field ran out.

  Fixed: three search boxes that had no clear control have one. The lookup
  catalogs, the contacts list, and the region picker that fills a shape from a
  boundary could only be emptied by selecting the text.

  Changed: every search box in the app draws the same way, and each one says what
  it searches to a screen reader. There were two versions of the box in the shared
  component library and six more copied by hand, and they had drifted in spacing,
  in whether the magnifier sat inside the frame, and in whether the box was named
  at all.

- Fixed: a refusal from the server now reads as a sentence rather than as a code.
  A Foundations write that was refused used to put `operator_required` in the form
  alert; it now says the account is not a SIMMER operator and to sign back in as
  one. Sessions that have ended, organizations and profiles that cannot be found,
  and an invitation to somebody who already has access each say what happened and
  what to do next. A refusal the console has no sentence for falls back to the
  screen's own wording, so a code never reaches the screen.

- Changed: nothing in either app says login. What a person signs in with is an
  Account, and two badges called it something else.

  In People, the line under a name is that Profile's email address, so it reads
  "No email" when there is none, which is what the operator console has said on
  the same line all along. In the console's member list, somebody who has been
  invited and has not arrived yet is "Never signed in" rather than "No login yet".

  Two quieter strings came with them. The sidebar falls back to Account when
  neither the Profile nor the Account carries a name, and the error you get when
  your Account has no active organization says that rather than naming you a user.

- Changed: no copy in either app joins a sentence with an em dash any more. It was
  in 62 strings, and it read the way a machine writes rather than the way anyone
  here talks.

  Most of it is form and catalog blurbs. A geometry field now says "The geometry is
  where the product was applied. Use a point for a spot treatment, a line or area
  for a treated swath." The five method catalogs introduce their examples the way a
  person would, and a role in the operator console reads "Manager, records and
  manages catalogs".

  Two of them a listener could not hear. The readiness list on an organization's
  foundations page announces "Region is in place." to a screen reader, where it
  used to announce a dash. One that joined a pair of values now uses the middle dot
  the rest of the line already uses, so a requested control action reads
  "Application requested · Check the culvert · Open".

  Four date ranges lose the spaces around their en dash, so a filter chip reads
  "Mar 3–Mar 9" the way a range is written.

  The dash a table draws where a record carries no value is untouched. That is a
  symbol, not a sentence.

- Fixed: a refused Foundations read now says what the console says everywhere
  else, and says it at once.

  The page reached the server on its own rather than through the console's one
  request path, so the server's refusal code never arrived, and three things went
  wrong on that page and no other.

  An operator on a server with no SIMMER_OPERATOR_ORG_ID got a red "Could Not
  Load" box reading "operator not configured". That names nothing anyone can act
  on. It is the Server Not Configured screen now, which names the variable to set
  and the service to set it on, the same screen the organizations list and the
  members list have always shown.

  A 403 or a 404 was retried three times with backoff before anything appeared, so
  the page spun for about six seconds and then explained itself. A refusal is an
  answer, so it now draws immediately.

  The message read "operator required" here and "operator_required" on every other
  page, off one server payload. One function writes it now, so the two agree.

- Fixed: on the foundations panel, the open ring beside a setup step nobody has
  done yet is dark enough to see. The ring is what says "still needed" next to the
  green check that says "in place", and it was drawing in the pale divider colour
  rather than the darker one the code asked for, because the darker role was
  declared in the stylesheet and never registered with Tailwind, so the class
  naming it generated no rule at all.

- Changed: page headings are one size across both consoles. Three heading
  treatments had grown at three declared sizes, so a catalog page, a record page
  and a domain overview each opened at a different weight of the same idea, and
  the catalog and cleanup pages, the inspections table and every console page sat
  a size below the rest. They all draw at the larger size now, from one component,
  and each carries the small label above the title that names the record type or
  the domain area.

- Fixed: Save stays pressable after a save that failed, so a dropped connection
  can be tried again without editing anything. Five console forms, the unit, genus
  and species catalog forms, Create Organization and the invitation form, left
  Save disabled once a write failed, and the only way to press it again was to
  change a field the operator did not mean to change.

  The two that held the failure in their own state, Create Organization and the
  invitation form, also drew a second alert with the same heading as the first.
  Every one of the five now shows the failure in the one alert the form was
  already drawing, and pressing Save runs the save again.

- Changed: the app no longer calls your Organization an agency. Not every customer
  is one: abatement districts, city and county programs, health departments,
  universities and contractors all run mosquito control, and the settings page has
  said Organization since it shipped while the copy around it said agency.

  Most of the strings did not need the noun and lost it. A catalog with nothing in
  it now reads "An owner or admin can add habitat types for you", the Outreach
  Methods page asks you to "Add the outreach methods you use", and the Collection
  Methods page describes "The trap types you run". Where the noun is the subject it
  says Organization: the sign-in screen, the general settings section, your
  profile's Organization card, and the conflict message when somebody else saves
  the same settings while you have them open.

  Two other fixes came with it. The four sheets on the settings page all say
  "Organization details are still loading." now, where two of them said agency.
  And the Contacts pages no longer call a member of the public an organization,
  which is the word for the body you work for: creating one reads "Add a person to
  the contact list", and the list describes "The people you engage with on service
  requests and notifications".

  Changed: the staging banner lists Organizations, not Agencies, among what
  staging refuses to change. The operations console shows the same banner.

## 0.5.1 — 2026-09-01

## 0.5.0 — 2026-08-31

### Minor Changes

- Added: an environment banner above both rails on staging, naming the environment
  and saying the data is a copy that the next refresh erases. It expands to the
  rule staging enforces, that sign-in accounts, Memberships, roles, Agencies and
  invitations cannot be changed there. Production shows nothing.

## 0.4.1 — 2026-08-31

### Patch Changes

- Changed: The search field is gone from the header. It shared the header with the agency workspace and never searched anything here — it took what you typed and dropped it. The operator console has its own record set, so it gets its own search when there is one to give.

- Fixed: A refused read now says so straight away. The console used to ask three more times over about six seconds before showing what the server had already answered, so the explanation arrived last.

- Fixed: Entering an agency no longer risks ending your session. Clicking it at the moment your sign-in was being renewed could sign you out, or report that you lack a membership you have.

- Fixed: Having the app open in several tabs no longer risks ending your session. Each tab renewed your sign-in on its own schedule, and two renewals landing together could sign you out of all of them.

- Fixed: When the SIMMER server has no operator organization configured, the console now says so and names the setting to change. It used to report the same thing it reports for an account that is not SIMMER's, and offer to sign you out, so the advice was to sign back in as SIMMER on a server that could not recognise one.

- Fixed: Your session no longer ends a minute after you sign in. Signing in again is not needed while you keep working, and being signed out mid-task should now be rare enough to notice.

- Fixed: The workspace loads again. Every synced table was arriving empty because the browser could not read the headers that tell it where a sync stream is, so the app reported that it could not find your agency.

## 0.4.0 — 2026-08-21

### Minor Changes

- Added: A page that fails to load now reports what broke, in a panel beside the navigation you were using, instead of a bare block of text with nothing to act on.

### Patch Changes

- Fixed: An invitation that cannot be sent now says which of three things went wrong, in SIMMER's words. It used to repeat whatever sentence the sign-in service wrote, which was a string nobody here controls.

- Fixed: Inviting somebody no longer reports a failure after their email has already gone out.

## 0.3.0 — 2026-08-21

### Minor Changes

- Changed: Reaching the operator console now requires being signed in as SIMMER, rather than holding an operator account. Operators join the agencies they support, and while signed in to one of those agencies the console previously still opened, so the same person could be acting as an agency's admin and working the control plane in the same session. It now refuses that case and says to sign back in as SIMMER, which is the step that fixes it. The refusal an operator sees when the console is not theirs to reach used to say their account was not on the operator list; that was rarely the reason and named a fix they could not perform themselves.

### Patch Changes

- Fixed: A failed invitation from the operator console no longer mails a sign-in link the agency has no record of. The invitation used to go out before the person was added, so an address that could not be invited got a working link while the invite came back as an error.

- Fixed: Deleting a unit is now refused while any agency has it set as a default, which the confirmation dialog had always promised. Deleting one used to succeed and leave that agency's default naming a unit that no longer existed.

## 0.2.0 — 2026-08-13

### Minor Changes

- Added: KMZ files are accepted everywhere KML already was — importing regions in bulk, filling a record's geometry from a file, and setting an agency's boundaries up in the console. A file saved out of Google Earth no longer has to be re-exported first, and it stays on your device as before.

## 0.1.0 — 2026-08-10

### Minor Changes

- Added: The first release in production use — agency creation and support, invitations, global taxonomy and units, and entering an agency to work on its behalf.
- Added: A version number under the SIMMER logo, linking to this page.
