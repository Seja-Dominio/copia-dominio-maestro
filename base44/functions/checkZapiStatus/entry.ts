import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const instanceId = secrets.get("ZAPI_INSTANCE_ID");
    const token = secrets.get("ZAPI_TOKEN");
    const clientToken = secrets.get("ZAPI_CLIENT_TOKEN");

    const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/status`;
    
    const res = await fetch(url, {
      method: "GET",
      headers: { 
        "Content-Type": "application/json",
        "Client-Token": clientToken 
      },
    });

    const data = await res.json();

    return Response.json({ 
      status: res.status,
      data 
    });
  } catch (error) {
    console.error("Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}