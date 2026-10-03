export function sortProjectsByCreationDate(projects) {
  return [...projects].sort((a, b) => {
    const createdAtA = Date.parse(a.created_at || a.source_created_at || a.created_date || "") || 0;
    const createdAtB = Date.parse(b.created_at || b.source_created_at || b.created_date || "") || 0;
    return createdAtB - createdAtA || String(a.id || "").localeCompare(String(b.id || ""));
  });
}
