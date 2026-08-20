import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
    const token = Deno.env.get("ZAPI_TOKEN");
    const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

    console.log("Checking Z-API status...");
    console.log("Instance ID:", instanceId);
    console.log("Token length:", token?.length);
    console.log("Client Token length:", clientToken?.length);

    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/status`;
    
    const res = await fetch(url, {
      method: "GET",
      headers: { 
        "Content-Type": "application/json",
        "Client-Token": clientToken 
      },
    });

    const data = await res.json();
    console.log("Z-API Status Response:", JSON.stringify(data));

    return Response.json({ 
      status: res.status,
      data 
    });
  } catch (error) {
    console.error("Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});