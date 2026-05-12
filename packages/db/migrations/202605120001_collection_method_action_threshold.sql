-- migrate:up

alter table collection_methods
  add column action_threshold integer,
  add constraint collection_methods_action_threshold_nonnegative
    check (action_threshold is null or action_threshold >= 0);

-- migrate:down

alter table collection_methods
  drop constraint if exists collection_methods_action_threshold_nonnegative,
  drop column if exists action_threshold;
