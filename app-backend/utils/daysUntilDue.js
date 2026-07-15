/**
 * Whole-day difference between now and a due date (positive = future).
 * Pure function, no Express/Mongoose dependencies.
 *
 * @param {string|number|Date} dueDate
 * @param {Date} [from=new Date()]
 * @returns {number} days until due (negative if overdue)
 */
function daysUntilDue(dueDate, from = new Date()) {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) throw new Error('Invalid due date');

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const dayStart = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

  return Math.round((dayStart(due) - dayStart(new Date(from))) / MS_PER_DAY);
}

module.exports = daysUntilDue;
