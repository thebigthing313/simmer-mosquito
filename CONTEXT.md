# SIMMER Mosquito Context

This context captures project-specific domain language for mosquito control operations and surveillance workflows. It exists so architecture discussions use domain terms consistently.

## Language

### Agency And Identity

**Agency**:
A mosquito control organization that owns operational records and manages field workflows.
_Avoid_: tenant, account

**Profile**:
An agency-scoped person used for field attribution, audit attribution, and role-bound work.
_Avoid_: user, login, account

**Membership**:
A person's current access relationship to an agency through a role and profile.
_Avoid_: permission row, user role

**SIMMER Operator**:
A platform-side administrator who manages SIMMER-controlled setup and support workflows outside normal agency work.
_Avoid_: superuser, agency admin

### Foundation And Reference Data

**Address**:
An agency-owned address book entry that can help choose locations without becoming canonical for later operational records.
_Avoid_: canonical location, property

**Region**:
An agency-defined polygon used for GIS grouping, reporting, and spatial lookup.
_Avoid_: district, zone

**Region Folder**:
An agency-managed grouping for regions.
_Avoid_: region category

**Global Taxonomy**:
SIMMER-controlled mosquito genus and species vocabulary shared across agencies.
_Avoid_: agency species list

**Organization Species**:
An agency's selected subset of global species available for new data entry.
_Avoid_: enabled species, species setting

**Organization Lookup**:
An agency-owned catalog value used to configure surveillance or control workflows.
_Avoid_: dropdown option, enum

### Adult Surveillance

**Trap**:
A reusable adult surveillance configuration for collecting mosquitoes at a point location.
_Avoid_: physical trap, equipment

**Collection**:
An adult surveillance field collection attempt or collected record.
_Avoid_: trap event, sample

**Species Count**:
An analysis row that records mosquito counts for one species within a collected adult surveillance collection.
_Avoid_: result, identification

**Bycatch**:
Non-mosquito organisms or material observed in an adult surveillance collection.
_Avoid_: non-mosquito result

### Larval Surveillance

**Habitat**:
A reusable larval surveillance source or location that an agency may return to.
_Avoid_: site, inspection location

**Habitat Inspection**:
A larval field observation recorded against a cataloged habitat.
_Avoid_: habitat visit

**Ad Hoc Inspection**:
A larval field observation recorded without attaching it to a cataloged habitat.
_Avoid_: temporary habitat, one-off habitat

**Inspection Sample**:
Larvae or suspected larvae collected from a breeding-positive larval inspection.
_Avoid_: collection, specimen

**Unlabeled Sample**:
An inspection sample intentionally recorded without a field label for after-the-fact office entry.
_Avoid_: anonymous sample

**Sample Species Count**:
An analysis row that records larvae count for one species within an inspection sample.
_Avoid_: sample result

**Larval Density**:
A larval abundance bucket for an inspection, either entered directly or inferred from larvae per dip.
_Avoid_: infestation level

### Field-Work Support

**Comment**:
A user-authored plain-text field note attached to a supported domain record.
_Avoid_: note, message

**Tag**:
An organization-scoped label assigned to supported records for lightweight categorization.
_Avoid_: label, category

**Additional Personnel**:
Supplemental participation metadata for people who helped with field work but were not the primary performer.
_Avoid_: assignee, crew

**Route**:
A reusable ordered list of stable trap or habitat targets.
_Avoid_: assignment template, itinerary

**Assignment**:
A dated ordered worklist for a person or crew.
_Avoid_: route, mission

**Assignment Item**:
One target entry in an assignment, with its own progress state.
_Avoid_: task

### Control Operations

**Control Method**:
An agency catalog entry describing how a control action may be performed.
_Avoid_: treatment type

**Chemical Application**:
A performed control action that applies one insecticide.
_Avoid_: application row, treatment

**Source Reduction**:
A performed control action that removes, eliminates, or modifies mosquito sources without applying insecticide.
_Avoid_: cleanup

**Outreach Action**:
A performed control action that records education, contact, or public-facing engagement work.
_Avoid_: notification, visit

**Biocontrol Action**:
A performed control action that releases biological control organisms or material.
_Avoid_: biological application

**Requested Control Action**:
A recommendation or request for future control work before a performed control action exists.
_Avoid_: work order, mission item

