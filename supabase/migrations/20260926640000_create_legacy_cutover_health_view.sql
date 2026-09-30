create or replace view public.maestro_legacy_cutover_health as
select
  r.entity,
  r.module_key,
  r.status,
  r.read_mode,
  r.write_mode,
  r.legacy_read_allowed,
  r.legacy_write_allowed,
  h.legacy_count,
  h.relational_count,
  h.payload_mismatches,
  case
    when h.entity is null then 'not_in_health_view'
    when h.payload_mismatches <> 0 or h.legacy_count <> h.relational_count then 'diverged'
    when r.status in ('frozen', 'retired') and r.legacy_write_allowed then 'invalid_cutover'
    else 'ok'
  end as health_status
from public.legacy_cutover_registry r
left join public.maestro_dual_write_health h on h.entity = r.entity;

comment on view public.maestro_legacy_cutover_health is
  'Visão operacional combinando status de corte, modos de leitura/gravação e paridade do dual-write.';

revoke all on public.maestro_legacy_cutover_health from anon, authenticated;
grant select on public.maestro_legacy_cutover_health to service_role;
