/* BookHaven cart page. Needs js/cart-api.js loaded first.
   The server owns every price, discount, shipping and tax figure; this file only displays them. */
(function () {
  'use strict';

  var BH = window.BookHaven;
  var h = BH.h;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    payload: null,        // { cart, summary } from the last server response
    busy: new Set(),      // book ids with a request in flight
    globalBusy: false,    // clear-cart in flight
    couponBusy: false,
    checkoutBusy: false,
    focus: null,          // control to re-focus after a re-render
  };

  var VIEWS = ['cartLoading', 'cartError', 'cartEmpty', 'cartContent'];
  function showView(name) {
    VIEWS.forEach(function (id) { $(id).hidden = id !== name; });
  }

  /* ---------- loading ---------- */
  async function loadCart() {
    showView('cartLoading');
    try {
      applyPayload(await BH.request('/api/cart'));
    } catch (err) {
      $('cartErrorMsg').textContent = err.message;
      showView('cartError');
    }
  }

  // Quietly re-sync with the server (used after a failed action) without flashing the skeleton.
  async function silentRefresh() {
    try {
      applyPayload(await BH.request('/api/cart'));
    } catch (err) {
      render();
    }
  }

  async function loadAvailableCoupons() {
    try {
      var data = await BH.request('/api/cart/coupon/available');
      var box = $('couponChips');
      box.replaceChildren();
      data.coupons.forEach(function (c) {
        box.append(h('button', {
          type: 'button', class: 'chip', title: c.description || c.code, text: c.code,
          onclick: function () { $('couponInput').value = c.code; $('couponInput').focus(); },
        }));
      });
      box.hidden = !data.coupons.length;
    } catch (err) { /* coupon suggestions are optional */ }
  }

  function applyPayload(data) {
    state.payload = { cart: data.cart, summary: data.summary };
    BH.setBadge(data.summary.itemCount);
    (data.cart.notices || []).forEach(function (n) { BH.notify(n, 'info'); });
    render();
  }

  /* ---------- rendering ---------- */
  function render() {
    if (!state.payload) return;
    var cart = state.payload.cart;
    var summary = state.payload.summary;
    document.title = (summary.itemCount ? 'Your Cart (' + summary.itemCount + ')' : 'Your Cart') + ' | BookHaven';

    if (!cart.items.length) {
      showView('cartEmpty');
      return;
    }
    showView('cartContent');
    renderShipping(summary);
    renderItems(cart.items);
    renderSummary(summary, cart.coupon);
    restoreFocus();
  }

  function renderShipping(s) {
    var banner = $('shippingBanner');
    banner.classList.toggle('is-unlocked', s.freeShipping);
    $('shippingText').textContent = s.freeShipping
      ? 'Free shipping unlocked!'
      : 'Add ' + BH.formatPrice(s.amountForFreeShipping) + ' more for FREE shipping';
    var pct = Math.min(100, Math.round((s.subtotal / s.freeShippingThreshold) * 100));
    $('shippingFill').style.width = pct + '%';
    $('shippingProgress').setAttribute('aria-valuenow', String(pct));
  }

  function renderItems(items) {
    $('cartItemCount').textContent = String(state.payload.summary.itemCount);
    $('clearCartBtn').disabled = state.globalBusy;
    $('clearCartBtn').textContent = state.globalBusy ? 'Updating...' : 'Clear cart';
    $('cartItems').replaceChildren.apply($('cartItems'), items.map(renderItem));
  }

  function renderItem(item) {
    var b = item.book;
    var busy = state.busy.has(b._id) || state.globalBusy;
    var atMax = item.quantity >= item.maxQty;
    var bookUrl = 'book.html?id=' + encodeURIComponent(b._id);

    var priceRow = h('div', { class: 'item-price' },
      h('strong', { text: BH.formatPrice(item.unitPrice) }),
      item.mrp > item.unitPrice && h('s', { 'aria-label': 'Original price', text: BH.formatPrice(item.mrp) }),
      b.discount > 0 && h('span', { class: 'tag', text: b.discount + '% off' }));

    return h('li', { class: 'cart-item' + (busy ? ' is-busy' : ''), dataset: { bookId: b._id }, 'aria-busy': busy ? 'true' : null },
      h('a', { class: 'cart-item__image', href: bookUrl, tabindex: '-1', 'aria-hidden': 'true' },
        BH.wireImageFallback(h('img', { src: b.image, alt: '', width: 96, height: 144, loading: 'lazy' }))),

      h('div', { class: 'cart-item__info' },
        h('span', { class: 'cart-item__category', text: b.category }),
        h('h3', { class: 'cart-item__title' }, h('a', { href: bookUrl, text: b.title })),
        h('p', { class: 'cart-item__author', text: 'by ' + b.author }),
        priceRow,
        item.issue && h('p', { class: 'cart-item__issue', role: 'alert', text: item.issue }),
        !item.issue && b.stock <= 5 && h('p', { class: 'cart-item__low', text: 'Only ' + b.stock + ' left in stock' }),
        h('div', { class: 'cart-item__links' },
          h('button', { type: 'button', class: 'link-btn link-btn--danger', dataset: { action: 'remove', id: b._id }, disabled: busy, 'aria-label': 'Remove ' + b.title + ' from cart', text: 'Remove' }),
          h('button', { type: 'button', class: 'link-btn', dataset: { action: 'wishlist', id: b._id }, disabled: busy, 'aria-label': 'Move ' + b.title + ' to wishlist', text: 'Move to Wishlist' }))),

      h('div', { class: 'cart-item__side' },
        h('div', { class: 'qty', role: 'group', 'aria-label': 'Quantity for ' + b.title },
          h('button', { type: 'button', class: 'qty-btn', dataset: { action: 'dec', id: b._id }, disabled: busy || item.quantity <= 1, 'aria-label': 'Decrease quantity of ' + b.title, text: '−' }),
          h('span', { class: 'qty-value', 'aria-live': 'polite', text: String(item.quantity) }),
          h('button', { type: 'button', class: 'qty-btn', dataset: { action: 'inc', id: b._id }, disabled: busy || atMax, 'aria-label': 'Increase quantity of ' + b.title, title: atMax ? 'No more copies available' : null, text: '+' })),
        h('div', { class: 'item-total' + (busy ? ' is-updating' : ''), text: busy ? 'Updating...' : BH.formatPrice(item.lineTotal) })));
  }

  function renderSummary(s, coupon) {
    $('sumSubtotal').textContent = BH.formatPrice(s.subtotal);

    var discountEl = $('sumDiscount');
    discountEl.textContent = s.discount > 0 ? '-' + BH.formatPrice(s.discount) : BH.formatPrice(0);
    discountEl.classList.toggle('is-saving', s.discount > 0);

    var shipEl = $('sumShipping');
    shipEl.textContent = s.shipping === 0 ? 'FREE' : BH.formatPrice(s.shipping);
    shipEl.classList.toggle('is-free', s.shipping === 0);

    $('sumTaxLabel').textContent = 'Tax' + (s.taxRate ? ' (' + Math.round(s.taxRate * 1000) / 10 + '%)' : '');
    $('sumTax').textContent = BH.formatPrice(s.tax);
    $('sumTotal').textContent = BH.formatPrice(s.total);

    var saved = s.savings + s.discount;
    var savedEl = $('sumSavings');
    savedEl.hidden = saved <= 0;
    savedEl.textContent = 'You are saving ' + BH.formatPrice(saved) + ' on this order';

    // coupon area
    $('couponForm').hidden = !!coupon;
    $('couponApplied').hidden = !coupon;
    if (coupon) {
      $('couponAppliedCode').textContent = coupon.code;
      $('couponAppliedText').textContent = 'applied (-' + BH.formatPrice(coupon.discount) + ')';
    }
    updateCouponUi();

    var checkout = $('checkoutBtn');
    checkout.disabled = state.checkoutBusy || state.globalBusy;
    checkout.textContent = state.checkoutBusy ? 'Updating...' : 'Proceed to Checkout';
  }

  function updateCouponUi() {
    var btn = $('couponApplyBtn');
    btn.disabled = state.couponBusy;
    btn.textContent = state.couponBusy ? 'Applying...' : 'Apply';
    $('couponInput').disabled = state.couponBusy;
  }

  function setCouponMessage(text, type) {
    var el = $('couponMessage');
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'coupon__message' + (type ? ' is-' + type : '');
  }

  function restoreFocus() {
    if (!state.focus) return;
    var sel = 'button[data-action="' + state.focus.action + '"][data-id="' + state.focus.id + '"]';
    var el = $('cartItems').querySelector(sel);
    if (el && !el.disabled) el.focus();
    state.focus = null;
  }

  /* ---------- confirmation dialog ---------- */
  function askConfirm(opts) {
    var dlg = $('confirmDialog');
    $('confirmTitle').textContent = opts.text;
    $('confirmSub').textContent = opts.sub || '';
    $('confirmOk').textContent = opts.confirmLabel || 'Remove';
    return new Promise(function (resolve) {
      var result = false;
      function ok() { result = true; dlg.close(); }
      function cancel() { dlg.close(); }
      function backdrop(e) { if (e.target === dlg) dlg.close(); }
      function done() {
        $('confirmOk').removeEventListener('click', ok);
        $('confirmCancel').removeEventListener('click', cancel);
        dlg.removeEventListener('click', backdrop);
        dlg.removeEventListener('close', done);
        resolve(result);
      }
      $('confirmOk').addEventListener('click', ok);
      $('confirmCancel').addEventListener('click', cancel);
      dlg.addEventListener('click', backdrop);
      dlg.addEventListener('close', done);
      dlg.showModal();
      $('confirmCancel').focus();
    });
  }

  /* ---------- item actions ---------- */
  function findItem(id) {
    return state.payload.cart.items.filter(function (i) { return i.book._id === id; })[0];
  }

  // Runs one request for one book, blocks duplicate clicks while it runs, then re-renders from the response.
  async function mutate(id, requestFn, successMessage) {
    if (state.busy.has(id) || state.globalBusy) return;
    state.busy.add(id);
    render();
    try {
      var data = await requestFn();
      state.busy.delete(id);
      applyPayload(data);
      if (successMessage) BH.notify(successMessage, 'success');
    } catch (err) {
      state.busy.delete(id);
      BH.notify(err.message, 'error');
      await silentRefresh(); // pick up the real stock / quantity
    }
  }

  function changeQuantity(id, delta) {
    var item = findItem(id);
    if (!item) return;
    var next = item.quantity + delta;
    if (next < 1) return;
    mutate(id, function () {
      return BH.request('/api/cart/items/' + id, { method: 'PATCH', body: { quantity: next } });
    });
  }

  async function removeItem(id) {
    var item = findItem(id);
    var ok = await askConfirm({ text: 'Remove this book from your cart?', sub: item ? item.book.title : '', confirmLabel: 'Remove' });
    if (!ok) { restoreFocusTo('remove', id); return; }
    mutate(id, function () {
      return BH.request('/api/cart/items/' + id, { method: 'DELETE' });
    }, 'Book removed from your cart');
  }

  function restoreFocusTo(action, id) {
    state.focus = { action: action, id: id };
    restoreFocus();
  }

  function moveToWishlist(id) {
    var item = findItem(id);
    mutate(id, async function () {
      var data = await BH.request('/api/cart/items/' + id, { method: 'DELETE' });
      BH.addToWishlist(id); // only after the cart update succeeded
      return data;
    }, item ? '"' + item.book.title + '" moved to your wishlist' : 'Moved to your wishlist');
  }

  $('cartItems').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;
    state.focus = { action: action, id: id };
    if (action === 'inc') changeQuantity(id, 1);
    else if (action === 'dec') changeQuantity(id, -1);
    else if (action === 'remove') removeItem(id);
    else if (action === 'wishlist') moveToWishlist(id);
  });

  $('clearCartBtn').addEventListener('click', async function () {
    if (state.globalBusy) return;
    var ok = await askConfirm({ text: 'Remove all books from your cart?', sub: 'This cannot be undone.', confirmLabel: 'Clear cart' });
    if (!ok) return;
    state.globalBusy = true;
    render();
    try {
      applyPayload(await BH.request('/api/cart', { method: 'DELETE' }));
      BH.notify('Your cart was cleared', 'success');
    } catch (err) {
      BH.notify(err.message, 'error');
    } finally {
      state.globalBusy = false;
      render();
    }
  });

  /* ---------- coupon ---------- */
  $('couponForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (state.couponBusy) return;
    var code = $('couponInput').value.trim().toUpperCase();
    if (!code) {
      setCouponMessage('Enter a coupon code.', 'error');
      $('couponInput').focus();
      return;
    }
    setCouponMessage('');
    state.couponBusy = true;
    updateCouponUi();
    try {
      var data = await BH.request('/api/cart/coupon', { method: 'POST', body: { couponCode: code } });
      state.couponBusy = false;
      $('couponInput').value = '';
      applyPayload(data);
      BH.notify(code + ' applied. You save ' + BH.formatPrice(data.discount) + '.', 'success');
    } catch (err) {
      state.couponBusy = false;
      updateCouponUi();
      setCouponMessage(err.message, 'error');
      $('couponInput').focus();
    }
  });

  $('couponRemoveBtn').addEventListener('click', async function () {
    if (state.couponBusy) return;
    state.couponBusy = true;
    $('couponRemoveBtn').disabled = true;
    $('couponRemoveBtn').textContent = 'Updating...';
    try {
      applyPayload(await BH.request('/api/cart/coupon', { method: 'DELETE' }));
      setCouponMessage('');
      BH.notify('Coupon removed', 'info');
    } catch (err) {
      BH.notify(err.message, 'error');
    } finally {
      state.couponBusy = false;
      $('couponRemoveBtn').disabled = false;
      $('couponRemoveBtn').textContent = 'Remove';
      updateCouponUi();
    }
  });

  /* ---------- checkout ---------- */
  $('checkoutBtn').addEventListener('click', async function () {
    if (state.checkoutBusy || state.globalBusy) return;
    state.checkoutBusy = true;
    render();
    try {
      // The server re-checks stock, quantities, prices and the session before we leave this page.
      await BH.request('/api/cart/validate', { method: 'POST' });
      window.location.href = 'checkout.html';
    } catch (err) {
      state.checkoutBusy = false;
      if (err.data && err.data.summary) applyPayload(err.data); else render();
      BH.notify(err.message, 'error');
    }
  });

  // Coming back with the Back button should not leave the button stuck on "Updating...".
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { state.checkoutBusy = false; loadCart(); }
  });

  // The wishlist panel in the header can move books into the cart.
  document.addEventListener('bookhaven:cart-changed', function (e) {
    if (e.detail && e.detail.summary) applyPayload(e.detail); else silentRefresh();
  });

  $('cartRetry').addEventListener('click', loadCart);

  loadCart();
  loadAvailableCoupons();
})();
