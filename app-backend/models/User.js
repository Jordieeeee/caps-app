const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['Admin'], required: true },
    /** Auth-level account state. `disabled` blocks token issuance outright. */
    status: { type: String, enum: ['active', 'disabled'], default: 'active', required: true },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.createWithPassword = async function createWithPassword({ password, ...rest }) {
  const passwordHash = await bcrypt.hash(password, 10);
  return this.create({ ...rest, passwordHash });
};

userSchema.statics.findByEmail = function findByEmail(email) {
  return this.findOne({ email: String(email).toLowerCase().trim() });
};

// Never serialise the password hash back to a client.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
