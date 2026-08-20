import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

/**
 * Checks for jobs with overdue post_date and deducts 1 NPS point per late job
 * per client (only once per job, tracked by NpsHistory).
 */
export async function checkAndApplyLatePostPenalties() {
  const today = format(new Date(), "yyyy-MM-dd");

  const [jobs, clients, history] = await Promise.all([
    base44.entities.Job.list("-post_date", 500),
    base44.entities.Client.filter({ status: "active" }, "name", 200),
    base44.entities.NpsHistory.filter({ event_type: "late_post" }, "-created_date", 1000),
  ]);

  // Jobs that are late (post_date < today, not completed/scheduled)
  const lateJobs = jobs.filter(j =>
    j.post_date &&
    j.post_date < today &&
    j.status !== "completed" &&
    j.status !== "scheduled" &&
    j.client_id
  );

  // Already penalized job IDs
  const penalizedJobIds = new Set(history.map(h => h.job_id).filter(Boolean));

  for (const job of lateJobs) {
    if (penalizedJobIds.has(job.id)) continue;

    const client = clients.find(c => c.id === job.client_id);
    if (!client) continue;

    const scoreBefore = client.nps_score ?? 100;
    const scoreAfter = Math.max(0, scoreBefore - 1);

    await Promise.all([
      base44.entities.NpsHistory.create({
        client_id: client.id,
        client_name: client.name,
        event_type: "late_post",
        delta: -1,
        score_before: scoreBefore,
        score_after: scoreAfter,
        description: `Postagem atrasada: "${job.title}"`,
        job_id: job.id,
        job_title: job.title,
      }),
      base44.entities.Client.update(client.id, { nps_score: scoreAfter }),
    ]);
  }
}