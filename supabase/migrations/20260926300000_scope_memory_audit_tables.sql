-- Tenant scope for Maestro memory, audit and learning review data.
alter table public.dominus_memory add column if not exists organization_id uuid;
alter table public.dominus_learning_reviews add column if not exists organization_id uuid;
alter table public.dominus_learning_review_comments add column if not exists organization_id uuid;
alter table public.dominus_learning_review_events add column if not exists organization_id uuid;
alter table public.dominus_audit_runs add column if not exists organization_id uuid;
alter table public.dominus_audit_findings add column if not exists organization_id uuid;

update public.dominus_memory m
set organization_id = o.id
from public.organizations o
where m.organization_id is null and o.status = 'active'
  and (select count(*) from public.organizations o2 where o2.status = 'active') = 1;
update public.dominus_learning_reviews r
set organization_id = o.id
from public.organizations o
where r.organization_id is null and o.status = 'active'
  and (select count(*) from public.organizations o2 where o2.status = 'active') = 1;
update public.dominus_learning_review_comments c
set organization_id = r.organization_id
from public.dominus_learning_reviews r
where c.organization_id is null and r.id = c.review_id;
update public.dominus_learning_review_events e
set organization_id = r.organization_id
from public.dominus_learning_reviews r
where e.organization_id is null and r.id = e.review_id;
update public.dominus_audit_runs r
set organization_id = o.id
from public.organizations o
where r.organization_id is null and o.status = 'active'
  and (select count(*) from public.organizations o2 where o2.status = 'active') = 1;
update public.dominus_audit_findings f
set organization_id = r.organization_id
from public.dominus_audit_runs r
where f.organization_id is null and r.id = f.run_id;

do $$
begin
  if exists (select 1 from public.dominus_memory where organization_id is null)
    or exists (select 1 from public.dominus_learning_reviews where organization_id is null)
    or exists (select 1 from public.dominus_learning_review_comments where organization_id is null)
    or exists (select 1 from public.dominus_learning_review_events where organization_id is null)
    or exists (select 1 from public.dominus_audit_runs where organization_id is null)
    or exists (select 1 from public.dominus_audit_findings where organization_id is null) then
    raise exception 'Memory or audit records without organization_id';
  end if;
end;
$$;

alter table public.dominus_memory alter column organization_id set not null;
alter table public.dominus_learning_reviews alter column organization_id set not null;
alter table public.dominus_learning_review_comments alter column organization_id set not null;
alter table public.dominus_learning_review_events alter column organization_id set not null;
alter table public.dominus_audit_runs alter column organization_id set not null;
alter table public.dominus_audit_findings alter column organization_id set not null;

alter table public.dominus_memory add constraint dominus_memory_organization_fk foreign key (organization_id) references public.organizations(id);
alter table public.dominus_learning_reviews add constraint dominus_learning_reviews_organization_fk foreign key (organization_id) references public.organizations(id);
alter table public.dominus_learning_review_comments add constraint dominus_learning_review_comments_organization_fk foreign key (organization_id) references public.organizations(id);
alter table public.dominus_learning_review_events add constraint dominus_learning_review_events_organization_fk foreign key (organization_id) references public.organizations(id);
alter table public.dominus_audit_runs add constraint dominus_audit_runs_organization_fk foreign key (organization_id) references public.organizations(id);
alter table public.dominus_audit_findings add constraint dominus_audit_findings_organization_fk foreign key (organization_id) references public.organizations(id);

create index if not exists dominus_memory_org_scope_idx on public.dominus_memory (organization_id, scope, status);
create index if not exists dominus_learning_reviews_org_status_idx on public.dominus_learning_reviews (organization_id, status, updated_at desc);
create index if not exists dominus_audit_runs_org_created_idx on public.dominus_audit_runs (organization_id, created_at desc);
create index if not exists dominus_audit_findings_org_status_idx on public.dominus_audit_findings (organization_id, status, created_at desc);
