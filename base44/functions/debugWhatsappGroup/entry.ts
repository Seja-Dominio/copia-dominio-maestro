import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { groupId } = await req.json();
    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const token = Deno.env.get("ZAPI_TOKEN");
    const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

    // Normalizar o groupId - garantir formato @g.us
    const normalizedId = groupId.includes("@g.us") ? groupId : `${groupId}@g.us`;
    const rawId = normalizedId.replace("@g.us", "");

    console.log("=== DEBUG GROUP ===");
    console.log("Original groupId:", groupId);
    console.log("Normalized:", normalizedId);
    console.log("Raw:", rawId);

    // 1) Tentar buscar metadados do grupo
    const metaUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/group-metadata/${normalizedId}`;
    console.log("Fetching metadata:", metaUrl);
    const metaRes = await fetch(metaUrl, {
      headers: { "Client-Token": clientToken }
    });
    const metaData = await metaRes.json();
    console.log("Metadata response:", JSON.stringify(metaData));

    // 2) Tentar enviar com formato @g.us
    const sendUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
    
    console.log("Sending with @g.us format:", normalizedId);
    const send1 = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone: normalizedId, message: "🔍 Teste 1 - com @g.us" }),
    });
    const send1Data = await send1.json();
    console.log("Send with @g.us:", JSON.stringify(send1Data));

    // 3) Tentar enviar só com número raw
    console.log("Sending with raw format:", rawId);
    const send2 = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Client-Token": clientToken },
      body: JSON.stringify({ phone: rawId, message: "🔍 Teste 2 - sem @g.us" }),
    });
    const send2Data = await send2.json();
    console.log("Send without @g.us:", JSON.stringify(send2Data));

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
});