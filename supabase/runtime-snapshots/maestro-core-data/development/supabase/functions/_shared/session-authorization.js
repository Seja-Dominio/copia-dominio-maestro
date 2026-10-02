export async function loadCurrentCollaboratorSession(client, session) {
  if (!session?.sub) return null;

  const { data: collaborator, error: collaboratorError } = await client
    .from("maestro_collaborators")
    .select("id,is_active,profile")
    .eq("id", session.sub)
    .maybeSingle();
  if (collaboratorError || !collaborator?.is_active) return null;

  let membershipsQuery = client
    .from("organization_members")
    .select("organization_id,organizations!inner(status)")
    .eq("collaborator_id", collaborator.id)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .limit(2);
  if (session.organization_id) {
    membershipsQuery = membershipsQuery.eq("organization_id", session.organization_id);
  }
  const { data: memberships, error: membershipError } = await membershipsQuery;
  if (membershipError || memberships?.length !== 1) return null;

  const rawAccessLevel = String(collaborator.profile?.access_level || "collaborator").toLowerCase();
  return {
    ...session,
    access_level: rawAccessLevel === "admin" ? "master" : rawAccessLevel,
    organization_id: String(memberships[0].organization_id),
  };
}
