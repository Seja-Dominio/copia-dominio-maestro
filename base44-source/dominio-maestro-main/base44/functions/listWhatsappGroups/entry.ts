import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    // Autenticação via collaborator_id
    let collaboratorId = null;
    try {
      const body = await req.clone().json();
      collaboratorId = body?.collaborator_id;
    } catch {}

    if (!collaboratorId) {
      try {
        const user = await base44.auth.me();
        if (user?.email) {
          const collabs = await db.Collaborator.filter({ email: user.email });
          if (collabs.length && collabs[0].is_active !== false) collaboratorId = collabs[0].id;
        }
      } catch {}
    }

    if (!collaboratorId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      const collab = await db.Collaborator.get(collaboratorId);
      if (!collab || collab.is_active === false) return Response.json({ error: 'Forbidden' }, { status: 403 });
    } catch {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const instanceId = secrets.get("ZAPI_INSTANCE_ID");
    const token = secrets.get("ZAPI_TOKEN");
    const clientToken = secrets.get("ZAPI_CLIENT_TOKEN");

    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/chats?page=1&pageSize=200`;
    const res = await fetch(url, { headers: { "Content-Type": "application/json", "Client-Token": clientToken } });
    const data = await res.json();

    if (!res.ok) return Response.json({ error: "Erro ao buscar grupos", details: data }, { status: 500 });

    // Filter only groups
    const chats = Array.isArray(data) ? data : (data.chats || data.value || []);
    const groups = chats.filter(c => c.isGroup || c.phone?.endsWith("@g.us") || c.id?.endsWith("@g.us"));

    return Response.json({
      groups: groups.map(g => {
        let rawId = g.phone || g.id || g.jid || "";
        if (rawId && !rawId.includes("@")) {
          rawId = rawId.replace("-group", "") + "@g.us";
        }
        return {
          id: rawId,
          name: g.name || g.subject || g.title || g.phone || g.id || "Grupo"
        };
      })
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}