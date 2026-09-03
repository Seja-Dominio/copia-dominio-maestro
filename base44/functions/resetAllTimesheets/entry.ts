import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const db = base44.asServiceRole.entities;
    const running = await db.Timesheet.filter({ is_running: true });
    const now = new Date().toISOString();

    let stopped = 0;
    for (const ts of running) {
      const dur = Math.max(1, Math.floor((Date.now() - new Date(ts.started_at).getTime()) / 60000));
      await db.Timesheet.update(ts.id, {
        is_running: false,
        ended_at: now,
        duration_minutes: dur,
      });
      stopped++;
    }

    return Response.json({ success: true, stopped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}