-- Tarefas pessoais e trilha de exclusões.

create table if not exists public.maestro_mini_tasks (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null default '',
  collaborator_legacy_record_id text,
  due_date date,
  due_time text,
  priority integer not null default 0,
  is_completed boolean not null default false,
  task_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);
create table if not exists public.maestro_delete_logs (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null default '',
  deleted_entity_legacy_record_id text,
  deleted_by_legacy_record_id text,
  reason text not null default '',
  deleted_at timestamptz,
  is_restored boolean not null default false,
  deleted_payload jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);
create index if not exists maestro_mini_tasks_org_collaborator_idx on public.maestro_mini_tasks (organization_id, collaborator_legacy_record_id, is_completed, due_date);
create index if not exists maestro_delete_logs_org_entity_idx on public.maestro_delete_logs (organization_id, entity_type, deleted_at desc);
alter table public.maestro_mini_tasks enable row level security;
alter table public.maestro_delete_logs enable row level security;

insert into public.maestro_mini_tasks (legacy_record_id,organization_id,title,collaborator_legacy_record_id,due_date,due_time,priority,is_completed,task_payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'title',''),nullif(l.payload->>'collaborator_id',''),case when l.payload->>'due_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload->>'due_date')::date else null end,nullif(l.payload->>'due_time',''),coalesce((l.payload->>'priority')::integer,0),coalesce((l.payload->>'is_completed')::boolean,false),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='MiniTask' and s.scope_status='confirmed' on conflict do nothing;
insert into public.maestro_delete_logs (legacy_record_id,organization_id,entity_type,deleted_entity_legacy_record_id,deleted_by_legacy_record_id,reason,deleted_at,is_restored,deleted_payload,payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'entity_type',''),nullif(l.payload->>'entity_id',''),nullif(l.payload->>'deleted_by',''),coalesce(l.payload->>'reason',''),case when l.payload->>'deleted_at' <> '' then (l.payload->>'deleted_at')::timestamptz else null end,coalesce((l.payload->>'is_restored')::boolean,false),coalesce(l.payload->'entity_data','{}'::jsonb),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='DeleteLog' and s.scope_status='confirmed' on conflict do nothing;
