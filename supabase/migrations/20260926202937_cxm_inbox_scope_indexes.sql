-- CXM records live in the shared legacy_records store. Partial indexes keep
-- their inbox queries and webhook instance lookups bounded without indexing
-- payloads belonging to unrelated Maestro features.
create index if not exists legacy_records_attendance_message_scope_created_idx
  on public.legacy_records ((payload ->> 'scope_type'), source_created_at desc nulls last, record_id)
  where entity = 'AttendanceMessage';

create index if not exists legacy_records_attendance_message_client_created_idx
  on public.legacy_records ((payload ->> 'client_id'), source_created_at desc nulls last, record_id)
  where entity = 'AttendanceMessage';

create index if not exists legacy_records_attendance_evaluation_scope_created_idx
  on public.legacy_records ((payload ->> 'scope_type'), source_created_at desc nulls last, record_id)
  where entity = 'AttendanceEvaluation';

create index if not exists legacy_records_attendance_evaluation_client_created_idx
  on public.legacy_records ((payload ->> 'client_id'), source_created_at desc nulls last, record_id)
  where entity = 'AttendanceEvaluation';

create index if not exists legacy_records_whatsapp_number_client_instance_idx
  on public.legacy_records ((payload ->> 'client_id'), (payload ->> 'instance'))
  where entity = 'ClientWhatsappNumber';

create index if not exists legacy_records_whatsapp_number_instance_idx
  on public.legacy_records ((payload ->> 'instance'))
  where entity = 'ClientWhatsappNumber';
