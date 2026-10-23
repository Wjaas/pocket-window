export const ENERGY = { low: 1, medium: 2, high: 3 };

export function daysUntil(dateString, now = new Date()) {
  if (!dateString) return null;
  const due = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function recommend(tasks, minutes, energy, now = new Date()) {
  const candidates = tasks.filter(task => !task.done && task.duration <= minutes && ENERGY[task.energy] <= ENERGY[energy]);
  if (!candidates.length) return null;
  return candidates.map(task => {
    const days = daysUntil(task.due, now);
    const urgency = days === null ? 0 : days < 0 ? 70 : days === 0 ? 60 : days <= 2 ? 45 : days <= 7 ? 25 : 5;
    const fit = 30 - (minutes - task.duration) / 4;
    return { task, score: urgency + fit, days };
  }).sort((a, b) => b.score - a.score || a.task.createdAt - b.task.createdAt)[0];
}

export function dueLabel(dateString, now = new Date()) {
  const days = daysUntil(dateString, now);
  if (days === null) return 'No due date';
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}
