require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const bookRoutes = require('./routes/bookRoutes');
const cartRoutes = require('./routes/cartRoutes');
const couponRoutes = require('./routes/couponRoutes');
const orderRoutes = require('./routes/orderRoutes');
const { sanitizeInput } = require('./middleware/validationMiddleware');
const { AppError, notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();
app.disable('x-powered-by');

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header = same-origin page, Postman or curl.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new AppError('This origin is not allowed by CORS', 403));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-session-id'],
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(sanitizeInput);

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again shortly.' },
  })
);

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));
app.use('/api/books', bookRoutes);
app.use('/api/cart/coupon', couponRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

// Serve the frontend from the same server so http://localhost:5000 opens the site.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use(notFound);
app.use(errorHandler);

async function start() {
  await connectDB();
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`BookHaven running at http://localhost:${port}`));
}

if (require.main === module) {
  process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
  start();
}

module.exports = app;
