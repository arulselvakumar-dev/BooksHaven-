const express = require('express');
const rateLimit = require('express-rate-limit');
const { applyCoupon, removeCoupon, getAvailableCoupons } = require('../controllers/couponController');
const { requireSession, validateCoupon } = require('../middleware/validationMiddleware');

const router = express.Router();

// Slows down coupon-code guessing
const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many coupon attempts. Please try again in a few minutes.' },
});

// Mounted at /api/cart/coupon
router.get('/available', getAvailableCoupons);
router.post('/', couponLimiter, requireSession, validateCoupon, applyCoupon);
router.delete('/', requireSession, removeCoupon);

module.exports = router;
