/**
 * Pure water-consumption calculation for a meter reading.
 * No Express/Mongoose dependencies.
 *
 * @param {number} previousReading
 * @param {number} currentReading
 * @returns {number} consumption for the period
 */
function calculateConsumption(previousReading, currentReading) {
  const prev = Number(previousReading);
  const curr = Number(currentReading);

  if (Number.isNaN(prev) || Number.isNaN(curr)) {
    throw new Error('Readings must be numbers');
  }
  if (curr < prev) {
    throw new Error('Current reading cannot be less than previous reading');
  }
  return curr - prev;
}

module.exports = calculateConsumption;
