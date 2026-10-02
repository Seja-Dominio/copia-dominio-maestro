export function mergeProjectSchedulePatch(projectPayload, schedulePatch) {
  if (!schedulePatch || typeof schedulePatch !== "object" || Array.isArray(schedulePatch)) {
    throw new Error("Cronograma inválido");
  }

  const pendingPatch = projectPayload?.schedule_patch;
  const combinedPatch = pendingPatch && typeof pendingPatch === "object" && !Array.isArray(pendingPatch)
    ? { ...pendingPatch, ...schedulePatch }
    : schedulePatch;
  const currentSchedule = projectPayload?.schedule_data;
  const scheduleData = currentSchedule && typeof currentSchedule === "object" && !Array.isArray(currentSchedule)
    ? { ...currentSchedule }
    : {};

  for (const [date, posts] of Object.entries(combinedPatch)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (posts !== null && !Array.isArray(posts))) {
      throw new Error("Dia ou conteúdo do cronograma inválido");
    }
    if (posts === null) delete scheduleData[date];
    else scheduleData[date] = posts;
  }

  const { schedule_patch: _legacyPatch, ...currentPayload } = projectPayload || {};
  return { ...currentPayload, schedule_data: scheduleData };
}
