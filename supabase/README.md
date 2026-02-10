# Simmer Database Schema Documentation

## Table of Contents
1. [Overview](#overview)
2. [Database Structure](#database-structure)
3. [Architectural Decisions](#architectural-decisions)
4. [Permissions Reference Table](#permissions-reference-table)
5. [Error Reports & Issues](#error-reports--issues)
6. [Recommendations](#recommendations)

---

## Overview

The Simmer database is a comprehensive PostgreSQL/PostGIS system for mosquito abatement district management. It tracks adult and larval mosquito surveillance, insecticide control operations, public outreach, and geographic information.

**Key Statistics:**
- **Total Tables:** 50+ tables
- **Schemas:** Public schema with simmer schema for internal functions
- **Extensions:** PostGIS for geospatial operations
- **Primary Features:** Multi-tenant architecture, soft deletes, audit trails, row-level security

---

## Database Structure

### 000 - Simmer (Foundation)
Core system functionality and shared infrastructure.

| Table/Function | Purpose |
|----------------|---------|
| `extensions.postgis` | PostGIS extension for spatial operations |
| `simmer` schema | Internal schema for soft delete tracking and triggers |
| `simmer.deleted_data` | Stores soft-deleted records as JSONB |
| `simmer.soft_delete()` | Trigger function for soft deletes |
| `public.set_audit_fields()` | Auto-sets created_at, created_by, updated_at, updated_by |

### 100 - Authentication & Authorization
Multi-tenant user and permission management.

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `groups` | Organizations/districts | Main tenant identifier |
| `roles` | Permission levels | Integer-based hierarchy (lower = more power) |
| `profiles` | User accounts | Links to auth.users, includes role & group |

**RLS Helper Functions:**
- `user_is_group_member(group_id)` - Checks group membership
- `user_has_group_role(group_id, role_id)` - Validates role level (≤ comparison)
- `user_owns_record(user_id)` - Checks record ownership

---

## Permissions Reference Table

### Legend
- **Select:** Read access
- **Insert:** Create new records
- **Update:** Modify existing records
- **Delete:** Remove records

| Table | Select | Insert | Update | Delete |
|-------|--------|--------|--------|--------|
| **AUTH & CORE** |
| `groups` | Group Member | ❌ None | Owner (1) | ❌ None |
| `roles` | 🌍 Public | ❌ None | ❌ None | ❌ None |
| `profiles` | Group Member | Owner (1) | Owner (1) | Owner (1) |
| **REFERENCE DATA** |
| `units` | 🌍 Public | ❌ None | ❌ None | ❌ None |
| `genera` | 🌍 Public | ❌ None | ❌ None | ❌ None |
| `species` | 🌍 Public | ❌ None | ❌ None | ❌ None |
| `tag_groups` | Authenticated | ❌ None | ❌ None | ❌ None |
| `tags` | Group Member | Admin (2) | Admin (2) | Admin (2) |
| `contacts` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `insecticides` | Group Member | Admin (2) | Admin (2) | Admin (2) |
| `insecticide_batches` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `vehicles` | Group Member | Admin (2) | Admin (2) | Admin (2) |
| **GIS** |
| `addresses` | Group Member | Collector (4) | Collector (4)* or Manager (3) | Collector (4)* or Manager (3) |
| `address_tags` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `region_folders` | Group Member | Admin (2) | Admin (2) | Admin (2) |
| `regions` | Group Member | Admin (2) | Admin (2) | Admin (2) |
| `routes` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `route_items` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| **ADULT SURVEILLANCE** |
| `trap_types` | Group Member | Admin (2) | Admin (2) | Admin (2) |
| `trap_lures` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `traps` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `trap_tags` | Group Member | Collector (4) | Collector (4) | Collector (4) |
| `collections` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `landing_rates` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `collection_species` | Group Member | Collector (4) | Collector (4) | Collector (4) |
| **LARVAL SURVEILLANCE** |
| `densities` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `habitats` | Group Member | Collector (4) | Collector (4) | Manager (3) |
| `habitat_tags` | Group Member | Collector (4) | Collector (4) | Collector (4) |
| `inspections` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `aerial_sites` | Group Member | Admin (2) | Admin (2) | Admin (2) |
| `aerial_inspections` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `samples` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `sample_results` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| **PUBLIC OUTREACH** |
| `service_requests` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `service_request_tags` | Group Member | Collector (4) | Collector (4) | Collector (4) |
| **INSECTICIDE CONTROL** |
| `applications` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `hand_ulvs` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `truck_ulvs` | Group Member | Collector (4) | Collector (4) | Manager (3) or Own |
| `ulv_missions` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `catch_basin_missions` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `flights` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `flight_aerial_sites` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| `flight_batches` | Group Member | Manager (3) | Manager (3) | Manager (3) |
| **GENERAL** |
| `comments` | Group Member | Group Member | Manager (3) or Own | Manager (3) or Own |
| `additional_personnel` | Group Member | Group Member | Manager (3) or Own | Manager (3) or Own |

\* *Own records only; Manager can modify all*

---

## Error Reports & Issues

### � All Critical Issues Resolved

All previously identified critical errors have been addressed. The schema is ready for migration testing.

---

### 🟡 Warnings (Design Issues)

#### 1. Regions Table - Duplicate Names By Design
- **Note:** `regions` table intentionally allows duplicate `region_name` values within same group
- **Rationale:** Business requirement supports same name for different polygon types (e.g., "Metuchen" for both Zip Code and Municipality polygons)
- **User Responsibility:** Application layer handles disambiguation

---

### 🟢 Future Optimizations (Deferred)

#### 1. Performance Indexes
After collecting usage data, consider:
- Composite indexes for common query patterns
- Partial indexes on `is_active` columns
- Indexes on `created_by` for owner-based policy queries

#### 2. Materialized Views
For common aggregate queries:
- Weekly trap collection summaries by species
- Inspection activity by region
- Treatment coverage statistics

#### 3. Documentation
After first public release:
- Add PostgreSQL comments on tables and columns
- Document complex constraints and business rules
---

## Recommendations

### Before Migration

1. **Test RLS Policies** - Verify all policies work with sample data
2. **Document Role Values** - Create seed data for `roles` table with clear hierarchy
3. **Run Migration Test** - Execute all schema files in order to verify no errors

### Schema Organization

```sql
-- Suggested migration file order:
-- 1. Extensions and schemas (000 - simmer/000-100)
-- 2. Triggers and functions (000 - simmer/200-300)
-- 3. Auth helpers (100 - auth/000)
-- 4. Core auth tables (100 - auth/100-400)
-- 5. Reference data (200 - general/*)
-- 6. GIS foundation (300 - gis/100-200)
-- 7. Larval tables for forward refs (500/100 - habitats.sql only)
-- 8. GIS routes (300 - gis/300+)
-- 9. Adult surveillance (400/*)
-- 10. Remaining larval (500/*)
-- 11. Public outreach (600/*)
-- 12. Insecticide control (700/*)
-- 13. Cross-cutting tables (999/*)
-- Note: route_items moved to 999 - general to resolve forward reference to habitats
```

### Security Considerations

1. **Validate JWT Claims** - Ensure `group_id` and `role_id` are properly set during signup
2. **Prevent Privilege Escalation** - ✅ Trigger added in `100 - auth/400 - prevent_role_escalation.sql`
3. **Audit Critical Operations** - Consider separate logging for role/group changes
4. **Rate Limiting** - Handled by Supabase (1000 row limit per API call)

### Performance Optimization

1. **Connection Pooling** - Handled by Supabase
2. **Prepared Statements** - Handled by Supabase
3. **Regular VACUUM** - Handled by Supabase
4. **Partition Large Tables** - Consider if app scales: collections, inspections, applications

### Testing Checklist

- [ ] All tables created successfully
- [ ] All foreign keys resolve correctly
- [ ] RLS policies enforced on all tables with policies
- [ ] Users can only access their own group's data
- [ ] Role hierarchy works correctly (Owner > Admin > Manager > Collector)
- [ ] Soft delete triggers fire and store data correctly
- [ ] Audit fields auto-populate on insert/update
- [ ] Geometric columns generate correctly from lat/lng
- [ ] All unique constraints prevent duplicate data
- [ ] Check constraints validate business rules
- [ ] JWT claims sync correctly on profile changes

---

## Appendix: Table Counts by Module

| Module | Tables | Enums | Functions |
|--------|--------|-------|-----------|
| Simmer Core | 1 | 0 | 2 |
| Auth | 3 | 0 | 4 |
| General Reference | 9 | 3 | 0 |
| GIS | 5 | 0 | 0 |
| Adult Surveillance | 7 | 2 | 0 |
| Larval Surveillance | 8 | 1 | 0 |
| Public Outreach | 3 | 1 | 0 |
| Insecticide Control | 9 | 0 | 0 |
| Cross-Cutting | 3 | 0 | 0 |
| **Total** | **48** | **7** | **6** |

---

**Document Version:** 1.2  
**Last Updated:** February 10, 2026  
**Schema Review Status:** ✅ Ready for Migration Testing

**Recent Changes:**
- ✅ All syntax errors corrected
- ✅ All foreign key references fixed
- ✅ All RLS policies enabled
- ✅ PostGIS function prefixes standardized
- ✅ Enum naming conventions standardized
- ✅ Forward reference resolved (route_items moved to 999 - general)
- ✅ Privilege escalation prevention trigger added
- ✅ Notifications table added

