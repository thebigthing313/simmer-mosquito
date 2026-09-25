-- migrate:up

-- A collation that orders the digits in a name as numbers.
--
-- The Habitats, Traps and Addresses rails and tables page their order out of
-- Postgres, and the default collation sorts `Habitat 10` ahead of `Habitat 9`.
-- The lists sorted in the browser already compare numbers as numbers; this
-- puts the paged readers on the same order.
--
-- ICU, `kn-true` for numeric ordering. Deterministic, which is the default and
-- is what btree ordering and equality under `order by` expect, so two names
-- that differ only in case or accent still compare as different strings and
-- the order is total. Created in the migration's schema so the throwaway test
-- schemas get their own copy.

create collation if not exists natural_sort (provider = icu, locale = 'en-u-kn-true');

-- migrate:down

drop collation if exists natural_sort;
