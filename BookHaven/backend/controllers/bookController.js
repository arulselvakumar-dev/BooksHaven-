const Book = require('../models/Book');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');
const { OBJECT_ID_RE } = require('../middleware/validationMiddleware');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isText = (v) => typeof v === 'string' && v.length > 0;

const SORTS = {
  'price-asc': { price: 1 },
  'price-desc': { price: -1 },
  rating: { rating: -1, reviews: -1 },
  newest: { createdAt: -1 },
  title: { title: 1 },
};

// GET /api/books?category=Technology&search=atomic&sort=price-asc&page=1&limit=20&ids=a,b
exports.getBooks = asyncHandler(async (req, res) => {
  const { category, search, ids, sort } = req.query;
  const filter = {};

  if (isText(category)) filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
  if (isText(search)) {
    const rx = new RegExp(escapeRegex(search.slice(0, 60)), 'i');
    filter.$or = [{ title: rx }, { author: rx }, { category: rx }];
  }
  if (isText(ids)) {
    filter._id = { $in: ids.split(',').filter((id) => OBJECT_ID_RE.test(id)).slice(0, 50) };
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);

  const [books, total] = await Promise.all([
    Book.find(filter)
      .sort(SORTS[sort] || SORTS.title)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Book.countDocuments(filter),
  ]);

  res.json({ success: true, count: books.length, total, page, books });
});

exports.getCategories = asyncHandler(async (req, res) => {
  const categories = await Book.distinct('category');
  res.json({ success: true, categories: categories.sort() });
});

exports.getBookById = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id).lean();
  if (!book) throw new AppError('Book not found', 404);
  res.json({ success: true, book });
});
