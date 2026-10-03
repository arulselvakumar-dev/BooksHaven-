const express = require('express');
const { getBooks, getBookById, getCategories } = require('../controllers/bookController');
const { validateObjectId } = require('../middleware/validationMiddleware');

const router = express.Router();

router.get('/', getBooks);
router.get('/categories', getCategories);
router.get('/:id', validateObjectId('id'), getBookById);

module.exports = router;
