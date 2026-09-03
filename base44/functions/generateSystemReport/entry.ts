import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [clients, projects, jobs, collaborators, subtasks, feeContracts] = await Promise.all([
      base44.asServiceRole.entities.Client.filter({}, 'name', 500),
      base44.asServiceRole.entities.Project.filter({}, '-created_date', 500),
      base44.asServiceRole.entities.Job.filter({}, '-post_date', 2000),
      base44.asServiceRole.entities.Collaborator.filter({}, 'name', 200),
      base44.asServiceRole.entities.Subtask.filter({}, '-deadline', 5000),
      base44.asServiceRole.entities.FeeContract.filter({}, '-created_date', 200),
    ]);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });
    const statusLabels = {
      pending_briefing: 'Aguard. Briefing',
      pending_capture: 'Aguard. Captação',
      pending_design: 'Aguard. Design',
      pending_edit: 'Aguard. Edição',
      internal_approval: 'Aprov. Interna',
      client_approval: 'Aprov. Cliente',
      scheduled: 'Agendado',
      completed: 'Concluído',
      cancelled: 'Cancelado',
    };
    const contentLabels = {
      feed_card: 'Card', reels: 'Reels', story: 'Stories', video: 'Vídeo',
      trafego_pago: 'Tráfego Pago', card_trafego: 'Card Tráfego',
      video_trafego: 'Vídeo Tráfego', foto: 'Foto', promocao: 'Promoção',
      email: 'Email', blog: 'Blog', outros: 'Outros',
    };

    // Index helpers
    const jobsByProject = {};
    const jobsByClient = {};
    jobs.forEach(j => {
      if (j.project_id) {
        if (!jobsByProject[j.project_id]) jobsByProject[j.project_id] = [];
        jobsByProject[j.project_id].push(j);
      }
      if (j.client_id) {
        if (!jobsByClient[j.client_id]) jobsByClient[j.client_id] = [];
        jobsByClient[j.client_id].push(j);
      }
    });
    const subtasksByJob = {};
    subtasks.forEach(s => {
      if (!subtasksByJob[s.job_id]) subtasksByJob[s.job_id] = [];
      subtasksByJob[s.job_id].push(s);
    });
    const contractsByClient = {};
    feeContracts.forEach(fc => {
      if (fc.client_id) {
        if (!contractsByClient[fc.client_id]) contractsByClient[fc.client_id] = [];
        contractsByClient[fc.client_id].push(fc);
      }
    });

    let md = `# 📊 Relatório Geral do Sistema\n`;
    md += `> Gerado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}\n\n`;

    // ── RESUMO GERAL ──
    const activeClients = clients.filter(c => c.status === 'active');
    const activeProjects = projects.filter(p => p.status === 'in_progress' || p.status === 'no_status');
    const activeJobs = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
    const overdueJobs = activeJobs.filter(j => j.post_date && j.post_date < today);
    const activeCollabs = collaborators.filter(c => c.is_active);

    md += `## 🔢 Resumo Geral\n\n`;
    md += `| Indicador | Qtd |\n|---|---|\n`;
    md += `| Clientes ativos | ${activeClients.length} |\n`;
    md += `| Projetos em andamento | ${activeProjects.length} |\n`;
    md += `| Jobs ativos (não concluídos/cancelados) | ${activeJobs.length} |\n`;
    md += `| Jobs atrasados (post_date < hoje) | ${overdueJobs.length} |\n`;
    md += `| Colaboradores ativos | ${activeCollabs.length} |\n`;
    md += `| Contratos de fee ativos | ${feeContracts.filter(f => f.status === 'active').length} |\n\n`;

    // ── COLABORADORES ──
    md += `## 👥 Colaboradores\n\n`;
    md += `| Nome | Cargo | Depto | Email | Acesso |\n|---|---|---|---|---|\n`;
    activeCollabs.forEach(c => {
      md += `| ${c.name} | ${c.role || '—'} | ${c.department || '—'} | ${c.email} | ${c.access_level || 'collaborator'} |\n`;
    });
    md += `\n`;

    // ── CLIENTES ──
    md += `## 🏢 Clientes Ativos\n\n`;
    activeClients.forEach(client => {
      const cJobs = jobsByClient[client.id] || [];
      const cActiveJobs = cJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
      const cOverdue = cActiveJobs.filter(j => j.post_date && j.post_date < today);
      const contracts = contractsByClient[client.id] || [];
      const activeContract = contracts.find(fc => fc.status === 'active');

      md += `### ${client.name}${client.tier ? ` (${client.tier.toUpperCase()})` : ''}\n\n`;

      if (client.responsible) md += `- **Responsável comercial:** ${client.responsible}\n`;
      if (client.email) md += `- **Email:** ${client.email}\n`;
      if (client.phone) md += `- **Telefone:** ${client.phone}\n`;
      if (client.services?.length) md += `- **Serviços:** ${client.services.join(', ')}\n`;
      if (activeContract) md += `- **Fee mensal:** R$ ${activeContract.monthly_value?.toLocaleString('pt-BR')}\n`;

      // Entregas contratadas
      const deliveries = [];
      if (client.contracted_cards) deliveries.push(`${client.contracted_cards} Cards`);
      if (client.contracted_reels) deliveries.push(`${client.contracted_reels} Reels`);
      if (client.contracted_stories) deliveries.push(`${client.contracted_stories} Stories`);
      if (client.contracted_vt) deliveries.push(`${client.contracted_vt} VT`);
      if (client.contracted_foto) deliveries.push(`${client.contracted_foto} Fotos`);
      if (client.contracted_promocoes) deliveries.push(`${client.contracted_promocoes} Promoções`);
      if (deliveries.length) md += `- **Entregas contratadas:** ${deliveries.join(' · ')}\n`;
      if (client.nps_score !== undefined) md += `- **NPS:** ${client.nps_score}\n`;

      md += `- **Jobs ativos:** ${cActiveJobs.length} | **Atrasados:** ${cOverdue.length}\n\n`;

      // Projetos do cliente
      const cProjects = projects.filter(p => p.client_id === client.id && (p.status === 'in_progress' || p.status === 'no_status'));
      if (cProjects.length > 0) {
        cProjects.forEach(proj => {
          const pJobs = jobsByProject[proj.id] || [];
          const pActive = pJobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled');
          const pCompleted = pJobs.filter(j => j.status === 'completed');

          md += `#### 📁 ${proj.name}\n`;
          if (proj.responsible_name) md += `- Responsável: ${proj.responsible_name}\n`;
          if (proj.teams?.length) md += `- Equipes: ${proj.teams.join(', ')}\n`;
          md += `- Jobs: ${pActive.length} ativos, ${pCompleted.length} concluídos de ${pJobs.length} total\n`;

          if (pActive.length > 0) {
            md += `\n| Job | Tipo | Status | Post Date | Responsável | Subtarefas |\n|---|---|---|---|---|---|\n`;
            pActive.sort((a, b) => (a.post_date || '9999').localeCompare(b.post_date || '9999'));
            pActive.forEach(j => {
              const subs = subtasksByJob[j.id] || [];
              const subsDone = subs.filter(s => s.is_completed).length;
              const subsOverdue = subs.filter(s => !s.is_completed && s.deadline && s.deadline < today).length;
              const subsInfo = subs.length > 0 ? `${subsDone}/${subs.length}${subsOverdue > 0 ? ` (⚠️${subsOverdue} atrasadas)` : ''}` : '—';
              const isOverdue = j.post_date && j.post_date < today ? ' ⚠️' : '';
              md += `| ${j.title || j.number || '—'} | ${contentLabels[j.content_type] || j.content_type || '—'} | ${statusLabels[j.status] || j.status} | ${j.post_date || '—'}${isOverdue} | ${j.responsible_name || '—'} | ${subsInfo} |\n`;
            });
            md += `\n`;
          }

          // Cronograma do mês atual
          if (proj.schedule_data && Object.keys(proj.schedule_data).length > 0) {
            const currentMonth = today.substring(0, 7);
            const monthPosts = Object.entries(proj.schedule_data)
              .filter(([d]) => d.startsWith(currentMonth))
              .sort(([a], [b]) => a.localeCompare(b));
            if (monthPosts.length > 0) {
              md += `**Cronograma do mês (drafts):**\n`;
              monthPosts.forEach(([day, posts]) => {
                const active = posts.filter(p => !p.cancelled);
                if (active.length > 0) {
                  md += `- ${day}: ${active.map(p => `${(p.formats || []).join('/')} — ${p.text || 'Sem título'}`).join('; ')}\n`;
                }
              });
              md += `\n`;
            }
          }
        });
      }
      md += `---\n\n`;
    });

    // ── JOBS ATRASADOS (consolidado) ──
    if (overdueJobs.length > 0) {
      md += `## ⚠️ Jobs Atrasados (post_date anterior a hoje)\n\n`;
      md += `| Cliente | Projeto | Job | Tipo | Status | Post Date | Responsável |\n|---|---|---|---|---|---|---|\n`;
      overdueJobs.sort((a, b) => (a.post_date || '').localeCompare(b.post_date || ''));
      overdueJobs.forEach(j => {
        md += `| ${j.client_name || '—'} | ${j.project_name || '—'} | ${j.title || '—'} | ${contentLabels[j.content_type] || '—'} | ${statusLabels[j.status] || j.status} | ${j.post_date} | ${j.responsible_name || '—'} |\n`;
      });
      md += `\n`;
    }

    // ── SUBTAREFAS ATRASADAS ──
    const overdueSubs = subtasks.filter(s => !s.is_completed && s.deadline && s.deadline < today);
    if (overdueSubs.length > 0) {
      md += `## ⏰ Subtarefas Atrasadas\n\n`;
      md += `| Subtarefa | Deadline | Responsável | Job |\n|---|---|---|---|\n`;
      overdueSubs.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
      overdueSubs.slice(0, 100).forEach(s => {
        const j = jobs.find(job => job.id === s.job_id);
        md += `| ${s.title} | ${s.deadline} | ${s.responsible_name || '—'} | ${j?.title || s.job_id} |\n`;
      });
      if (overdueSubs.length > 100) md += `\n_...e mais ${overdueSubs.length - 100} subtarefas atrasadas._\n`;
      md += `\n`;
    }

    // ── CARGA POR COLABORADOR ──
    md += `## 📋 Carga por Colaborador (Jobs ativos)\n\n`;
    md += `| Colaborador | Jobs ativos | Subtarefas pendentes |\n|---|---|---|\n`;
    activeCollabs.forEach(c => {
      const myJobs = activeJobs.filter(j => j.responsible_id === c.id);
      const mySubs = subtasks.filter(s => !s.is_completed && s.responsible_id === c.id);
      if (myJobs.length > 0 || mySubs.length > 0) {
        md += `| ${c.name} | ${myJobs.length} | ${mySubs.length} |\n`;
      }
    });
    md += `\n---\n_Fim do relatório._\n`;

    return Response.json({ markdown: md, filename: `relatorio-sistema-${today}.md` });
  } catch (error) {
    console.error('[ERROR]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}