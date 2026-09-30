-- Allow several independently cancellable checkpoints for one unanswered inbound.
alter table public.cxm_silence_due_jobs
  add column if not exists step_index integer not null default 0;

alter table public.cxm_silence_due_jobs
  add constraint cxm_silence_due_jobs_step_index_check
    check (step_index between 0 and 7);

alter table public.cxm_silence_due_jobs
  drop constraint if exists cxm_silence_due_jobs_event_unique;

alter table public.cxm_silence_due_jobs
  add constraint cxm_silence_due_jobs_event_unique
    unique (organization_id, client_id, channel, account_id, conversation_id, rule_id, trigger_message_id, step_index);
