# BookHaven: Cart, Checkout and Orders

Vanilla HTML/CSS/JS frontend + Node.js, Express and MongoDB (Mongoose) REST backend.

## Folder structure

```
BookHaven/
├── .gitignore
├── README.md
├── frontend/
│   ├── index.html            (existing Home page)
│   ├── book.html             (existing Books page)
│   ├── cart.html             NEW
│   ├── checkout.html         NEW
│   ├── css/
│   │   ├── style.css         (existing)
│   │   ├── book.css          (existing)
│   │   ├── cart.css          NEW  (tokens, header, buttons, cart page)
│   │   └── checkout.css      NEW
│   ├── js/
│   │   ├── main.js           (existing)
│   │   ├── books.js          (existing)
│   │   ├── cart-api.js       NEW  (shared API client, guest session, badge, wishlist, toasts)
│   │   ├── cart.js           NEW
│   │   └── checkout.js       NEW
│   └── images/books/*.svg    NEW  (sample covers + placeholder.svg)
└── backend/
    ├── server.js
    ├── seed.js               (loads sample books + coupons)
    ├── package.json
    ├── .env  /  .env.example
    ├── config/db.js
    ├── models/               Book, Cart, User, Order, Coupon
    ├── routes/               bookRoutes, cartRoutes, couponRoutes, orderRoutes
    ├── controllers/          bookController, cartController, couponController, orderController
    ├── services/cartService.js   (cart totals, coupon re-check, stock checks)
    ├── utils/pricing.js          (shipping, tax and total rules)
    └── middleware/           errorMiddleware, validationMiddleware
```

## Run it

1. Install Node.js 18 or newer from https://nodejs.org and MongoDB Community Server (or use a free MongoDB Atlas cluster).
2. Start MongoDB (`mongod`, or the MongoDB service on Windows/macOS).
3. Install and configure the backend:
   ```
   cd backend
   npm install
   ```
   Check `backend/.env` (`MONGODB_URI`, `PORT`).
4. Load the sample books and coupons: `npm run seed`
5. Start the server: `npm run dev` (auto-restart) or `node server.js`
6. Open http://localhost:5000

### How the frontend connects to the backend

- Express serves the `frontend/` folder, so http://localhost:5000 opens the site and `fetch('/api/cart')` hits the same server (no CORS needed).
- If you prefer VS Code Live Server (port 5500), it still works: `cart-api.js` calls `http://localhost:5000` when the page is not on port 5000, and `CLIENT_ORIGINS` in `.env` allows those origins.
- For a deployed site set `window.BOOKHAVEN_API_BASE = 'https://your-api-host'` before loading `cart-api.js`.
- Every request sends an `x-session-id` header. `cart-api.js` creates a random id (`guest_<uuid>`) in `localStorage` the first time, so guests have a persistent cart without logging in.

## Fitting it into your existing pages

1. **Header**: `cart.html` and `checkout.html` include a header built from your description (logo, Home, Books, Categories, About, search, wishlist, cart with badge, Login). If your Home page header markup differs, paste your header into the marked block in both files and link your own `style.css`; delete "Section 2: Header" from `cart.css` so the two do not fight.
2. **Fonts**: pages load Inter (body) and Playfair Display (headings). Swap for the fonts your Home page uses by editing `--font-serif` and `--font-sans` at the top of `cart.css`.
3. **Cart badge and Add to Cart on other pages**: add `<script src="js/cart-api.js"></script>` to `index.html` and `book.html`, add `<span class="bh-badge" data-cart-count hidden>0</span>` inside the cart icon, then on every "Add to cart" button:
   ```js
   button.addEventListener('click', async () => {
     try {
       const data = await BookHaven.addToCart(book._id, 1);  // book._id comes from GET /api/books
       BookHaven.notify(data.message, 'success');
     } catch (err) {
       BookHaven.notify(err.message, 'error');
     }
   });
   ```
   The Books page should load its books from `GET /api/books` so it has real `_id` values.
