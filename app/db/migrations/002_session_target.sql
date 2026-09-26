-- The Orqea environment the admin console was inspecting when it opened this session (SSO
-- `target` claim). Null for tokens minted without it.
alter table sessions add column target text;
