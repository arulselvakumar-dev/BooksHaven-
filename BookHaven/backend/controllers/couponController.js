const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');
const { mutateCart, buildCartPayload } = require('../services/cartService');

// POST /api/cart/coupon   { couponCode }
exports.applyCoupon = asyncHandler(async (req, res) => {
  const { couponCode } = req.body;
  const coupon = await Coupon.findOne({ code: couponCode });
  if (!coupon) throw new AppError('Invalid or expired coupon', 400);

  const current = await Cart.findOne({ userId: req.userId });
  if (!current || !current.items.length) throw new AppError('Add a book to your cart before applying a coupon', 400);

  // Validate against the real subtotal (calculated from database prices), not anything the client sends.
  const before = await buildCartPayload(current, { persist: false });
  const result = coupon.calculateDiscount(before.summary.subtotal);
  if (!result.valid) throw new AppError(result.message, 400);

  await mutateCart(req.userId, (cart) => {
    cart.couponCode = coupon.code;
  });

  const cart = await Cart.findOne({ userId: req.userId });
  const payload = await buildCartPayload(cart);
  res.json({
    success: true,
    message: `Coupon ${coupon.code} applied`,
    discount: payload.summary.discount,
    ...payload,
  });
});

// DELETE /api/cart/coupon
exports.removeCoupon = asyncHandler(async (req, res) => {
  await mutateCart(req.userId, (cart) => {
    cart.couponCode = null;
  });
  const cart = await Cart.findOne({ userId: req.userId });
  const payload = await buildCartPayload(cart);
  res.json({ success: true, message: 'Coupon removed', ...payload });
});

// GET /api/cart/coupon/available
exports.getAvailableCoupons = asyncHandler(async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gt: now } }],
  })
    .select('code description minimumAmount -_id')
    .sort({ code: 1 })
    .lean();
  res.json({ success: true, coupons });
});
