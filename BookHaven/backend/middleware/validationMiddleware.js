const { AppError } = require('./errorMiddleware');
const { pricingConfig } = require('../utils/pricing');

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PIN_RE = /^[1-9][0-9]{5}$/;
const PHONE_RE = /^[6-9][0-9]{9}$/;

// Removes Mongo operator keys ($gt, a.b) and angle brackets from every string, so
// user input can neither inject queries nor carry HTML into stored data.
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      out[key] = clean(val);
    }
    return out;
  }
  if (typeof value === 'string') return value.replace(/[<>]/g, '').trim();
  return value;
}

function sanitizeInput(req, res, next) {
  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  next();
}

// The browser keeps a random id in localStorage and sends it as x-session-id.
// Guests and (later) logged-in users are both identified by this string.
function requireSession(req, res, next) {
  const id = req.get('x-session-id');
  if (!id || !SESSION_RE.test(id)) {
    return next(new AppError('A valid session is required. Please refresh the page.', 401));
  }
  req.userId = id;
  next();
}

function validateObjectId(param) {
  return (req, res, next) => {
    if (!OBJECT_ID_RE.test(String(req.params[param] || ''))) {
      return next(new AppError('Invalid book ID', 400));
    }
    next();
  };
}

function parseQuantity(value) {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || Number.isNaN(n)) {
    throw new AppError('Quantity is required', 400);
  }
  if (!Number.isInteger(n)) throw new AppError('Quantity must be a whole number', 400);
  if (n < 1) throw new AppError('Quantity must be greater than 0', 400);
  const max = pricingConfig().maxItemQuantity;
  if (n > max) throw new AppError(`You can buy up to ${max} copies of a book per order`, 400);
  return n;
}

function validateAddItem(req, res, next) {
  try {
    const { bookId, quantity } = req.body || {};
    if (!OBJECT_ID_RE.test(String(bookId || ''))) throw new AppError('Invalid book ID', 400);
    req.body = { bookId: String(bookId), quantity: quantity === undefined ? 1 : parseQuantity(quantity) };
    next();
  } catch (err) {
    next(err);
  }
}

function validateQuantityUpdate(req, res, next) {
  try {
    req.body = { quantity: parseQuantity((req.body || {}).quantity) };
    next();
  } catch (err) {
    next(err);
  }
}

function validateCoupon(req, res, next) {
  const raw = (req.body || {}).couponCode;
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!code) return next(new AppError('Please enter a coupon code', 400));
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return next(new AppError('Invalid or expired coupon', 400));
  req.body = { couponCode: code };
  next();
}

function validateOrder(req, res, next) {
  const body = req.body || {};
  const customer = body.customer || {};
  const address = body.shippingAddress || {};
  const errors = {};

  const fullName = String(customer.fullName || '');
  const email = String(customer.email || '').toLowerCase();
  const phone = String(customer.phone || '').replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  const addressLine = String(address.addressLine || '');
  const city = String(address.city || '');
  const state = String(address.state || '');
  const pinCode = String(address.pinCode || '');
  const paymentMethod = String(body.paymentMethod || '');

  if (fullName.length < 2 || fullName.length > 80) errors.fullName = 'Enter your full name';
  if (!EMAIL_RE.test(email) || email.length > 120) errors.email = 'Enter a valid email address';
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a valid 10-digit mobile number';
  if (addressLine.length < 5 || addressLine.length > 200) errors.addressLine = 'Enter your full address';
  if (city.length < 2 || city.length > 60) errors.city = 'Enter your city';
  if (state.length < 2 || state.length > 60) errors.state = 'Select your state';
  if (!PIN_RE.test(pinCode)) errors.pinCode = 'Enter a valid 6-digit PIN code';
  if (!['COD', 'UPI', 'CARD'].includes(paymentMethod)) errors.paymentMethod = 'Select a payment method';

  if (Object.keys(errors).length) {
    return next(new AppError('Please correct the highlighted fields', 422, { errors }));
  }

  req.body = {
    customer: { fullName, email, phone },
    shippingAddress: { addressLine, city, state, pinCode },
    paymentMethod,
  };
  next();
}

module.exports = {
  OBJECT_ID_RE,
  sanitizeInput,
  requireSession,
  validateObjectId,
  validateAddItem,
  validateQuantityUpdate,
  validateCoupon,
  validateOrder,
};
