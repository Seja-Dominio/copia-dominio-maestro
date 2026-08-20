/**
 * Auto-completes subtasks that have a complete_at_status configured,
 * when the job moves to a status that equals or comes after the configured status.
 *
 * STATUS_ORDER is now dynamic — callers pass it via the `statusOrder` parameter.
 * Fallback used only when no dynamic list is available.
 */

const FALLBACK_STATUS_ORDER = [
  "pending_briefing",
  "pending_capture",
  "pending_design",
  "pending_edit",
  "internal_approval",
  "client_approval",
  "scheduled",
  "completed",
];

function getStatusIndex(status, statusOrder) {
  return statusOrder.indexOf(status);
}

/**
 * Given a new job status and a list of subtasks,
 * returns the IDs of subtasks that should be auto-completed.
 * A subtask is auto-completed if:
 * - It has a complete_at_status set
 * - The new job status index >= complete_at_status index
 * - It is not already completed
 */
export function getSubtasksToAutoComplete(newStatus, subtasks, statusOrder) {
  const order = statusOrder || FALLBACK_STATUS_ORDER;
  const newIdx = getStatusIndex(newStatus, order);
  if (newIdx < 0) return [];
  return subtasks.filter(s => {
    if (s.is_completed) return false;
    if (!s.complete_at_status) return false;
    const threshold = getStatusIndex(s.complete_at_status, order);
    return threshold >= 0 && newIdx >= threshold;
  });
}

/**
 * Bilateral sync: when job status changes, auto-complete subtasks whose
 * complete_at_status <= newStatus, and reopen subtasks whose
 * complete_at_status > newStatus (if they were auto-completed).
 * Returns updated subtask list.
 */
export async function autoCompleteSubtasks(newStatus, subtasks, base44Client, statusOrder) {
  const order = statusOrder || FALLBACK_STATUS_ORDER;
  const newIdx = getStatusIndex(newStatus, order);
  if (newIdx < 0) return subtasks;

  const now = new Date().toISOString();
  const toComplete = [];
  const toReopen = [];

  // When job is "completed", auto-complete ALL pending subtasks
  if (newStatus === "completed") {
    for (const s of subtasks) {
      if (!s.is_completed) toComplete.push(s);
    }
  } else {
    for (const s of subtasks) {
      if (!s.complete_at_status) continue;
      const threshold = getStatusIndex(s.complete_at_status, order);
      if (threshold < 0) continue;

      if (newIdx >= threshold && !s.is_completed) {
        toComplete.push(s);
      } else if (newIdx < threshold && s.is_completed) {
        toReopen.push(s);
      }
    }
  }

  if (toComplete.length === 0 && toReopen.length === 0) return subtasks;

  await Promise.all([
    ...toComplete.map(s =>
      base44Client.entities.Subtask.update(s.id, {
        is_completed: true, status: "completed", completed_at: now,
      })
    ),
    ...toReopen.map(s =>
      base44Client.entities.Subtask.update(s.id, {
        is_completed: false, status: "pending", completed_at: null,
      })
    ),
  ]);

  const completedIds = new Set(toComplete.map(s => s.id));
  const reopenedIds = new Set(toReopen.map(s => s.id));
  return subtasks.map(s => {
    if (completedIds.has(s.id)) return { ...s, is_completed: true, status: "completed", completed_at: now };
    if (reopenedIds.has(s.id)) return { ...s, is_completed: false, status: "pending", completed_at: null };
    return s;
  });
}

/**
 * Bilateral logic: given updated subtasks, determine what the job status should be.
 * 
 * complete_at_status means "this subtask is a prerequisite for this status".
 * When all subtasks of a group are done, the job can be AT that status.
 * 
 * Walk groups in order:
 * - Find the highest group where ALL subtasks are complete → job goes TO that status.
 * - If a group is incomplete, stop (can't advance past it).
 * - If no groups are complete, job goes back to the first status (pending_briefing).
 * 
 * BILATERAL: can move forward AND backward based on subtask state.
 * If ALL subtasks completed → "completed".
 */
export function deriveJobStatusFromSubtasks(currentJobStatus, subtasks, statusOrder) {
  if (!subtasks || subtasks.length === 0) return null;

  const order = statusOrder || FALLBACK_STATUS_ORDER;
  if (currentJobStatus === "cancelled") return null; // don't touch cancelled jobs

  // Check if ALL subtasks are completed → move job to "completed"
  const allCompleted = subtasks.every(s => s.is_completed);
  if (allCompleted) {
    if (currentJobStatus !== "completed") return "completed";
    return null;
  }

  // ── Group-based: subtasks with complete_at_status ──
  const withMapping = subtasks.filter(s => s.complete_at_status);
  if (withMapping.length === 0) return null;

  const byStatus = {};
  for (const s of withMapping) {
    if (!byStatus[s.complete_at_status]) byStatus[s.complete_at_status] = [];
    byStatus[s.complete_at_status].push(s);
  }

  // Walk through status order and find highest completed consecutive group
  let highestCompletedIdx = -1;
  for (let i = 0; i < order.length; i++) {
    const group = byStatus[order[i]];
    if (!group) continue;
    if (group.every(s => s.is_completed)) {
      highestCompletedIdx = i;
    } else {
      break; // stop at first incomplete group
    }
  }

  // Determine target status
  let targetStatus;
  if (highestCompletedIdx >= 0) {
    targetStatus = order[highestCompletedIdx];
  } else {
    // No groups complete — go back to first status before the first mapped group
    const firstGroupIdx = Math.min(
      ...Object.keys(byStatus).map(s => getStatusIndex(s, order)).filter(i => i >= 0)
    );
    // Job should be one step before the first group (the prerequisite isn't met)
    const targetIdx = firstGroupIdx > 0 ? firstGroupIdx - 1 : 0;
    targetStatus = order[targetIdx];
  }

  if (targetStatus !== currentJobStatus) return targetStatus;
  return null;
}