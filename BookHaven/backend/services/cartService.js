const Book = require('../models/Book');
const Cart = require('../models/Cart');
const Coupon = require('../models/Coupon');
const { calculateSummary, pricingConfig } = require('../utils/pricing');
const { AppError } = require('../middleware/errorMiddleware');

async function getOrCreateCart(userId) {
  try {
    return await Cart.findOneAndUpdate(
      { userId },
      { $setOnInsert: { items: [] } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code === 11000) return Cart.findOne({ userId }); // two requests created it at once
    throw err;
  }
}

// Load -> change -> save, retrying when two requests touch the same cart at the same moment.
async function mutateCart(userId, mutator) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const cart = await getOrCreateCart(userId);
    await mutator(cart);
    try {
      await cart.save();
      return cart;
    } catch (err) {
      if (err.name === 'VersionError' && attempt < 2) continue;
      throw err;
    }
  }
  return null;
}

/**
 * Builds the response the frontend renders. Every price comes from the Book collection
 * (never from the client), and the coupon is re-validated against the current subtotal.
 */
async function buildCartPayload(cart, { persist = true } = {}) {
  const { maxItemQuantity } = pricingConfig();
  const notices = [];
  let changed = false;

  const books = await Book.find({ _id: { $in: cart.items.map((i) => i.bookId) } }).lean();
  const bookMap = new Map(books.map((b) => [String(b._id), b]));

  const stillListed = cart.items.filter((i) => bookMap.has(String(i.bookId)));
  if (stillListed.length !== cart.items.length) {
    cart.items = stillListed;
    changed = true;
    notices.push('A book in your cart is no longer available and was removed.');
  }

  let subtotal = 0;
  let mrpTotal = 0;
  let itemCount = 0;
  const items = [];

  for (const ci of cart.items) {
    const book = bookMap.get(String(ci.bookId));
    if (ci.price !== book.price) {
      ci.price = book.price;
      changed = true;
      notices.push(`The price of "${book.title}" was updated.`);
    }
    let issue = null;
    if (book.stock < 1) issue = 'Out of stock';
    else if (ci.quantity > book.stock) {
      issue = `Only ${book.stock} ${book.stock === 1 ? 'copy is' : 'copies are'} available`;
    }
    const lineTotal = book.price * ci.quantity;
    subtotal += lineTotal;
    mrpTotal += (book.originalPrice || book.price) * ci.quantity;
    itemCount += ci.quantity;
    items.push({
      book: {
        _id: String(book._id),
        title: book.title,
        author: book.author,
        category: book.category,
        image: book.image,
        discount: book.discount,
        stock: book.stock,
        rating: book.rating,
        isbn: book.isbn,
      },
      quantity: ci.quantity,
      unitPrice: book.price,
      mrp: book.originalPrice || book.price,
      lineTotal,
      maxQty: Math.max(Math.min(book.stock, maxItemQuantity), 0),
      issue,
    });
  }

  let discount = 0;
  let coupon = null;
  if (cart.couponCode) {
    const doc = await Coupon.findOne({ code: cart.couponCode });
    const result = doc ? doc.calculateDiscount(subtotal) : { valid: false, message: 'Invalid or expired coupon' };
    if (result.valid) {
      discount = result.discount;
      coupon = { code: doc.code, description: doc.description, discount };
    } else {
      notices.push(`Coupon ${cart.couponCode} was removed. ${result.message}`);
      cart.couponCode = null;
      changed = true;
    }
  }

  if (changed && persist && !cart.isNew) {
    try {
      await cart.save();
    } catch (err) {
      console.warn('Could not persist cart clean-up:', err.message);
    }
  }

  return {
    cart: { items, coupon, notices },
    summary: calculateSummary({ subtotal, discount, mrpTotal, itemCount, couponCode: coupon ? coupon.code : null }),
  };
}

function checkoutIssues(payload) {
  const issues = [];
  if (!payload.cart.items.length) issues.push({ bookId: null, title: 'Cart', message: 'Your cart is empty' });
  payload.cart.items.forEach((i) => {
    if (i.issue) issues.push({ bookId: i.book._id, title: i.book.title, message: i.issue });
  });
  return { valid: issues.length === 0, issues };
}

function assertCanBuy(book, quantity) {
  if (book.stock < 1) throw new AppError('This book is out of stock', 409);
  if (quantity > book.stock) {
    throw new AppError(`Only ${book.stock} ${book.stock === 1 ? 'copy is' : 'copies are'} available`, 409);
  }
  const { maxItemQuantity } = pricingConfig();
  if (quantity > maxItemQuantity) {
    throw new AppError(`You can buy up to ${maxItemQuantity} copies of a book per order`, 400);
  }
}

module.exports = { getOrCreateCart, mutateCart, buildCartPayload, checkoutIssues, assertCanBuy };
