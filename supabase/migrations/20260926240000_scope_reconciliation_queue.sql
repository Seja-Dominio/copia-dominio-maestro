-- Make the reconciliation queue tenant-aware before any manual resolution workflow.
alter table public.job_task_reconciliation
  add column if not exists organization_id uuid;

update public.job_task_reconciliation r
set organization_id = olr.organization_id
from public.organization_legacy_records olr
where r.organization_id is null
  and olr.legacy_entity = 'Subtask'
  and olr.legacy_record_id = r.legacy_record_id;

do $$
begin
  if exists (
    select 1 from public.job_task_reconciliation where organization_id is null
  ) then
    raise exception 'job_task_reconciliation contains rows without organization_id';
  end if;
end;
$$;

alter table public.job_task_reconciliation
  alter column organization_id set not null;

alter table public.job_task_reconciliation
  add constraint job_task_reconciliation_organization_fk
  foreign key (organization_id) references public.organizations(id);

create index if not exists idx_job_task_reconciliation_org_status
  on public.job_task_reconciliation (organization_id, resolution_status, source_status);
