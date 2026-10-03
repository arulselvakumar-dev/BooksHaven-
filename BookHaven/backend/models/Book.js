const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 200 },
    author: { type: String, required: [true, 'Author is required'], trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    category: { type: String, required: [true, 'Category is required'], trim: true, index: true },
    price: { type: Number, required: [true, 'Price is required'], min: 0 },
    originalPrice: { type: Number, min: 0 },
    discount: { type: Number, min: 0, max: 100, default: 0 },
    image: { type: String, default: 'images/books/placeholder.svg' },
    isbn: { type: String, trim: true, unique: true, sparse: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviews: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true }
);

// Keep originalPrice and the discount percentage consistent with the selling price.
bookSchema.pre('validate', function (next) {
  if (!this.originalPrice || this.originalPrice < this.price) this.originalPrice = this.price;
  this.discount =
    this.originalPrice > this.price ? Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100) : 0;
  next();
});

module.exports = mongoose.model('Book', bookSchema);
