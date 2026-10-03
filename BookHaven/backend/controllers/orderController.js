const crypto = require('crypto');
const Book = require('../models/Book');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');
const { buildCartPayload, checkoutIssues } = require('../services/cartService');

const DELIVERY_DAYS = 5;

function newOrderId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BH-${stamp}-${rand}`;
}

// POST /api/orders   { customer, shippingAddress, paymentMethod }
// The total is recalculated here from database prices; nothing about money is accepted from the client.
exports.createOrder = asyncHandler(async (req, res) => {
  const { customer, shippingAddress, paymentMethod } = req.body;

  // Atomically take the cart's contents. A second click / second tab finds an empty cart,
  // so one cart can never turn into two orders.
  const claimed = await Cart.findOneAndUpdate(
    { userId: req.userId, 'items.0': { $exists: true } },
    { $set: { items: [], couponCode: null, updatedAt: new Date() } },
    { new: false }
  );
  if (!claimed) throw new AppError('Your cart is empty', 400);

  const original = claimed.toObject();
  const reserved = [];

  try {
    const payload = await buildCartPayload(claimed, { persist: false });
    const { valid, issues } = checkoutIssues(payload);
    if (!valid) {
      const first = issues[0];
      throw new AppError(first.bookId ? `${first.title}: ${first.message}` : first.message, 409, { issues });
    }

    // Reserve stock; the $gte guard makes this safe when two customers buy the last copy together.
    for (const item of payload.cart.items) {
      const result = await Book.updateOne(
        { _id: item.book._id, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
      if (result.modifiedCount !== 1) {
        throw new AppError(`"${item.book.title}" is no longer available in that quantity`, 409);
      }
      reserved.push(item);
    }

    const s = payload.summary;
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + DELIVERY_DAYS);

    const order = await Order.create({
      orderId: newOrderId(),
      userId: req.userId,
      items: payload.cart.items.map((i) => ({
        bookId: i.book._id,
        title: i.book.title,
        author: i.book.author,
        image: i.book.image,
        quantity: i.quantity,
        price: i.unitPrice,
      })),
      customer,
      shippingAddress,
      subtotal: s.subtotal,
      discount: s.discount,
      couponCode: s.couponCode,
      shipping: s.shipping,
      tax: s.tax,
      total: s.total,
      paymentMethod,
      // Payments are simulated: UPI/card count as paid, cash on delivery stays pending.
      paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid',
      status: 'Placed',
      estimatedDelivery,
    });

    return res.status(201).json({ success: true, message: 'Order placed successfully!', order });
  } catch (err) {
    // Undo: give the stock back and put the cart back exactly as it was.
    for (const item of reserved) {
      await Book.updateOne({ _id: item.book._id }, { $inc: { stock: item.quantity } }).catch(() => {});
    }
    await Cart.updateOne(
      { userId: req.userId },
      { $set: { items: original.items, couponCode: original.couponCode } }
    ).catch(() => {});
    throw err;
  }
});

// GET /api/orders/:orderId
exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderId: req.params.orderId, userId: req.userId }).lean();
  if (!order) throw new AppError('Order not found', 404);
  res.json({ success: true, order });
});

// GET /api/orders
exports.getOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50).lean();
  res.json({ success: true, count: orders.length, orders });
});
