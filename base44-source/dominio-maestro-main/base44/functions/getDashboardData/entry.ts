import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    // Autenticação via collaborator_id (sessão do colaborador)
    let collaboratorId = null;
    try {
      const body = await req.json();
      collaboratorId = body?.collaborator_id;
    } catch {}

    // Fallback: tentar auth de plataforma
    if (!collaboratorId) {
      try {
        const user = await base44.auth.me();
        if (user?.email) {
          const collabs = await db.Collaborator.filter({ email: user.email });
          if (collabs.length && collabs[0].is_active !== false) {
            collaboratorId = collabs[0].id;
          }
        }
      } catch {}
    }

    // Verificar se o collaborator_id é válido e ativo
    if (collaboratorId) {
      try {
        const collab = await db.Collaborator.get(collaboratorId);
        if (!collab || collab.is_active === false) {
          return Response.json({ error: 'Forbidden' }, { status: 403 });
        }
      } catch {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all data
    const [projects, allJobs, entries, collaborators, timesheets, clients, agendaEvents, allSubtasks] = await Promise.all([
      db.Project.list("-created_date", 50),
      db.Job.list("-post_date", 5000),
      db.FinancialEntry.list("-created_date", 150),
      db.Collaborator.list("name", 50).then(all => all.filter(c => c.is_active !== false)),
      db.Timesheet.list("-created_date", 1000),
      db.Client.list("-nps_score", 50).then(all => all.filter(c => c.status === "active")),
      db.AgendaEvent.list("-date", 100).then(all => all.filter(e => e.status !== "cancelado")),
      db.Subtask.list("-created_date", 5000),
    ]);

    const inactiveProjectIds = new Set(
      projects.filter(p => p.status === "completed" || p.status === "archived").map(p => p.id)
    );

    const jobs = allJobs.filter(j =>
      j.status !== "cancelled" && !inactiveProjectIds.has(j.project_id)
    );

    const activeJobIds = new Set(jobs.map(j => j.id));
    const subtasks = allSubtasks.filter(s => activeJobIds.has(s.job_id));

    return Response.json({ projects, jobs, entries, collaborators, timesheets, clients, agendaEvents, subtasks });
  } catch (error) {
    console.error("getDashboardData error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}