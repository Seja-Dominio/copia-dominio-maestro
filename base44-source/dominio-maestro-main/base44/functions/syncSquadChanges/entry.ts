import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { event, data, old_data } = body;
    
    if (!data || !event) {
      return Response.json({ error: 'Missing data or event' }, { status: 400 });
    }

    const newName = data.name;
    const oldName = old_data?.name;
    const nameChanged = oldName && oldName !== newName;

    const results = { projects: 0, jobTemplates: 0 };

    // 1. Update Projects that reference the old squad name in their teams array
    if (nameChanged) {
      const projects = await base44.asServiceRole.entities.Project.filter({}, '-created_date', 5000);
      for (const project of projects) {
        const teams = project.teams || [];
        const legacyTeam = project.team || '';
        let needsUpdate = false;
        const updates = {};

        if (teams.includes(oldName)) {
          updates.teams = teams.map(t => t === oldName ? newName : t);
          needsUpdate = true;
        }

        if (legacyTeam === oldName) {
          updates.team = newName;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await base44.asServiceRole.entities.Project.update(project.id, updates);
          results.projects++;
        }
      }

      // 2. Update JobTemplates that reference the old squad name
      const templates = await base44.asServiceRole.entities.JobTemplate.filter({}, '-created_date', 5000);
      for (const tpl of templates) {
        const teams = tpl.teams || [];
        const legacyTeam = tpl.team || '';
        let needsUpdate = false;
        const updates = {};

        if (teams.includes(oldName)) {
          updates.teams = teams.map(t => t === oldName ? newName : t);
          needsUpdate = true;
        }

        if (legacyTeam === oldName) {
          updates.team = newName;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await base44.asServiceRole.entities.JobTemplate.update(tpl.id, updates);
          results.jobTemplates++;
        }
      }
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error('Squad sync error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}