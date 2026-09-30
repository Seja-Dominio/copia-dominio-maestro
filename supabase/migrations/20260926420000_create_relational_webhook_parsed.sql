-- Mensagens parseadas do webhook, separadas dos receipts de transporte.

create table if not exists public.maestro_webhook_parsed_messages (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id text not null default '',
  group_id text,
  text_content text not null default '',
  from_me boolean not null default false,
  media_kind text,
  media_failed boolean not null default false,
  sender_jids jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_webhook_parsed_org_group_idx on public.maestro_webhook_parsed_messages (organization_id, group_id, created_at desc);
create index if not exists maestro_webhook_parsed_org_message_idx on public.maestro_webhook_parsed_messages (organization_id, message_id);
alter table public.maestro_webhook_parsed_messages enable row level security;

insert into public.maestro_webhook_parsed_messages (legacy_record_id, organization_id, message_id, group_id, text_content, from_me, media_kind, media_failed, sender_jids, payload, source_updated_at, created_at, updated_at)
select l.record_id, s.organization_id, coalesce(l.payload->>'message_id',''), nullif(l.payload->>'group_id',''), coalesce(l.payload->>'text',''), coalesce((l.payload->>'from_me')::boolean,false), nullif(l.payload->>'media_kind',''), coalesce((l.payload->>'media_failed')::boolean,false), case when jsonb_typeof(l.payload->'sender_jids')='array' then l.payload->'sender_jids' else '[]'::jsonb end, l.payload, l.source_updated_at, coalesce(l.source_created_at,now()), coalesce(l.source_updated_at,now())
from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id
where s.legacy_entity='DominusWebhookParsed' and s.scope_status='confirmed'
on conflict (legacy_record_id) do nothing;
