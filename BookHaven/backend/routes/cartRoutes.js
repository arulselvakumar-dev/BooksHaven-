const express = require('express');
const cart = require('../controllers/cartController');
const {
  requireSession,
  validateObjectId,
  validateAddItem,
  validateQuantityUpdate,
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireSession);

router.get('/', cart.getCart);
router.get('/count', cart.getCount);
router.delete('/', cart.clearCart);
router.post('/items', validateAddItem, cart.addItem);
router.patch('/items/:bookId', validateObjectId('bookId'), validateQuantityUpdate, cart.updateItem);
router.delete('/items/:bookId', validateObjectId('bookId'), cart.removeItem);
router.post('/validate', cart.validateCart);
router.post('/merge', cart.mergeCart);

module.exports = router;
