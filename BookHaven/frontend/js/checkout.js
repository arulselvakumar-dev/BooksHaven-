/* BookHaven checkout page. Needs js/cart-api.js loaded first.
   Payment is simulated: card / UPI details are validated here for realism but are never sent to the server. */
(function () {
  'use strict';

  var BH = window.BookHaven;
  var h = BH.h;
  var $ = function (id) { return document.getElementById(id); };
  var PROFILE_KEY = 'bookhaven_checkout_profile';

  var STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
    'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
    'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra',
    'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
    'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

  var VIEWS = ['checkoutLoading', 'checkoutError', 'checkoutEmpty', 'checkoutForm', 'orderSuccess'];
  function showView(name) {
    VIEWS.forEach(function (id) { $(id).hidden = id !== name; });
    $('checkoutHead').hidden = name === 'orderSuccess';
  }

  var placing = false;
  var lastOrderId = null;

  /* ---------- load cart ---------- */
  async function load() {
    showView('checkoutLoading');
    try {
      var data = await BH.request('/api/cart');
      BH.setBadge(data.summary.itemCount);
      if (!data.cart.items.length) { showView('checkoutEmpty'); return; }
      (data.cart.notices || []).forEach(function (n) { BH.notify(n, 'info'); });
      renderSummary(data);
      showView('checkoutForm');
      var problem = data.cart.items.filter(function (i) { return i.issue; })[0];
      if (problem) {
        showFormError(problem.book.title + ': ' + problem.issue + '. Update your cart before placing the order.');
      }
    } catch (err) {
      $('checkoutErrorMsg').textContent = err.message;
      showView('checkoutError');
    }
  }

  function renderSummary(data) {
    var s = data.summary;
    $('orderItems').replaceChildren.apply($('orderItems'), data.cart.items.map(function (i) {
      return h('li', { class: 'mini-item' },
        BH.wireImageFallback(h('img', { src: i.book.image, alt: '', width: 44, height: 64 })),
        h('div', null,
          h('p', { class: 'mini-item__title', text: i.book.title }),
          h('p', { class: 'mini-item__meta', text: 'Qty ' + i.quantity + ' × ' + BH.formatPrice(i.unitPrice) })),
        h('span', { class: 'mini-item__total', text: BH.formatPrice(i.lineTotal) }));
    }));
    $('sumSubtotal').textContent = BH.formatPrice(s.subtotal);
    $('sumDiscountLabel').textContent = s.couponCode ? 'Discount (' + s.couponCode + ')' : 'Discount';
    $('sumDiscount').textContent = s.discount > 0 ? '-' + BH.formatPrice(s.discount) : BH.formatPrice(0);
    $('sumDiscount').classList.toggle('is-saving', s.discount > 0);
    $('sumShipping').textContent = s.shipping === 0 ? 'FREE' : BH.formatPrice(s.shipping);
    $('sumShipping').classList.toggle('is-free', s.shipping === 0);
    $('sumTaxLabel').textContent = 'Tax' + (s.taxRate ? ' (' + Math.round(s.taxRate * 1000) / 10 + '%)' : '');
    $('sumTax').textContent = BH.formatPrice(s.tax);
    $('sumTotal').textContent = BH.formatPrice(s.total);
  }

  /* ---------- form setup ---------- */
  var stateSelect = $('state');
  STATES.forEach(function (name) { stateSelect.append(h('option', { value: name, text: name })); });

  try {
    var saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (saved) {
      ['fullName', 'email', 'phone', 'addressLine', 'city', 'state', 'pinCode'].forEach(function (f) {
        if (typeof saved[f] === 'string') $(f).value = saved[f];
      });
    }
  } catch (e) { /* ignore a corrupt profile */ }

  function selectedMethod() {
    return document.querySelector('input[name="paymentMethod"]:checked').value;
  }
  function syncPaymentFields() {
    var method = selectedMethod();
    $('upiFields').hidden = method !== 'UPI';
    $('cardFields').hidden = method !== 'CARD';
    clearError('paymentMethod');
  }
  document.querySelectorAll('input[name="paymentMethod"]').forEach(function (r) {
    r.addEventListener('change', syncPaymentFields);
  });

  // light input formatting
  $('cardNumber').addEventListener('input', function (e) {
    var digits = e.target.value.replace(/\D/g, '').slice(0, 19);
    e.target.value = digits.replace(/(.{4})/g, '$1 ').trim();
  });
  $('cardExpiry').addEventListener('input', function (e) {
    var digits = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
  });
  $('cardCvv').addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  $('pinCode').addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); });
  $('phone').addEventListener('input', function (e) { e.target.value = e.target.value.replace(/[^\d+\s-]/g, ''); });

  /* ---------- validation ---------- */
  function setError(field, message) {
    var input = $(field);
    var out = $(field + '-error');
    if (out) out.textContent = message;
    if (input) input.setAttribute('aria-invalid', 'true');
  }
  function clearError(field) {
    var input = $(field);
    var out = $(field + '-error');
    if (out) out.textContent = '';
    if (input) input.removeAttribute('aria-invalid');
  }
  function clearAllErrors() {
    ['fullName', 'email', 'phone', 'addressLine', 'city', 'state', 'pinCode', 'paymentMethod', 'upiId', 'cardNumber', 'cardExpiry', 'cardCvv']
      .forEach(clearError);
    showFormError('');
  }
  function showFormError(message) {
    var el = $('formError');
    el.hidden = !message;
    el.textContent = message || '';
  }

  function luhnValid(number) {
    var sum = 0;
    var flip = false;
    for (var i = number.length - 1; i >= 0; i -= 1) {
      var d = Number(number[i]);
      if (flip) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      flip = !flip;
    }
    return sum % 10 === 0;
  }

  function normalisePhone(value) {
    return value.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  }

  function validate() {
    clearAllErrors();
    var errors = {};
    var v = function (id) { return $(id).value.trim(); };

    if (v('fullName').length < 2) errors.fullName = 'Enter your full name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) errors.email = 'Enter a valid email address';
    if (!/^[6-9]\d{9}$/.test(normalisePhone(v('phone')))) errors.phone = 'Enter a valid 10-digit mobile number';
    if (v('addressLine').length < 5) errors.addressLine = 'Enter your full address';
    if (v('city').length < 2) errors.city = 'Enter your city';
    if (!v('state')) errors.state = 'Select your state';
    if (!/^[1-9]\d{5}$/.test(v('pinCode'))) errors.pinCode = 'Enter a valid 6-digit PIN code';

    var method = selectedMethod();
    if (method === 'UPI' && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(v('upiId'))) {
      errors.upiId = 'Enter a valid UPI ID, for example name@bank';
    }
    if (method === 'CARD') {
      var num = v('cardNumber').replace(/\s/g, '');
      if (num.length < 13 || num.length > 19 || !luhnValid(num)) errors.cardNumber = 'Enter a valid card number';
      var m = /^(\d{2})\/(\d{2})$/.exec(v('cardExpiry'));
      var now = new Date();
      if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 ||
          new Date(2000 + Number(m[2]), Number(m[1]), 1) <= new Date(now.getFullYear(), now.getMonth(), 1)) {
        errors.cardExpiry = 'Enter a valid, unexpired date';
      }
      if (!/^\d{3,4}$/.test(v('cardCvv'))) errors.cardCvv = 'Enter the 3 or 4 digit CVV';
    }
    return errors;
  }

  function showErrors(errors) {
    var order = ['fullName', 'email', 'phone', 'addressLine', 'city', 'state', 'pinCode', 'upiId', 'cardNumber', 'cardExpiry', 'cardCvv'];
    var first = null;
    Object.keys(errors).forEach(function (f) { setError(f, errors[f]); });
    order.some(function (f) { if (errors[f]) { first = f; return true; } return false; });
    if (first) $(first).focus();
  }

  document.querySelectorAll('.input, .select').forEach(function (el) {
    el.addEventListener('input', function () { clearError(el.id); });
  });

  /* ---------- place order ---------- */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  $('checkoutForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (placing) return;

    var errors = validate();
    if (Object.keys(errors).length) { showErrors(errors); return; }

    var method = selectedMethod();
    var v = function (id) { return $(id).value.trim(); };
    var body = {
      customer: { fullName: v('fullName'), email: v('email'), phone: normalisePhone(v('phone')) },
      shippingAddress: { addressLine: v('addressLine'), city: v('city'), state: v('state'), pinCode: v('pinCode') },
      paymentMethod: method,
    };

    placing = true;
    var btn = $('placeOrderBtn');
    btn.disabled = true;
    btn.textContent = method === 'COD' ? 'Updating...' : 'Processing payment...';

    try {
      if (method !== 'COD') await sleep(1200); // simulated payment gateway
      btn.textContent = 'Updating...';
      var data = await BH.request('/api/orders', { method: 'POST', body: body });
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(Object.assign({}, body.customer, body.shippingAddress))); } catch (err) { /* ignore */ }
      showSuccess(data.order);
    } catch (err) {
      if (err.data && err.data.errors) {
        showErrors(err.data.errors);
      } else {
        showFormError(err.message);
      }
      BH.notify(err.message, 'error');
      if (err.status === 409 || err.status === 400) load(); // stock or cart changed: refresh the summary
    } finally {
      placing = false;
      btn.disabled = false;
      btn.textContent = 'Place Order';
    }
  });

  function showSuccess(order) {
    lastOrderId = order.orderId;
    BH.setBadge(0);
    $('successOrderId').textContent = order.orderId;
    $('successTotal').textContent = BH.formatPrice(order.total);
    $('successDelivery').textContent = BH.formatDate(order.estimatedDelivery);
    document.title = 'Order placed | BookHaven';
    showView('orderSuccess');
    window.scrollTo({ top: 0 });
    $('successTitle').focus();
  }

  /* ---------- view order ---------- */
  function section(title, content) {
    return h('div', { class: 'order-section' }, h('h3', { text: title }), content);
  }

  $('viewOrderBtn').addEventListener('click', async function () {
    if (!lastOrderId) return;
    var btn = $('viewOrderBtn');
    btn.disabled = true;
    btn.textContent = 'Updating...';
    try {
      var data = await BH.request('/api/orders/' + encodeURIComponent(lastOrderId));
      openOrderDialog(data.order);
    } catch (err) {
      BH.notify(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'View Order';
    }
  });

  function openOrderDialog(o) {
    var dlg = $('orderDialog');
    var methodNames = { COD: 'Cash on Delivery', UPI: 'UPI', CARD: 'Credit / Debit Card' };
    var a = o.shippingAddress;

    var items = h('ul', { class: 'mini-items' });
    o.items.forEach(function (i) {
      items.append(h('li', { class: 'mini-item' },
        BH.wireImageFallback(h('img', { src: i.image, alt: '', width: 44, height: 64 })),
        h('div', null,
          h('p', { class: 'mini-item__title', text: i.title }),
          h('p', { class: 'mini-item__meta', text: i.author + ' · Qty ' + i.quantity + ' × ' + BH.formatPrice(i.price) })),
        h('span', { class: 'mini-item__total', text: BH.formatPrice(i.price * i.quantity) })));
    });

    function row(label, value, cls) {
      return h('div', { class: 'summary__row' }, h('dt', { text: label }), h('dd', { class: cls, text: value }));
    }
    var totals = h('dl', { class: 'summary__rows' },
      row('Subtotal', BH.formatPrice(o.subtotal)),
      row(o.couponCode ? 'Discount (' + o.couponCode + ')' : 'Discount', o.discount > 0 ? '-' + BH.formatPrice(o.discount) : BH.formatPrice(0), o.discount > 0 ? 'is-saving' : ''),
      row('Shipping', o.shipping === 0 ? 'FREE' : BH.formatPrice(o.shipping), o.shipping === 0 ? 'is-free' : ''),
      row('Tax', BH.formatPrice(o.tax)),
      h('div', { class: 'summary__row summary__row--total' }, h('dt', { text: 'Total' }), h('dd', { text: BH.formatPrice(o.total) })));

    dlg.replaceChildren(
      h('div', { class: 'dialog__head' },
        h('h2', { id: 'orderDialogTitle', class: 'dialog__title', text: 'Order ' + o.orderId }),
        h('button', { type: 'button', class: 'icon-close', 'aria-label': 'Close order details', onclick: function () { dlg.close(); } }, '×')),
      h('div', { class: 'order-dialog-scroll' },
        h('div', { class: 'order-meta' },
          h('span', { class: 'status-chip', text: o.status }),
          h('span', { text: 'Placed ' + BH.formatDate(o.createdAt) }),
          h('span', { text: 'Arrives by ' + BH.formatDate(o.estimatedDelivery) })),
        section('Books', items),
        section('Delivery address', h('p', { text: o.customer.fullName + ', ' + a.addressLine + ', ' + a.city + ', ' + a.state + ' - ' + a.pinCode + '. Phone: ' + o.customer.phone })),
        section('Payment', h('p', { text: methodNames[o.paymentMethod] + ' (' + (o.paymentStatus === 'Paid' ? 'paid' : 'pay on delivery') + ')' })),
        section('Price details', totals)));
    dlg.addEventListener('click', function onBackdrop(ev) { if (ev.target === dlg) dlg.close(); });
    dlg.showModal();
  }

  $('checkoutRetry').addEventListener('click', load);
  window.addEventListener('pageshow', function (e) { if (e.persisted && !lastOrderId) load(); });

  syncPaymentFields();
  load();
})();