**Insecticide**:
An agency product catalog entry for a chemical product used in control operations.
_Avoid_: chemical, product

**Insecticide Batch**:
An operational lot or batch under an insecticide product.
_Avoid_: inventory item

**Formulation**:
A calculator/template that expands into one or more chemical applications without becoming historical application data.
_Avoid_: tank mix record, application group

### Public Engagement

**Contact**:
An agency-owned public person or public organization record.
_Avoid_: resident, caller

**Service Request**:
A public-facing request for agency attention at an address-backed location.
_Avoid_: ticket, complaint

**Notification Type**:
An agency catalog entry describing a class of mission notification.
_Avoid_: notification channel

**Notification Registration**:
A contact's area-based subscription or operational warning record.
_Avoid_: subscription, no-spray polygon

**Mission Notification**:
A generated manual worklist record for contacting an eligible registration about a mission.
_Avoid_: sent notification, delivery receipt

### Mission Dispatch

**Mission**:
A scheduled control-work dispatch plan with ordered target items and lifecycle state.
_Avoid_: assignment, route

**Mission Item**:
An ordered target geometry row inside a mission.
_Avoid_: assignment item, task

**Mission Progress**:
The derived execution state of a mission or mission item from its timestamps.
_Avoid_: status enum

### Weather

**Weather Station**:
An agency-managed point source for weather summary data.
_Avoid_: weather source

**Weather Summary**:
An agency-managed aggregate weather bucket for a station over an inclusive date range.
_Avoid_: observation, raw reading

**Weather Summary Import**:
A reviewed batch of normalized weather summary rows committed for one station.
_Avoid_: upload session

### Location Sources

**Location Source Flow**:
The allowed movement from one domain record or manual geometry into another record's stored operational geometry.
_Avoid_: generic location reference, arbitrary source link

**Manual Drawing**:
User-provided GeoJSON geometry that directly defines the command's intended location.
_Avoid_: freehand blob, custom shape

**Address Geometry**:
The stored point geometry associated with an address, used as a convenience source for operational geometry.
_Avoid_: canonical location

**Trap Geometry**:
The point geometry stored for an adult surveillance trap.
_Avoid_: trap area

**Habitat Geometry**:
The point, line, or polygon geometry stored for a reusable larval surveillance habitat.
_Avoid_: larval site shape

**Ad Hoc Inspection Geometry**:
The geometry stored on a one-off larval inspection that is not yet attached to a reusable habitat.
_Avoid_: temporary habitat geometry

**Habitat Inspection Geometry**:
The snapshot geometry copied from a habitat when recording an inspection against that habitat.
_Avoid_: live habitat geometry

**Control Action Geometry**:
The geometry stored for a performed chemical application, source reduction, outreach action, or biocontrol action.
_Avoid_: control location

**Inherited Control Geometry**:
Control action geometry initially sourced from a parent inspection, requested control action, or mission workflow, with optional manual override.
_Avoid_: generic source copy

**Requested Control Action Geometry**:
The geometry stored for a request to perform control work before an actual control action exists.
_Avoid_: request location

**Mission Item Geometry**:
The authoritative target geometry stored for one ordered mission item.
_Avoid_: mission task location

**Weather Station Geometry**:
The point geometry stored for an agency-managed weather station.
_Avoid_: weather source location source

## Relationships

