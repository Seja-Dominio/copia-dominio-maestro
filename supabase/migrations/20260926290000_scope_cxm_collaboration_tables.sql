-- Tenant scope for collaboration and CXM analytics tables.
-- A schema-only preview has no production rows to seed its agency tenant from.
-- Create the baseline tenant before assigning the seeded team-chat channels.
do $$
begin
  if not exists (select 1 from public.organizations where status = 'active') then
    insert into public.organizations (name, slug, status)
    values ('Domínio Performance', 'dominio-performance', 'active')
    on conflict (lower(slug)) do nothing;
  end if;
end;
$$;

alter table public.team_chat_channels add column if not exists organization_id uuid;
alter table public.team_chat_messages add column if not exists organization_id uuid;
alter table public.team_chat_message_reactions add column if not exists organization_id uuid;
alter table public.marketing_mix_observations add column if not exists organization_id uuid;

update public.team_chat_channels c
set organization_id = o.id
from public.organizations o
where c.organization_id is null and o.status = 'active'
  and (select count(*) from public.organizations o2 where o2.status = 'active') = 1;

update public.team_chat_messages m
set organization_id = c.organization_id
from public.team_chat_channels c
where m.organization_id is null and c.id = m.channel_id;

update public.team_chat_message_reactions r
set organization_id = m.organization_id
from public.team_chat_messages m
where r.organization_id is null and m.id = r.message_id;

update public.marketing_mix_observations o
set organization_id = olr.organization_id
from public.organization_legacy_records olr
where o.organization_id is null and olr.legacy_entity = 'Client' and olr.legacy_record_id = o.client_id;

do $$
begin
  if exists (select 1 from public.team_chat_channels where organization_id is null)
    or exists (select 1 from public.team_chat_messages where organization_id is null)
    or exists (select 1 from public.team_chat_message_reactions where organization_id is null)
    or exists (select 1 from public.marketing_mix_observations where organization_id is null) then
    raise exception 'CXM/collaboration records without organization_id';
  end if;
end;
$$;

alter table public.team_chat_channels alter column organization_id set not null;
alter table public.team_chat_messages alter column organization_id set not null;
alter table public.team_chat_message_reactions alter column organization_id set not null;
alter table public.marketing_mix_observations alter column organization_id set not null;

alter table public.team_chat_channels add constraint team_chat_channels_organization_fk foreign key (organization_id) references public.organizations(id);
alter table public.team_chat_messages add constraint team_chat_messages_organization_fk foreign key (organization_id) references public.organizations(id);
alter table public.team_chat_message_reactions add constraint team_chat_reactions_organization_fk foreign key (organization_id) references public.organizations(id);
alter table public.marketing_mix_observations add constraint marketing_mix_observations_organization_fk foreign key (organization_id) references public.organizations(id);

create index if not exists team_chat_channels_org_archived_idx on public.team_chat_channels (organization_id, is_archived, updated_at desc);
create index if not exists team_chat_messages_org_channel_idx on public.team_chat_messages (organization_id, channel_id, created_at desc);
create index if not exists team_chat_reactions_org_message_idx on public.team_chat_message_reactions (organization_id, message_id);
create index if not exists marketing_mix_observations_org_client_time_idx on public.marketing_mix_observations (organization_id, client_id, time desc);
