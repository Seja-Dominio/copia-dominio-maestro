-- Keep the compatibility table, but let the hot list/filter paths use the
-- same JSON keys that the Edge Function orders and filters by.
create index if not exists legacy_records_job_post_date_idx
  on public.legacy_records ((payload ->> 'post_date') desc nulls last)
  where entity = 'Job';

create index if not exists legacy_records_job_created_date_idx
  on public.legacy_records ((payload ->> 'created_date') desc nulls last)
  where entity = 'Job';

create index if not exists legacy_records_subtask_created_date_idx
  on public.legacy_records ((payload ->> 'created_date') desc nulls last)
  where entity = 'Subtask';

create index if not exists legacy_records_project_created_date_idx
  on public.legacy_records ((payload ->> 'created_date') desc nulls last)
  where entity = 'Project';

create index if not exists legacy_records_timesheet_created_date_idx
  on public.legacy_records ((payload ->> 'created_date') desc nulls last)
  where entity = 'Timesheet';

create index if not exists legacy_records_collaborator_name_idx
  on public.legacy_records ((payload ->> 'name') asc nulls last)
  where entity = 'Collaborator';

create index if not exists legacy_records_client_status_name_idx
  on public.legacy_records ((payload ->> 'status'), (payload ->> 'name') asc nulls last)
  where entity = 'Client';

create index if not exists legacy_records_notification_user_created_idx
  on public.legacy_records ((payload ->> 'user_id'), (payload ->> 'created_date') desc nulls last)
  where entity = 'Notification';
