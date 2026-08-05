-- migrate:up

-- Deleting an address asks twelve tables whether they still name it, and does so
-- twice: once when the detail page reads the delete impact, and again inside the
-- delete transaction. Six of those twelve had no index on `address_id`, so each
-- of those counts fell back to walking every live row the agency owns in the
-- table — and `applications` is the table that grows fastest.
--
-- The other six already carried this index; these six were simply never added,
-- because until the delete policy existed nothing queried them by address. The
-- shape matches the convention already set by `applications_organization_habitat_idx`
-- and its siblings: organization first, partial on the rows a live lookup can
-- match.

create index applications_organization_address_idx
  on applications (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index source_reductions_organization_address_idx
  on source_reductions (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index outreach_actions_organization_address_idx
  on outreach_actions (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index biocontrol_actions_organization_address_idx
  on biocontrol_actions (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index requested_control_actions_organization_address_idx
  on requested_control_actions (organization_id, address_id)
  where deleted_at is null and address_id is not null;

create index mission_items_organization_address_idx
  on mission_items (organization_id, address_id)
  where deleted_at is null and address_id is not null;

-- migrate:down

drop index if exists applications_organization_address_idx;
drop index if exists source_reductions_organization_address_idx;
drop index if exists outreach_actions_organization_address_idx;
drop index if exists biocontrol_actions_organization_address_idx;
drop index if exists requested_control_actions_organization_address_idx;
drop index if exists mission_items_organization_address_idx;
