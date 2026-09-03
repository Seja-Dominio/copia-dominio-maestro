import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar colaborador logado
    const collaborators = await base44.asServiceRole.entities.Collaborator.filter({ id: user.id });
    const collaborator = collaborators[0];
    
    if (!collaborator || collaborator.access_level !== 'admin') {
      return Response.json({ error: 'Forbidden: Only admins can clear timesheets' }, { status: 403 });
    }

    // Buscar todos os timesheets
    const timesheets = await base44.asServiceRole.entities.Timesheet.list(null, 10000);
    
    let deletedCount = 0;
    const now = new Date().toISOString();

    // Deletar cada timesheet e criar log
    for (const timesheet of timesheets) {
      try {
        await base44.asServiceRole.entities.DeleteLog.create({
          entity_type: 'timesheet',
          entity_id: timesheet.id,
          entity_data: timesheet,
          deleted_by: user.id,
          deleted_by_name: user.full_name,
          deleted_at: now,
          reason: 'Limpeza em massa do sistema'
        });

        await base44.asServiceRole.entities.Timesheet.delete(timesheet.id);
        deletedCount++;
      } catch (err) {
        console.error(`Error deleting timesheet ${timesheet.id}:`, err.message);
      }
    }

    return Response.json({
      success: true,
      message: `${deletedCount} timesheets deletados e registrados`,
      deletedCount
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}