- An **Agency** owns operational records and settings.
- A **Profile** belongs to one **Agency**.
- A **Membership** links a login-capable person to one **Profile** in one **Agency**.
- An **Address** can provide **Address Geometry**, but later address edits do not move operational records.
- A **Region Folder** contains zero or more **Regions**.
- **Global Taxonomy** provides species vocabulary, while **Organization Species** controls new agency data entry.
- A **Trap** can produce many **Collections**.
- A **Collection** can have many **Species Counts**.
- A **Habitat** can have many **Habitat Inspections**.
- An **Ad Hoc Inspection** may be promoted into a **Habitat**.
- An **Inspection Sample** belongs to one larval inspection and can have many **Sample Species Counts**.
- A **Route** contains ordered trap or habitat targets.
- An **Assignment** contains ordered **Assignment Items** for trap, habitat, or service request targets.
- A **Requested Control Action** may later be linked to a performed **Chemical Application**, **Source Reduction**, **Outreach Action**, or **Biocontrol Action**.
- A **Formulation** can generate multiple **Chemical Applications**, but those applications do not store the formulation.
- A **Service Request** belongs to a **Contact** and location.
- A **Notification Registration** belongs to a **Contact**.
- A **Mission** contains ordered **Mission Items**.
- A **Mission Item** can produce zero or more performed control actions.
- A **Weather Station** has many **Weather Summaries**.
- A **Trap Geometry** can come from **Address Geometry** or **Manual Drawing**.
- A collection's geometry can come from **Trap Geometry**, **Address Geometry**, or **Manual Drawing**.
- A **Habitat Geometry** can come from **Manual Drawing**, **Address Geometry**, or **Ad Hoc Inspection Geometry**.
- A **Habitat Inspection Geometry** always comes from the habitat's geometry at the time of inspection.
- An **Ad Hoc Inspection Geometry** can come from **Manual Drawing**, **Address Geometry**, **Habitat Geometry**, or service request geometry.
- A **Control Action Geometry** can be created ad hoc from **Manual Drawing**, **Address Geometry**, service request geometry, or **Habitat Geometry**.
- A **Control Action Geometry** can use **Inherited Control Geometry** from an inspection, requested control action, or mission workflow, with optional **Manual Drawing** override.
- A **Requested Control Action Geometry** can come from **Manual Drawing**, **Address Geometry**, **Habitat Geometry**, **Trap Geometry**, collection geometry, inspection geometry, or service request geometry.
- A **Mission Item Geometry** can come from the same source flow as **Requested Control Action Geometry**, plus requested control action geometry.
- A **Weather Station Geometry** comes from **Manual Drawing** only; address lookup may help the UI choose the point but is not a command source.
- **Address Geometry** is a convenience source; later address edits do not automatically move operational records.

## Example Dialogue

> **Dev:** "Can a trap use a habitat as its location source?"
> **Domain expert:** "No. A trap is point-only and can come from an address or manual drawing. A collection can come from a trap, an address, or manual drawing."
>
> **Dev:** "Is a route the same thing as an assignment?"
> **Domain expert:** "No. A route is the reusable ordered target list. An assignment is the dated worklist someone executes."
>
> **Dev:** "If a formulation is used in the field, do we store that formulation on the application?"
> **Domain expert:** "No. The formulation helps calculate separate chemical applications; each application stores the actual insecticide and amount."
>
> **Dev:** "Can a service request become a mission item?"
> **Domain expert:** "Only through the allowed mission item location source flow. The mission item stores its own target geometry."
>
> **Dev:** "When an ad hoc inspection becomes a full-time habitat, do we redraw it?"
> **Domain expert:** "No. The habitat can source its geometry from the ad hoc inspection snapshot."
>
> **Dev:** "Can a habitat inspection change the geometry while recording results?"
> **Domain expert:** "No. A habitat inspection is locked to the habitat geometry at that instance. Use an ad hoc inspection when sourcing from manual drawing, an address, or another habitat."
>
> **Dev:** "When control work comes from a requested action or mission, is the location just another source?"
> **Domain expert:** "Not quite. The control action inherits geometry from that workflow, but the user can override it with a manual drawing when the treatment boundary differs."
>
> **Dev:** "Can mission items inherit from requested control actions?"
> **Domain expert:** "Yes. Mission items can use the same source flow as requested control actions, and can additionally inherit requested control action geometry."
>
> **Dev:** "Does a weather station source geometry from an address?"
> **Domain expert:** "No. Address lookup can help pick the point, but the command carries explicit point geometry."

## Flagged Ambiguities

- "point location source" can mean explicit point geometry or any source expected to resolve to a point. Resolved: use **Location Source Flow** to define which sources are semantically allowed for each command.
- "route", "assignment", and "mission" are easy to conflate. Resolved: a **Route** is reusable planning, an **Assignment** is dated field work, and a **Mission** is scheduled control-work dispatch.
- "application" can mean a software application or a control action. Resolved: use **Chemical Application** for performed insecticide work.
- "notification" can mean contact preference, generated worklist row, or delivery. Resolved: use **Notification Type**, **Notification Registration**, and **Mission Notification** for the v1 domain concepts.
