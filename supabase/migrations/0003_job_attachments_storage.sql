-- Anexos novos passam a ser armazenados no Supabase Storage privado.
insert into storage.buckets (id, name, public)
values ('job-attachments', 'job-attachments', false)
on conflict (id) do update set public = excluded.public;
