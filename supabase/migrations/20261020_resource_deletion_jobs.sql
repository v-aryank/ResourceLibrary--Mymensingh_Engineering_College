-- Durable retry state for the non-atomic Supabase + Backblaze deletion flow.
-- The row intentionally has no FK to resources so it survives resource removal.
create table if not exists public.resource_deletion_jobs (
  resource_id uuid primary key,
  requested_by uuid not null,
  pdf_path text,
  thumbnail_path text,
  stage text not null default 'requested'
    check (stage in ('requested', 'references_cleared', 'storage_deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resource_deletion_jobs enable row level security;
revoke all on public.resource_deletion_jobs from anon;
grant select, insert, update, delete on public.resource_deletion_jobs to authenticated;

drop policy if exists "Admins manage resource deletion jobs" on public.resource_deletion_jobs;
create policy "Admins manage resource deletion jobs"
  on public.resource_deletion_jobs
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    requested_by = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