4. **Login button** links to `login.html` (for your teammate's page).

## Guest cart and login merge

- A guest cart is stored in MongoDB with `userId = guest_<uuid>`; the browser remembers the id in `localStorage`.
- When someone logs in, the login page calls `BookHaven.mergeGuestCart('user_<mongoUserId>')`. That sends `POST /api/cart/merge` with the guest id. The server adds each guest item to the account cart (same book: quantities are added, capped by stock and the per-order limit), keeps the guest coupon if the account has none, deletes the guest cart, and the browser then uses the account id from that point on.
- Important: this project has no authentication. In production, `req.userId` must come from a verified JWT or session cookie, not from a header the client can set.

## Rules enforced by the server

| Rule | Value (change in `.env`) |
|------|--------------------------|
| Free shipping at subtotal | ₹499 (`FREE_SHIPPING_THRESHOLD`) |
| Shipping fee below that | ₹49 (`SHIPPING_FEE`) |
| Tax on (subtotal - discount) | 5% (`TAX_RATE`) |
| Max copies of one book per order | 10 (`MAX_ITEM_QUANTITY`) |

`Total = Subtotal - Discount + Shipping + Tax`. Example from the brief: ₹1,497 subtotal, ₹200 discount, free shipping, ₹65 tax = ₹1,362.

Sample coupons (created by `npm run seed`): `BOOK10` (10% off, max ₹150, min ₹299), `SAVE100` (₹100 off, min ₹799), `WELCOME15` (15% off, max ₹200, min ₹399).

Security: prices always come from the `Book` collection; the cart re-validates its coupon on every read; stock is reserved atomically when an order is placed (and rolled back on failure); a cart can only turn into one order even with a double click; inputs are validated and stripped of `$`-keys and `<>`; rate limits apply to the API, coupon attempts and order attempts; `.env` is git-ignored; payment details never reach the server.

## Postman testing

Create an environment variable `baseUrl = http://localhost:5000`. For every cart/order request add the header `x-session-id: postman_test_1` and `Content-Type: application/json`.

1. **GET** `{{baseUrl}}/api/books` → `200`, `{ "success": true, "count": 8, "books": [ { "_id": "...", "title": "Atomic Habits", "price": 499, ... } ] }`. Copy two `_id` values. Try `?category=Technology` and `?search=atomic` too.
2. **GET** `{{baseUrl}}/api/cart` → `200`, empty cart:
   `{ "success": true, "cart": { "items": [], "coupon": null, "notices": [] }, "summary": { "itemCount": 0, "subtotal": 0, "total": 0, ... } }`
3. **POST** `{{baseUrl}}/api/cart/items`
   ```json
   { "bookId": "<id of Atomic Habits>", "quantity": 2 }
   ```
   → `201`, `"message": "\"Atomic Habits\" was added to your cart"`, subtotal `998`, shipping `0`, tax `50`, total `1048`.
4. **PATCH** `{{baseUrl}}/api/cart/items/<bookId>` with `{ "quantity": 3 }` → `200`, subtotal `1497`.
   - `{ "quantity": 0 }` → `400 { "success": false, "message": "Quantity must be greater than 0" }`
   - On "Don't Make Me Think" (3 in stock) `{ "quantity": 4 }` → `409 { "success": false, "message": "Only 3 copies are available" }`
5. **POST** `{{baseUrl}}/api/cart/coupon` with `{ "couponCode": "BOOK10" }` → `200`, `"discount": 150` (10% of 1497, capped at 150), plus the full cart.
   - `{ "couponCode": "FAKE" }` → `400 { "success": false, "message": "Invalid or expired coupon" }`
   - `DELETE {{baseUrl}}/api/cart/coupon` removes it.
6. **DELETE** `{{baseUrl}}/api/cart/items/<bookId>` → `200`, `"message": "Book removed from your cart"`. Repeating it → `404 Item not found in your cart`.
7. **POST** `{{baseUrl}}/api/cart/validate` → `200 { "success": true, "valid": true, ... }`, or `409` with an `issues` list when something is out of stock.
8. **POST** `{{baseUrl}}/api/orders` (cart must contain items)
   ```json
   {
     "customer": { "fullName": "Asha Raman", "email": "asha@example.com", "phone": "9876543210" },
     "shippingAddress": { "addressLine": "12 Lake View Road", "city": "Chennai", "state": "Tamil Nadu", "pinCode": "600001" },
     "paymentMethod": "COD"
   }
   ```
   → `201`, `{ "success": true, "message": "Order placed successfully!", "order": { "orderId": "BH-...", "status": "Placed", "total": 1414, "estimatedDelivery": "...", ... } }`
   - Empty cart → `400 Your cart is empty`; bad fields → `422` with an `errors` object per field.
9. **GET** `{{baseUrl}}/api/orders/<orderId>` → the saved order (only for the same `x-session-id`). **GET** `{{baseUrl}}/api/orders` lists your orders.
10. **DELETE** `{{baseUrl}}/api/cart` clears the cart.
11. No `x-session-id` header on any cart route → `401 A valid session is required.`
