create schema if not exists simmer;
grant usage on schema "simmer" to "postgres";
grant usage on schema "simmer" to "service_role";
grant usage on schema "simmer" to "authenticator";
revoke all on schema "simmer" from public;