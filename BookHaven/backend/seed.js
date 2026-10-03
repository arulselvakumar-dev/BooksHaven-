// Run with: npm run seed
// Safe to run repeatedly: books are matched by ISBN and coupons by code, so existing ids (and carts) are kept.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Book = require('./models/Book');
const Coupon = require('./models/Coupon');

const books = [
  {
    title: 'Atomic Habits', author: 'James Clear', category: 'Self Help', price: 499, originalPrice: 699,
    stock: 50, rating: 4.8, reviews: 12840, isbn: '9780735211292', image: 'images/books/atomic-habits.svg',
    description: 'A practical guide to building small routines that compound into lasting change.',
  },
  {
    title: 'Clean Code', author: 'Robert C. Martin', category: 'Technology', price: 549, originalPrice: 799,
    stock: 30, rating: 4.7, reviews: 5210, isbn: '9780132350884', image: 'images/books/clean-code.svg',
    description: 'Principles and examples for writing readable, maintainable software.',
  },
  {
    title: 'The Silent Patient', author: 'Alex Michaelides', category: 'Fiction', price: 349, originalPrice: 499,
    stock: 40, rating: 4.5, reviews: 9320, isbn: '9781250301697', image: 'images/books/the-silent-patient.svg',
    description: 'A psychological thriller about a woman who stops speaking after a shocking crime.',
  },
  {
    title: 'Deep Work', author: 'Cal Newport', category: 'Self Help', price: 399, originalPrice: 599,
    stock: 35, rating: 4.6, reviews: 4105, isbn: '9781455586691', image: 'images/books/deep-work.svg',
    description: 'Rules for focused success in a distracted world.',
  },
  {
    title: 'The Psychology of Money', author: 'Morgan Housel', category: 'Finance', price: 379, originalPrice: 499,
    stock: 60, rating: 4.7, reviews: 8760, isbn: '9780857197689', image: 'images/books/the-psychology-of-money.svg',
    description: 'Timeless lessons on how behaviour shapes the way we earn, save and invest.',
  },
  {
    title: 'Rich Dad Poor Dad', author: 'Robert Kiyosaki', category: 'Finance', price: 299, originalPrice: 399,
    stock: 80, rating: 4.6, reviews: 15200, isbn: '9781612680194', image: 'images/books/rich-dad-poor-dad.svg',
    description: 'What the rich teach their kids about money that others do not.',
  },
  {
    title: "Don't Make Me Think", author: 'Steve Krug', category: 'Technology', price: 449, originalPrice: 649,
    stock: 3, rating: 4.6, reviews: 2380, isbn: '9780321965516', image: 'images/books/dont-make-me-think.svg',
    description: 'A common-sense approach to web usability. Only a few copies left.',
  },
  {
    title: 'The Pragmatic Programmer', author: 'Andrew Hunt', category: 'Technology', price: 699, originalPrice: 999,
    stock: 25, rating: 4.8, reviews: 3890, isbn: '9780135957059', image: 'images/books/the-pragmatic-programmer.svg',
    description: 'Your journey to mastery, with tips that apply to any language or stack.',
  },
];

const nextYear = new Date();
nextYear.setFullYear(nextYear.getFullYear() + 1);

const coupons = [
  { code: 'BOOK10', description: '10% off, up to ₹150', discountType: 'percentage', discountValue: 10, minimumAmount: 299, maximumDiscount: 150 },
  { code: 'SAVE100', description: '₹100 off orders above ₹799', discountType: 'flat', discountValue: 100, minimumAmount: 799, maximumDiscount: 0 },
  { code: 'WELCOME15', description: '15% off, up to ₹200', discountType: 'percentage', discountValue: 15, minimumAmount: 399, maximumDiscount: 200 },
].map((c) => ({ ...c, expiryDate: nextYear, isActive: true }));

(async () => {
  await connectDB();
  // bulkWrite skips Mongoose hooks, so compute the discount percentage here.
  await Book.bulkWrite(
    books.map((b) => ({
      updateOne: {
        filter: { isbn: b.isbn },
        update: { $set: { ...b, discount: Math.round(((b.originalPrice - b.price) / b.originalPrice) * 100) } },
        upsert: true,
      },
    }))
  );
  await Coupon.bulkWrite(
    coupons.map((c) => ({ updateOne: { filter: { code: c.code }, update: { $set: c }, upsert: true } }))
  );
  console.log(`Seeded ${books.length} books and ${coupons.length} coupons.`);
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('Seeding failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
