const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    quantity: { type: Number, required: true, min: 1 },
    // Price snapshot when the book was added. Totals are always recalculated from the Book collection.
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema({
  // sessionId for guests, account id for logged-in users
  userId: { type: String, required: true, unique: true },
  items: { type: [cartItemSchema], default: [] },
  couponCode: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

cartSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Cart', cartSchema);
