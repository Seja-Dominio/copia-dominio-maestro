-- Parent keys used by tenant-scoped relationships.
create unique index if not exists dominus_audit_runs_org_id_uidx
  on public.dominus_audit_runs (organization_id, id);
create unique index if not exists dominus_learning_reviews_org_id_uidx
  on public.dominus_learning_reviews (organization_id, id);
create unique index if not exists team_chat_channels_org_id_uidx
  on public.team_chat_channels (organization_id, id);
create unique index if not exists team_chat_messages_org_id_uidx
  on public.team_chat_messages (organization_id, id);

-- Child indexes support tenant-scoped joins and FK maintenance.
create index if not exists dominus_audit_findings_org_run_idx
  on public.dominus_audit_findings (organization_id, run_id);
create index if not exists dominus_learning_review_comments_org_review_idx
  on public.dominus_learning_review_comments (organization_id, review_id);
create index if not exists dominus_learning_review_events_org_review_idx
  on public.dominus_learning_review_events (organization_id, review_id);
create index if not exists dominus_memory_org_source_review_idx
  on public.dominus_memory (organization_id, source_review_id)
  where source_review_id is not null;
create index if not exists team_chat_messages_org_reply_idx
  on public.team_chat_messages (organization_id, reply_to_id)
  where reply_to_id is not null;

-- Replace global-ID-only FKs with tenant-aware equivalents, preserving delete behavior.
alter table public.dominus_audit_findings
  drop constraint if exists dominus_audit_findings_run_id_fkey;
alter table public.dominus_audit_findings
  add constraint dominus_audit_findings_run_tenant_fk
  foreign key (organization_id, run_id)
  references public.dominus_audit_runs (organization_id, id)
  on delete cascade;

alter table public.dominus_learning_review_comments
  drop constraint if exists dominus_learning_review_comments_review_id_fkey;
alter table public.dominus_learning_review_comments
  add constraint dominus_learning_review_comments_review_tenant_fk
  foreign key (organization_id, review_id)
  references public.dominus_learning_reviews (organization_id, id)
  on delete cascade;

alter table public.dominus_learning_review_events
  drop constraint if exists dominus_learning_review_events_review_id_fkey;
alter table public.dominus_learning_review_events
  add constraint dominus_learning_review_events_review_tenant_fk
  foreign key (organization_id, review_id)
  references public.dominus_learning_reviews (organization_id, id)
  on delete cascade;

alter table public.dominus_memory
  drop constraint if exists dominus_memory_source_review_id_fkey;
alter table public.dominus_memory
  add constraint dominus_memory_source_review_tenant_fk
  foreign key (organization_id, source_review_id)
  references public.dominus_learning_reviews (organization_id, id)
  on delete set null (source_review_id);

alter table public.maestro_job_history
  drop constraint if exists maestro_job_history_job_id_fkey;
alter table public.maestro_job_history
  add constraint maestro_job_history_job_tenant_fk
  foreign key (organization_id, job_id)
  references public.maestro_jobs (organization_id, id);

alter table public.team_chat_messages
  drop constraint if exists team_chat_messages_channel_id_fkey;
alter table public.team_chat_messages
  add constraint team_chat_messages_channel_tenant_fk
  foreign key (organization_id, channel_id)
  references public.team_chat_channels (organization_id, id)
  on delete cascade;

alter table public.team_chat_messages
  drop constraint if exists team_chat_messages_reply_to_id_fkey;
alter table public.team_chat_messages
  add constraint team_chat_messages_reply_tenant_fk
  foreign key (organization_id, reply_to_id)
  references public.team_chat_messages (organization_id, id)
  on delete set null (reply_to_id);

alter table public.team_chat_message_reactions
  drop constraint if exists team_chat_message_reactions_message_id_fkey;
alter table public.team_chat_message_reactions
  add constraint team_chat_reactions_message_tenant_fk
  foreign key (organization_id, message_id)
  references public.team_chat_messages (organization_id, id)
  on delete cascade;

-- Channel slugs are local to an organization, not globally unique.
alter table public.team_chat_channels
  drop constraint if exists team_chat_channels_slug_key;
create unique index if not exists team_chat_channels_org_slug_uidx
  on public.team_chat_channels (organization_id, slug);

-- Backfill default channels for existing tenants without duplicating their channels.
insert into public.team_chat_channels (organization_id, slug, name, description)
select o.id, defaults.slug, defaults.name, defaults.description
from public.organizations o
cross join (values
  ('geral', 'Geral', 'Avisos e conversas de toda a equipe'),
  ('operacao', 'Operação', 'Projetos, jobs, prazos e bloqueios'),
  ('comercial', 'Comercial', 'Leads, oportunidades e alinhamentos comerciais')
) as defaults(slug, name, description)
on conflict (organization_id, slug) do nothing;

-- Ensure every newly onboarded organization receives its own default channels.
create or replace function public.create_organization_tenant(
  p_name text,
  p_slug text,
  p_owner_collaborator_id text,
  p_product_key text default 'maestro',
  p_created_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations%rowtype;
  normalized_slug text := lower(trim(p_slug));
  normalized_product text := lower(trim(p_product_key));
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'organization name is required';
  end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'organization slug is invalid';
  end if;
  if normalized_product not in ('maestro', 'cxm', 'ads_brain', 'insights') then
    raise exception 'product is invalid';
  end if;
  if not exists (
    select 1 from public.maestro_collaborators
    where id = p_owner_collaborator_id and is_active = true
  ) then
    raise exception 'owner collaborator is invalid or inactive';
  end if;

  insert into public.organizations (name, slug, status, created_by, updated_by)
  values (trim(p_name), normalized_slug, 'active', p_created_by, p_created_by)
  returning * into new_org;

  insert into public.organization_members (organization_id, collaborator_id, role, status, created_by)
  values (new_org.id, p_owner_collaborator_id, 'owner', 'active', p_created_by);

  insert into public.organization_products (organization_id, product_key, status, plan_key)
  values (new_org.id, normalized_product, 'enabled', 'internal');

  insert into public.team_chat_channels (organization_id, slug, name, description)
  values
    (new_org.id, 'geral', 'Geral', 'Avisos e conversas de toda a equipe'),
    (new_org.id, 'operacao', 'Operação', 'Projetos, jobs, prazos e bloqueios'),
    (new_org.id, 'comercial', 'Comercial', 'Leads, oportunidades e alinhamentos comerciais')
  on conflict (organization_id, slug) do nothing;

  return jsonb_build_object(
    'organization_id', new_org.id,
    'slug', new_org.slug,
    'product_key', normalized_product,
    'owner_collaborator_id', p_owner_collaborator_id
  );
end;
$$;

revoke all on function public.create_organization_tenant(text, text, text, text, text)
  from public, anon, authenticated;
