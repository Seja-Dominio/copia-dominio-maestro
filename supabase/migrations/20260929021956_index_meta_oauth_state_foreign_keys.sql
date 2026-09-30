create index if not exists maestro_meta_oauth_states_organization_idx
  on public.maestro_meta_oauth_states (organization_id);

create index if not exists maestro_meta_oauth_states_collaborator_idx
  on public.maestro_meta_oauth_states (collaborator_id);
