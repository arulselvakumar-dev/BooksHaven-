const Book = require('../models/Book');
const Cart = require('../models/Cart');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');
const { mutateCart, buildCartPayload, checkoutIssues, assertCanBuy } = require('../services/cartService');
const { pricingConfig } = require('../utils/pricing');

const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function respond(res, userId, { status = 200, message } = {}) {
  const cart = (await Cart.findOne({ userId })) || new Cart({ userId, items: [] });
  const payload = await buildCartPayload(cart);
  res.status(status).json({ success: true, ...(message ? { message } : {}), ...payload });
}

// GET /api/cart
exports.getCart = asyncHandler(async (req, res) => respond(res, req.userId));

// GET /api/cart/count  (lightweight, used for the header badge on every page)
exports.getCount = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ userId: req.userId }).lean();
  const count = cart ? cart.items.reduce((sum, i) => sum + i.quantity, 0) : 0;
  res.json({ success: true, count });
});

// POST /api/cart/items   { bookId, quantity }
exports.addItem = asyncHandler(async (req, res) => {
  const { bookId, quantity } = req.body;
  const book = await Book.findById(bookId).lean();
  if (!book) throw new AppError('Book not found', 404);

  await mutateCart(req.userId, (cart) => {
    const existing = cart.items.find((i) => String(i.bookId) === bookId);
    const newQty = (existing ? existing.quantity : 0) + quantity;
    assertCanBuy(book, newQty);
    if (existing) {
      existing.quantity = newQty;
      existing.price = book.price;
    } else {
      cart.items.push({ bookId: book._id, quantity, price: book.price });
    }
  });

  await respond(res, req.userId, { status: 201, message: `"${book.title}" was added to your cart` });
});

// PATCH /api/cart/items/:bookId   { quantity }
exports.updateItem = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const { quantity } = req.body;
  const book = await Book.findById(bookId).lean();
  if (!book) throw new AppError('Book not found', 404);

  await mutateCart(req.userId, (cart) => {
    const item = cart.items.find((i) => String(i.bookId) === bookId);
    if (!item) throw new AppError('Item not found in your cart', 404);
    assertCanBuy(book, quantity);
    item.quantity = quantity;
    item.price = book.price;
  });

  await respond(res, req.userId);
});

// DELETE /api/cart/items/:bookId
exports.removeItem = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  await mutateCart(req.userId, (cart) => {
    const before = cart.items.length;
    cart.items = cart.items.filter((i) => String(i.bookId) !== bookId);
    if (cart.items.length === before) throw new AppError('Item not found in your cart', 404);
  });
  await respond(res, req.userId, { message: 'Book removed from your cart' });
});

// DELETE /api/cart
exports.clearCart = asyncHandler(async (req, res) => {
  await mutateCart(req.userId, (cart) => {
    cart.items = [];
    cart.couponCode = null;
  });
  await respond(res, req.userId, { message: 'Your cart was cleared' });
});

// POST /api/cart/validate  — run before navigating to checkout
exports.validateCart = asyncHandler(async (req, res) => {
  const cart = (await Cart.findOne({ userId: req.userId })) || new Cart({ userId: req.userId, items: [] });
  const payload = await buildCartPayload(cart);
  const { valid, issues } = checkoutIssues(payload);
  if (!valid) {
    const first = issues[0];
    const message = first.bookId ? `${first.title}: ${first.message}` : first.message;
    throw new AppError(message, 409, { valid: false, issues, ...payload });
  }
  res.json({ success: true, valid: true, issues: [], ...payload });
});

// POST /api/cart/merge  { guestSessionId }
// Called right after login. The account id must come from the verified login session in production;
// here it is the x-session-id header so the flow can be demonstrated end to end.
exports.mergeCart = asyncHandler(async (req, res) => {
  const guestId = String((req.body || {}).guestSessionId || '');
  if (!SESSION_RE.test(guestId) || guestId === req.userId) {
    throw new AppError('Invalid guest session', 400);
  }
  const guestCart = await Cart.findOne({ userId: guestId });
  if (guestCart && guestCart.items.length) {
    const ids = guestCart.items.map((i) => i.bookId);
    const books = await Book.find({ _id: { $in: ids } }).lean();
    const bookMap = new Map(books.map((b) => [String(b._id), b]));
    const { maxItemQuantity } = pricingConfig();

    await mutateCart(req.userId, (cart) => {
      guestCart.items.forEach((g) => {
        const book = bookMap.get(String(g.bookId));
        if (!book || book.stock < 1) return;
        const cap = Math.min(book.stock, maxItemQuantity);
        const existing = cart.items.find((i) => String(i.bookId) === String(g.bookId));
        if (existing) existing.quantity = Math.min(existing.quantity + g.quantity, cap);
        else cart.items.push({ bookId: g.bookId, quantity: Math.min(g.quantity, cap), price: book.price });
      });
      if (!cart.couponCode && guestCart.couponCode) cart.couponCode = guestCart.couponCode;
    });
    await Cart.deleteOne({ userId: guestId });
  }
  await respond(res, req.userId, { message: 'Your guest cart was merged into your account' });
});
