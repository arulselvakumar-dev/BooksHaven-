/* BookHaven shared helpers: API client, guest session, header badge, wishlist, toasts.
   Include this file BEFORE cart.js / checkout.js (and on Home/Books pages if you want the cart badge
   and BookHaven.addToCart(bookId) for "Add to cart" buttons). */
(function () {
  'use strict';

  // Same origin when served by Express (port 5000). Otherwise talk to the API on localhost:5000.
  // Override in production with: <script>window.BOOKHAVEN_API_BASE = 'https://api.example.com';</script>
  var API_BASE =
    window.BOOKHAVEN_API_BASE !== undefined
      ? window.BOOKHAVEN_API_BASE
      : location.port === '5000'
      ? ''
      : 'http://localhost:5000';

  var SESSION_KEY = 'bookhaven_session_id';
  var CART_COUNT_KEY = 'bookhaven_cart_count';
  var WISHLIST_KEY = 'bookhaven_wishlist';
  var SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
  var memorySession = null;

  /* ---------- tiny DOM helper (always uses textContent, never innerHTML) ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i += 1) {
      [].concat(arguments[i]).forEach(function (child) {
        if (child !== null && child !== undefined && child !== false) el.append(child);
      });
    }
    return el;
  }

  /* ---------- formatting ---------- */
  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  function formatPrice(n) {
    return '₹' + inr.format(Math.round(Number(n) || 0));
  }
  function formatDate(value) {
    return new Date(value).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  /* ---------- guest session ---------- */
  function generateId() {
    if (window.crypto && crypto.randomUUID) return 'guest_' + crypto.randomUUID();
    return 'guest_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function getSessionId() {
    try {
      var id = localStorage.getItem(SESSION_KEY);
      if (!id || !SESSION_RE.test(id)) {
        id = generateId();
        localStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (e) {
      if (!memorySession) memorySession = generateId();
      return memorySession;
    }
  }

  /* ---------- API client ---------- */
  async function request(path, options) {
    options = options || {};
    var res;
    try {
      res = await fetch(API_BASE + path, {
        method: options.method || 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json', 'x-session-id': getSessionId() }, options.headers),
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (e) {
      var netErr = new Error('Cannot reach the server. Check your connection and try again.');
      netErr.network = true;
      throw netErr;
    }
    var data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON response */ }
    if (!res.ok || (data && data.success === false)) {
      var err = new Error((data && data.message) || 'Something went wrong (' + res.status + ')');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ---------- toasts ---------- */
  function notify(message, type) {
    var region = document.getElementById('toastRegion');
    if (!region) {
      region = h('div', { id: 'toastRegion', class: 'toast-region', 'aria-live': 'polite', 'aria-atomic': 'false' });
      document.body.append(region);
    }
    var toast = h('div', { class: 'toast toast--' + (type || 'info'), role: type === 'error' ? 'alert' : 'status', text: message });
    region.append(toast);
    setTimeout(function () {
      toast.classList.add('is-leaving');
      setTimeout(function () { toast.remove(); }, 250);
    }, type === 'error' ? 5500 : 3500);
  }

  /* ---------- header badges ---------- */
  function setBadge(count) {
    var n = Math.max(Number(count) || 0, 0);
    try { localStorage.setItem(CART_COUNT_KEY, String(n)); } catch (e) { /* storage unavailable */ }
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = n > 99 ? '99+' : String(n);
      el.hidden = n === 0;
    });
  }
  async function refreshBadge() {
    try {
      var data = await request('/api/cart/count');
      setBadge(data.count);
    } catch (e) { /* the badge is non-critical */ }
  }

  /* ---------- wishlist (kept in this browser) ---------- */
  function getWishlist() {
    try {
      var list = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
      return Array.isArray(list) ? list.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveWishlist(list) {
    try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
    updateWishlistBadge();
  }
  function addToWishlist(id) {
    var list = getWishlist();
    if (list.indexOf(id) === -1) list.push(id);
    saveWishlist(list);
  }
  function removeFromWishlist(id) {
    saveWishlist(getWishlist().filter(function (x) { return x !== id; }));
  }
  function updateWishlistBadge() {
    var n = getWishlist().length;
    document.querySelectorAll('[data-wishlist-count]').forEach(function (el) {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
  }

  /* ---------- cart actions usable from any page ---------- */
  async function addToCart(bookId, quantity) {
    var data = await request('/api/cart/items', { method: 'POST', body: { bookId: bookId, quantity: quantity || 1 } });
    setBadge(data.summary.itemCount);
    document.dispatchEvent(new CustomEvent('bookhaven:cart-changed', { detail: data }));
    return data;
  }

  // Call after a successful login with the account id (e.g. "user_<mongoId>").
  // Moves the guest cart into the account cart, then continues with the account id as the session.
  async function mergeGuestCart(accountId) {
    if (!SESSION_RE.test(accountId)) throw new Error('Invalid account id');
    var guestId = getSessionId();
    var data = await request('/api/cart/merge', {
      method: 'POST',
      headers: { 'x-session-id': accountId },
      body: { guestSessionId: guestId },
    });
    try { localStorage.setItem(SESSION_KEY, accountId); } catch (e) { /* ignore */ }
    setBadge(data.summary.itemCount);
    return data;
  }

  /* ---------- header behaviour (menu, search, wishlist panel) ---------- */
  function wireImageFallback(img) {
    img.addEventListener('error', function onError() {
      img.removeEventListener('error', onError);
      img.src = 'images/books/placeholder.svg';
    });
    return img;
  }

  var wishlistDialog = null;
  function ensureWishlistDialog() {
    if (wishlistDialog) return wishlistDialog;
    wishlistDialog = h('dialog', { class: 'dialog dialog--wide', 'aria-labelledby': 'wishlistTitle' });
    wishlistDialog.addEventListener('click', function (e) { if (e.target === wishlistDialog) wishlistDialog.close(); });
    document.body.append(wishlistDialog);
    return wishlistDialog;
  }
  async function openWishlist() {
    var dlg = ensureWishlistDialog();
    var body = h('div', { class: 'wishlist-body' });

    function shell(content) {
      dlg.replaceChildren(
        h('div', { class: 'dialog__head' },
          h('h2', { id: 'wishlistTitle', class: 'dialog__title', text: 'Your wishlist' }),
          h('button', { type: 'button', class: 'icon-close', 'aria-label': 'Close wishlist', onclick: function () { dlg.close(); } }, '×')),
        content
      );
    }

    shell(h('p', { class: 'muted', text: 'Loading your wishlist...' }));
    if (!dlg.open) dlg.showModal();

    var ids = getWishlist();
    if (!ids.length) {
      shell(h('div', { class: 'wishlist-empty' },
        h('p', { class: 'muted', text: 'Books you save for later will appear here.' }),
        h('a', { class: 'btn btn-primary', href: 'book.html', text: 'Explore Books' })));
      return;
    }

    try {
      var data = await request('/api/books?ids=' + ids.join(','));
      // drop ids of books that no longer exist
      var known = data.books.map(function (b) { return b._id; });
      if (known.length !== ids.length) saveWishlist(ids.filter(function (id) { return known.indexOf(id) !== -1; }));
      if (!data.books.length) { openWishlist(); return; }

      data.books.forEach(function (book) {
        var row = h('div', { class: 'wishlist-item' },
          wireImageFallback(h('img', { src: book.image, alt: '', width: 48, height: 72 })),
          h('div', { class: 'wishlist-item__info' },
            h('strong', { text: book.title }),
            h('span', { class: 'muted', text: book.author }),
            h('span', { text: formatPrice(book.price) })),
          h('div', { class: 'wishlist-item__actions' },
            h('button', {
              type: 'button', class: 'btn btn-primary btn-sm', disabled: book.stock < 1,
              text: book.stock < 1 ? 'Out of stock' : 'Move to cart',
              onclick: async function (e) {
                var btn = e.currentTarget;
                btn.disabled = true; btn.textContent = 'Updating...';
                try {
                  await addToCart(book._id, 1);
                  removeFromWishlist(book._id);
                  row.remove();
                  notify('"' + book.title + '" moved to your cart', 'success');
                  if (!body.children.length) openWishlist();
                } catch (err) {
                  notify(err.message, 'error');
                  btn.disabled = false; btn.textContent = 'Move to cart';
                }
              },
            }),
            h('button', {
              type: 'button', class: 'link-btn', text: 'Remove',
              onclick: function () {
                removeFromWishlist(book._id);
                row.remove();
                if (!body.children.length) openWishlist();
              },
            })));
        body.append(row);
      });
      shell(body);
    } catch (err) {
      shell(h('p', { class: 'form-error', role: 'alert', text: err.message }));
    }
  }

  function initHeader() {
    var menuToggle = document.getElementById('menuToggle');
    var nav = document.getElementById('mainNav');
    if (menuToggle && nav) {
      menuToggle.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      });
    }

    var searchToggle = document.getElementById('searchToggle');
    var searchBar = document.getElementById('searchBar');
    var searchInput = document.getElementById('searchInput');
    if (searchToggle && searchBar) {
      searchToggle.addEventListener('click', function () {
        var open = searchBar.hidden;
        searchBar.hidden = !open;
        searchToggle.setAttribute('aria-expanded', String(open));
        if (open && searchInput) searchInput.focus();
      });
      searchBar.addEventListener('submit', function (e) {
        e.preventDefault();
        var term = (searchInput.value || '').trim();
        if (term) location.href = 'book.html?search=' + encodeURIComponent(term);
      });
      searchBar.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { searchBar.hidden = true; searchToggle.setAttribute('aria-expanded', 'false'); searchToggle.focus(); }
      });
    }

    var wishlistBtn = document.getElementById('wishlistBtn');
    if (wishlistBtn) wishlistBtn.addEventListener('click', openWishlist);

    // show the last known count immediately, then correct it from the server
    var cached = 0;
    try { cached = Number(localStorage.getItem(CART_COUNT_KEY)) || 0; } catch (e) { /* ignore */ }
    setBadge(cached);
    updateWishlistBadge();
  }

  window.BookHaven = {
    API_BASE: API_BASE,
    h: h,
    request: request,
    notify: notify,
    formatPrice: formatPrice,
    formatDate: formatDate,
    getSessionId: getSessionId,
    setBadge: setBadge,
    refreshBadge: refreshBadge,
    addToCart: addToCart,
    mergeGuestCart: mergeGuestCart,
    getWishlist: getWishlist,
    addToWishlist: addToWishlist,
    removeFromWishlist: removeFromWishlist,
    wireImageFallback: wireImageFallback,
    initHeader: initHeader,
  };

  document.addEventListener('DOMContentLoaded', initHeader);
})();
