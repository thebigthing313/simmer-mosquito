# Simmer Mosquito Database Documentation

## Overview

This database supports a mosquito surveillance application with multi-tenancy (group-based), role-based access control, and comprehensive tracking of adult and larval mosquito populations.

## Schema Organization

The database is organized into logical domains:

- **simmer**: Core infrastructure (soft delete, audit trails, extensions)
- **100 - auth**: Authentication and authorization (groups, roles, profiles)
- **200 - general**: Shared resources (comments, units, genera, species, tags, contacts)
- **300 - gis**: Geographic information (locations, regions)
- **400 - adult surveillance**: Adult mosquito trapping data
- **500 - larval surveillance**: Larval mosquito inspection data
- **600 - public outreach**: (Not yet implemented)

## Extensions

- **PostGIS**: Spatial database functionality for geographic data

## Core Infrastructure

### Schemas

- **simmer**: Private schema for internal functions and soft-deleted data
- **public**: Main schema for application tables

### Soft Delete System

- Table: `simmer.deleted_data`
- Trigger: `simmer.soft_delete()` - Archives deleted records as JSONB before deletion
- Applied to: All user-facing tables

### Audit Fields

All tables include:

- `created_at` (timestamptz)
- `created_by` (uuid → auth.users)
- `updated_at` (timestamptz)
- `updated_by` (uuid → auth.users)

### Automatic Triggers

1. **set_created_by**: Automatically sets `created_by` to current user on INSERT
2. **set_updated_record_fields**: Updates `updated_at` and `updated_by` on UPDATE
3. **soft_delete**: Archives record before DELETE

## Authentication & Authorization

### Groups (`public.groups`)

Multi-tenant organization structure. Each group represents an independent mosquito control district or organization.

**Key Fields:**

- `group_name`, `short_name`
- Contact info: `address`, `phone`, `fax`, `website_url`
- `logo_url`

**Access Control:**

- SELECT: Group members only
- INSERT: None (must be created by system)
- UPDATE: Group owners (role_id = 1)
- DELETE: None

### Roles (`public.roles`)

Role hierarchy with lower numbers = higher privileges:

1. Owner (highest privilege)
2. Administrator
3. Manager
4. Collector (lowest privilege)

**Access Control:**

- SELECT: Public (anyone can view available roles)
- INSERT/UPDATE/DELETE: None (system-managed)

### Profiles (`public.profiles`)

User profiles linking auth.users to groups and roles.

**Key Fields:**

- `user_id` (unique, references auth.users)
- `group_id` (references groups)
- `role_id` (references roles)
- `first_name`, `last_name`, `avatar_url`

**Special Features:**

- **JWT Metadata Sync**: Trigger `ids_to_app_metadata_trigger` automatically syncs profile_id, group_id, and role_id to JWT claims for efficient RLS checks
- **User ID Protection**: Trigger `prevent_user_id_change_trigger` prevents modification of user_id after creation
- **All-or-Nothing**: user_id and role_id are handled atomically in JWT metadata

**Access Control:**

- SELECT: Group members
- INSERT: Group owners, user_id must be null initially
- UPDATE: Group owners
- DELETE: Group owners

### RLS Helper Functions

**`user_is_group_member(p_group_id uuid)`**

- Checks if current user belongs to specified group
- Returns true if p_group_id is null (public access)
- Uses JWT app_metadata for performance

**`user_has_group_role(p_group_id uuid, p_role_id integer)`**

- Checks if user has sufficient role privileges (role_id <= p_role_id)
- Lower role_id numbers = higher privilege
- Returns false if not a group member

**`user_owns_record(p_user_id uuid)`**

- Checks if record was created by current user
- Used for allowing users to manage their own records

## General Tables

### Comments (`public.comments`)

Generic commenting system for any object type.

**Key Fields:**

- `object_type`, `object_id` (polymorphic reference)
- `comment_text`
- `parent_id` (for threaded comments)
- `is_pinned`

**Access Control:**

- SELECT/INSERT: Group members
- UPDATE/DELETE: Group managers OR record creator

### Units (`public.units`)

Measurement unit conversion system.

**Types:** weight, distance, area, volume, temperature, time, count
**Systems:** SI, imperial, US customary

**Key Fields:**

- `unit_name`, `abbreviation`
- `base_unit_id` (self-reference for base units)
- `conversion_factor`, `conversion_offset`

**Constraints:**

- Base units must reference themselves with factor = 1.0
- Non-base units must have non-zero conversion factor

**Access Control:**

- SELECT: Public (read-only reference data)
- INSERT/UPDATE/DELETE: None (system-managed)

### Genera & Species (`public.genera`, `public.species`)

Mosquito taxonomy reference tables.

**Genera Fields:** `genus_name`, `abbreviation`, `description`
**Species Fields:** `species_name`, `sample_photo_url`, `description`, `genus_id`

**Access Control:**

- SELECT: Public (read-only reference data)
- INSERT/UPDATE/DELETE: None (system-managed)

### Tag Groups & Tags (`public.tag_groups`, `public.tags`)

