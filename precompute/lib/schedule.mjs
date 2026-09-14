const BEGIN = '# BEGIN GENERATED VENUS BOUNDARIES';
const END = '# END GENERATED VENUS BOUNDARIES';

export function ceilToUtcMinute(dateInput) {
  const ms = dateInput instanceof Date ? dateInput.getTime() : new Date(dateInput).getTime();
  if (!Number.isFinite(ms)) throw new RangeError('invalid boundary instant');
  return new Date(Math.ceil(ms / 60_000) * 60_000);
}

export function cronForBoundary(dateInput) {
  const d = ceilToUtcMinute(dateInput);
  return `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`;
}

export function rewriteGeneratedSchedule(workflowText, futureBoundaries) {
  if (!Array.isArray(futureBoundaries) || futureBoundaries.length < 2) throw new Error('two future boundaries are required');
  const lines = futureBoundaries.slice(0, 2).map((boundary) => {
    const iso = new Date(boundary.utc).toISOString();
    return `    - cron: '${cronForBoundary(iso)}' # calc ${boundary.calcJdn} begins ${iso}`;
  });
  const replacement = `${BEGIN}\n${lines.join('\n')}\n    ${END}`;
  const pattern = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`);
  if (!pattern.test(workflowText)) throw new Error('workflow generated-schedule markers are missing');
  return workflowText.replace(pattern, replacement);
}

export const SCHEDULE_BEGIN_MARKER = BEGIN;
export const SCHEDULE_END_MARKER = END;
