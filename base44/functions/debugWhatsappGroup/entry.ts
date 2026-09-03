import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await req.json();
    const instanceId = secrets.get("ZAPI_INSTANCE_ID");
    const token = secrets.get("ZAPI_TOKEN");
    const clientToken = secrets.get("ZAPI_CLIENT_TOKEN");

    // Normalizar o groupId - garantir formato @g.us
    const normalizedId = groupId.includes("@g.us") ? groupId : `${groupId}@g.us`;
    const rawId = normalizedId.replace("@g.us", "");

    // 1) Tentar buscar metadados do grupo
    const metaUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/group-metadata/${normalizedId}`;
    const metaRes = await fetch(metaUrl, {
      headers: { "Client-Token": clientToken }
    });
    const metaData = await metaRes.json();

    // 2) Tentar enviar com formato @g.us
    const sendUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    
    const send1 = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone: normalizedId, message: "🔍 Teste 1 - com @g.us" }),
    });
    const send1Data = await send1.json();

    // 3) Tentar enviar só com número raw
    const send2 = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone: rawId, message: "🔍 Teste 2 - sem @g.us" }),
    });
    const send2Data = await send2.json();

    return Response.json({
      groupId_original: groupId,
      groupId_normalized: normalizedId,
      groupId_raw: rawId,
      metadata: metaData,
      send_with_gus: { status: send1.status, data: send1Data },
      send_without_gus: { status: send2.status, data: send2Data },
    });
  } catch (error) {
    console.error("Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}