const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Consumer accounts live in their own collection, separate from staff
 * (`User`: Collector/Admin). `role` is kept as a fixed field — rather than
 * inferring it purely from "which model answered" — so the role-generic
 * helpers in authController.js (`issueSession`, `signAccessToken`,
 * `REFRESH_TTL_MS[user.role]`) work unchanged against either model.
 */
const consumerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['Consumer'], default: 'Consumer', immutable: true },
    /**
     * Auth-level account state. `disabled` blocks token issuance outright.
     *
     * Delinquency is deliberately NOT modelled here: an unpaid bill is a billing
     * restriction, not an authentication failure — a delinquent consumer must
     * still be able to log in to see what they owe and pay it.
     */
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
    accountNumbers: [{ type: String }], // linked account numbers, cap enforced in accountController
    // Consumer-specific fields
    address: { type: String, required: true },
    type: { type: String, enum: ['residential', 'commercial', 'government'], required: true },
    outstanding: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: ['Active', 'Delinquent', 'Past Due'], default: 'Active' },
  },
  { timestamps: true }
);

consumerSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

consumerSchema.statics.createWithPassword = async function createWithPassword({
  password,
  ...rest
}) {
  const passwordHash = await bcrypt.hash(password, 10);
  return this.create({ ...rest, passwordHash });
};

consumerSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() });
};

// Never serialise the password hash back to a client.
consumerSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('Consumer', consumerSchema);
