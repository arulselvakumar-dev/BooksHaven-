const express = require('express');
const rateLimit = require('express-rate-limit');
const { createOrder, getOrder, getOrders } = require('../controllers/orderController');
const { requireSession, validateOrder } = require('../middleware/validationMiddleware');
const { AppError } = require('../middleware/errorMiddleware');

const router = express.Router();

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many order attempts. Please try again in a few minutes.' },
});

const validateOrderId = (req, res, next) =>
  /^BH-[A-Z0-9-]{6,40}$/.test(req.params.orderId) ? next() : next(new AppError('Invalid order ID', 400));

router.use(requireSession);

router.post('/', orderLimiter, validateOrder, createOrder);
router.get('/', getOrders);
router.get('/:orderId', validateOrderId, getOrder);

module.exports = router;
