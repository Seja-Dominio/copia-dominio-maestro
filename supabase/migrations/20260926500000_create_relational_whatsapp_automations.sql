create table if not exists public.maestro_whatsapp_automations (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default '',
  name text not null default '',
  active boolean not null default true,
  group_id text,
  schedule_time text,
  frequency text,
  automation_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);
create index if not exists maestro_whatsapp_automations_org_active_idx on public.maestro_whatsapp_automations (organization_id, active, schedule_time);
alter table public.maestro_whatsapp_automations enable row level security;

insert into public.maestro_whatsapp_automations (legacy_record_id,organization_id,kind,name,active,group_id,schedule_time,frequency,automation_payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'kind',''),coalesce(l.payload->>'name',''),coalesce((l.payload->>'active')::boolean,true),nullif(l.payload->>'group_id',''),nullif(l.payload->>'schedule_time',''),coalesce(l.payload->>'frequency',''),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='WhatsappAutomation' and s.scope_status='confirmed' on conflict do nothing;
