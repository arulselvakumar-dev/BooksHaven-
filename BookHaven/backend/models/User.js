const mongoose = require('mongoose');

// Minimal account model used when the Login page is added. Carts are keyed by a string userId,
// so a guest cart (sessionId) can be merged into `user_<_id>` after login.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