Flexible tagging system for categorization.

**Tag Groups:**

- Optional grouping mechanism for tags
- Can be group-specific or shared (group_id nullable)

**Tags:**

- `name`, `description`, `color` (html_color domain: #rrggbb format)
- `tag_group_id` (optional organization)
- Unique constraint: (group_id, tag_group_id, name)

**Access Control:**

- SELECT: Group members (or public if group_id is null for tag_groups)
- INSERT/UPDATE/DELETE: Group administrators (role_id ≤ 2)

### Contacts (`public.contacts`)

Contact information management.

**Key Fields:**

- Person: `first_name`, `last_name`, `title`
- Organization: `organization`
- Contact info: `primary_phone`, `secondary_phone`, `fax_number`, `email`

**Access Control:**

- SELECT: Group members
- INSERT/UPDATE/DELETE: Group managers (role_id ≤ 3)

## GIS Tables

### Locations (`public.locations`)

Point locations with addresses.

**Key Fields:**

- `location_name`, `address`
- `lat`, `lng`
- `geom` (generated Point geometry from lat/lng)

**Indexes:** GIST index on geom

**Access Control:**

- SELECT: Group members
- INSERT: Group collectors (role_id ≤ 4)
- UPDATE/DELETE: Own records if collector, all records if manager

### Regions (`public.regions`)

Polygon regions with optional hierarchy.

**Key Fields:**

- `region_name`
- `geom` (MultiPolygon)
- `parent_id` (self-reference for hierarchical regions)

**Constraints:** Cannot be own parent

**Access Control:**

- SELECT: Group members
- INSERT/UPDATE/DELETE: Group administrators (role_id ≤ 2)

### Region Subdivisions (`public.region_subdivisions`)

Automatically subdivided polygons for performance.

**Key Fields:**

- `region_id`
- `geom` (Polygon - subdivided from parent region)

**Special Features:**

- **Auto-generation**: Trigger `refresh_region_subdivisions_trigger` automatically subdivides region MultiPolygons into smaller Polygons (max 128 vertices) on INSERT/UPDATE
- Uses ST_Subdivide for spatial query optimization

**Indexes:** GIST index on geom

**Access Control:**

- SELECT: Group members
- INSERT/UPDATE/DELETE: Group administrators (role_id ≤ 2)

## Adult Surveillance

### Trap Types (`public.trap_types`)

Types of mosquito traps (e.g., CDC Light Trap, BG-Sentinel).

**Key Fields:**

- `trap_type_name` (unique)
- `group_id` (nullable - can be shared or group-specific)

**Access Control:**

- SELECT: Group members or public if group_id is null
- INSERT/UPDATE/DELETE: Group administrators (role_id ≤ 2)

### Trap Lures (`public.trap_lures`)

Attractants used in traps (e.g., CO2, Octenol).

**Key Fields:**

- `lure_name` (unique)
- `group_id` (nullable - can be shared or group-specific)

**Access Control:**

- SELECT: Group members or public if group_id is null
- INSERT/UPDATE/DELETE: Group managers (role_id ≤ 3)

### Traps (`public.traps`)

Physical trap locations and configurations.

**Key Fields:**

- `trap_type_id`
- `lat`, `lng`, `geom` (generated Point)
- `trap_name`, `trap_code`
- `is_active`, `is_permanent`
- `location_id` (optional reference)
- `metadata` (jsonb for flexible data)

**Indexes:** GIST index on geom

**Access Control:**

- SELECT: Group members
- INSERT/UPDATE/DELETE: Group managers (role_id ≤ 3)

### Collections (`public.collections`)

Trap collection events.

**Key Fields:**

- `trap_id`
- `collection_date`, `collected_by`
- `trap_set_date`, `trap_set_by`, `trap_nights`
- `trap_lure_id`
- `has_problem` (flag for problematic collections)

**Access Control:**

- SELECT/INSERT/UPDATE: Group collectors (role_id ≤ 4)
- DELETE: Group managers OR record creator

### Collection Species (`public.collection_species`)

Species counts from collections.

**Key Fields:**

- `collection_id`, `species_id`
- `count` (constraint: non-negative)
- `identified_by`, `identified_date`
- `sex` (enum: male, female)
- `status` (enum: damaged, unfed, bloodfed, gravid)

**Access Control:**

- SELECT/INSERT/UPDATE/DELETE: Group collectors (role_id ≤ 4)

## Larval Surveillance

### Larval Densities (`public.larval_densities`)

Density classification ranges for larval counts.

**Key Fields:**

- `range_start`, `range_end`
- `name` (e.g., "Low", "Medium", "High")

**Constraints:** range_start < range_end

**Access Control:**

- SELECT: Group members
- INSERT/UPDATE/DELETE: Group managers (role_id ≤ 3)

### Habitats (`public.habitats`)

Larval habitat locations.

**Key Fields:**

- `lat`, `lng`, `geom` (generated Point)
- `name`, `description`
- `is_active`, `is_permanent`, `is_inaccessible`
- `location_id` (optional reference)
- `metadata` (jsonb)

**Indexes:** GIST index on geom

**Access Control:**

- SELECT: Group members
- INSERT/UPDATE: Group collectors (role_id ≤ 4)
- DELETE: Group managers (role_id ≤ 3)

### Habitat Tags (`public.habitat_tags`)

Many-to-many relationship between habitats and tags.

**Key Fields:**

- `habitat_id`, `tag_id`

**Access Control:**

- SELECT/INSERT/UPDATE/DELETE: Group collectors (role_id ≤ 4)

### Inspections (`public.inspections`)

Larval habitat inspection records.

**Key Fields:**

- `habitat_id`, `inspection_date`, `inspector_id`
- `is_wet`
- Larval data: `dips`, `total_larvae`, `density_id`
- Life stages: `has_eggs`, `has_1st_instar`, `has_2nd_instar`, `has_3rd_instar`, `has_4th_instar`, `has_pupae`
- `notes`

**Constraints:**

- If dry (is_wet = false), no larvae data required
- If wet, larval data is optional (allows recording wet inspections with no larvae found)

**Access Control:**

- SELECT/INSERT/UPDATE: Group collectors (role_id ≤ 4)
- DELETE: Group managers OR record creator

## Design Decisions

### Multi-Tenant Data Isolation

- All data is scoped to `group_id` representing independent mosquito control districts
- Groups cannot access each other's data through RLS policies
- Some reference tables (trap_types, trap_lures, tag_groups) can be shared (group_id nullable) or group-specific

### User Profile & Authentication

- **Nullable user_id**: Profiles can exist without a linked auth.user to support historical data entry
  - Real users: Must have exactly one profile linked via user_id
  - Historical records: Profiles with null user_id represent people who don't have system access (e.g., retired staff, external contacts)
- Insert policy requires `user_id is null` on profile creation, then linked separately

### Cascade and Deletion Behavior

- **Collections**: `trap_id` uses `on delete restrict` - prevents trap deletion if collections exist (data preservation)
- **Collection Species**: `collection_id` uses `on delete cascade` - deletes species data when collection is deleted
- **Audit Fields**: All `created_by`/`updated_by` use `on delete set null` - preserves records even if user account is deleted (except groups table which uses restrict)

### Location Architecture

- **locations table**: Stores general locations with addresses (e.g., "123 Main St, City Park")
- **lat/lng on traps/habitats**: Precise GPS coordinates of the specific object
  - Objects can reference a location but have their own exact coordinates
  - Example: A trap at City Park may have location_id pointing to the park address, but lat/lng is the exact trap position
  - Coordinates are intentionally separate and may differ from the location's coordinates

### Larval Inspection Data

- **Wet habitats can have no larvae**: The constraint intentionally allows `is_wet=true` with no larval counts
  - Represents inspections where habitat was wet but no larvae were found
  - All larval data fields are optional when habitat is wet

### Tag System

- **tag_groups**: Can have nullable group_id for system-wide shared tag groups (e.g., "Water Body Type", "Vegetation")
  - Shared tag groups are read-only templates that all groups can see
  - Groups must create their own tag_groups to organize their tags
- **tags**: Always requires group_id (not nullable)
  - Groups create their own tags, even if categorizing them under a shared tag_group
  - Example: Shared tag_group "Habitat Type" exists with group_id=null
  - Each group creates their own "Standing Water", "Tree Hole" tags with their group_id, optionally linked to the shared tag_group
  - Unique constraint: (group_id, tag_group_id, name) prevents duplicate tag names within a group's tag_group

### Spatial Indexing

- All geometry columns have GIST indexes for efficient spatial queries
- Regions table includes GIST index on geom column
- Region subdivisions auto-generate from parent regions for query optimization

## RLS Security Model

All tables use Row Level Security (RLS) with policies based on:

1. **Group Membership**: Users can only access data from their group
2. **Role Hierarchy**: Lower role_id = higher privileges
3. **Record Ownership**: Users can modify/delete their own records (where applicable)

**Common Patterns:**

- **Reference Data** (genera, species, units, roles): Public read, no write
- **Shared Optional** (trap_types, trap_lures, tag_groups): Read if member or null group_id
- **Group Scoped**: All other tables restricted to group members
- **Privilege Tiers**:
  - Collectors (4): Can create and modify data
  - Managers (3): Can delete others' data, manage configurations
  - Administrators (2): Can modify reference tables, regions
  - Owners (1): Can modify group and profiles

## Geometry Handling

All spatial columns:

- Use SRID 4326 (WGS 84 - standard GPS coordinates)
- Generated automatically from lat/lng columns
- Indexed with GIST for spatial queries
- Use PostGIS extension in `extensions` schema

**Spatial Tables:**

- `locations`: Point
- `traps`: Point
- `habitats`: Point
- `regions`: MultiPolygon
- `region_subdivisions`: Polygon (auto-generated)

---

_Database Version: 2026-01-18_
_Last Migration: 20260118164955_various_fixes_and_tag_groups.sql_
