const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: '' },
  discountType: { type: String, enum: ['percentage', 'flat'], required: true },
  discountValue: { type: Number, required: true, min: 0 },
  minimumAmount: { type: Number, default: 0, min: 0 },
  maximumDiscount: { type: Number, default: 0, min: 0 }, // 0 = no cap (percentage coupons only)
  expiryDate: { type: Date },
  isActive: { type: Boolean, default: true },
});

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

// Returns { valid, discount, message } for a given cart subtotal. The server is the only place this runs.
couponSchema.methods.calculateDiscount = function (subtotal) {
  if (!this.isActive || (this.expiryDate && this.expiryDate < new Date())) {
    return { valid: false, discount: 0, message: 'Invalid or expired coupon' };
  }
  if (subtotal < this.minimumAmount) {
    return {
      valid: false,
      discount: 0,
      message: `${this.code} needs a minimum order of ${rupees(this.minimumAmount)}. Add ${rupees(
        this.minimumAmount - subtotal
      )} more.`,
    };
  }
  let raw = this.discountType === 'percentage' ? (subtotal * this.discountValue) / 100 : this.discountValue;
  if (this.discountType === 'percentage' && this.maximumDiscount > 0) raw = Math.min(raw, this.maximumDiscount);
  const discount = Math.min(Math.round(raw), subtotal);
  return { valid: true, discount, message: 'Coupon applied' };
};

module.exports = mongoose.model('Coupon', couponSchema);
