import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, message } = await req.json();
    if (!phone || !message) return Response.json({ error: 'phone e message são obrigatórios' }, { status: 400 });

    const instanceId = secrets.get("ZAPI_INSTANCE_ID");
    const token = secrets.get("ZAPI_TOKEN");
    const clientToken = secrets.get("ZAPI_CLIENT_TOKEN");

    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone, message }),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json({ error: data?.error || "Erro ao enviar mensagem", details: data }, { status: 500 });
    }

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}