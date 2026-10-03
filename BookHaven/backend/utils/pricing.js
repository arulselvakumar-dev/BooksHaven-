// All money rules live here so the cart and the order always agree.
// Values are read lazily so .env changes are picked up after dotenv runs.

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function pricingConfig() {
  return {
    freeShippingThreshold: num(process.env.FREE_SHIPPING_THRESHOLD, 499),
    shippingFee: num(process.env.SHIPPING_FEE, 49),
    taxRate: num(process.env.TAX_RATE, 0.05),
    maxItemQuantity: num(process.env.MAX_ITEM_QUANTITY, 10),
  };
}

function calculateSummary({ subtotal, discount = 0, mrpTotal = subtotal, itemCount = 0, couponCode = null }) {
  const cfg = pricingConfig();
  const safeDiscount = Math.min(Math.max(discount, 0), subtotal);
  const qualifiesForFreeShipping = subtotal >= cfg.freeShippingThreshold;
  const shipping = subtotal === 0 || qualifiesForFreeShipping ? 0 : cfg.shippingFee;
  const taxable = subtotal - safeDiscount;
  const tax = Math.round(taxable * cfg.taxRate);
  const total = taxable + shipping + tax;

  return {
    itemCount,
    subtotal,
    discount: safeDiscount,
    shipping,
    tax,
    taxRate: cfg.taxRate,
    total,
    savings: Math.max(mrpTotal - subtotal, 0),
    couponCode,
    freeShipping: subtotal > 0 && qualifiesForFreeShipping,
    freeShippingThreshold: cfg.freeShippingThreshold,
    amountForFreeShipping: subtotal > 0 ? Math.max(cfg.freeShippingThreshold - subtotal, 0) : cfg.freeShippingThreshold,
  };
}

module.exports = { pricingConfig, calculateSummary };
