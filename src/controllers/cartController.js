/**
 * Cart Controller
 * Sync cart between localStorage and database
 */

const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { AppError } = require('../middleware/errorMiddleware');

/**
 * GET /api/cart - Get user's cart
 */
exports.getCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id })
      .populate({
        path: 'items.product',
        select: 'name price discountPrice images isAvailable type variants',
      });

    if (!cart) {
      return res.json({ success: true, cart: { items: [], itemCount: 0 } });
    }

    // Filter out unavailable items
    cart.items = cart.items.filter((item) => item.product?.isAvailable);

    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/cart/sync - Sync localStorage cart to DB on login
 */
exports.syncCart = async (req, res, next) => {
  try {
    const { items } = req.body; // Array from localStorage

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });

    // Merge localStorage items with DB cart
    for (const localItem of items) {
      const product = await Product.findById(localItem.productId);
      if (!product || !product.isAvailable) continue;

      const existingIdx = cart.items.findIndex(
        (i) => i.product.toString() === localItem.productId
      );

      if (existingIdx > -1) {
        cart.items[existingIdx].quantity = Math.min(
          cart.items[existingIdx].quantity + localItem.quantity,
          20
        );
      } else {
        cart.items.push({
          product: localItem.productId,
          quantity: localItem.quantity,
          variant: localItem.variant || null,
        });
      }
    }

    await cart.save();
    await cart.populate({ path: 'items.product', select: 'name price discountPrice images isAvailable type' });

    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/cart/add - Add item to cart
 */
exports.addToCart = async (req, res, next) => {
  try {
    const { productId, quantity = 1, variantId } = req.body;

    const product = await Product.findById(productId);
    if (!product || !product.isActive || !product.isAvailable) {
      return next(new AppError('Product not available', 404));
    }

    let variant = null;
    if (variantId) {
      const v = product.variants.id(variantId);
      if (!v || !v.isAvailable) return next(new AppError('Variant not available', 400));
      variant = { variantId: v._id, name: v.name, price: v.price };
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });

    const existingIdx = cart.items.findIndex(
      (item) => item.product.toString() === productId &&
        (!variantId || item.variant?.variantId?.toString() === variantId)
    );

    if (existingIdx > -1) {
      cart.items[existingIdx].quantity = Math.min(
        cart.items[existingIdx].quantity + quantity,
        20
      );
    } else {
      cart.items.push({ product: productId, quantity, variant });
    }

    await cart.save();
    await cart.populate({ path: 'items.product', select: 'name price discountPrice images isAvailable type' });

    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/cart/item/:itemId - Update item quantity
 */
exports.updateCartItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return next(new AppError('Cart not found', 404));

    const item = cart.items.id(req.params.itemId);
    if (!item) return next(new AppError('Item not found in cart', 404));

    if (quantity <= 0) {
      cart.items.pull({ _id: req.params.itemId });
    } else {
      item.quantity = Math.min(quantity, 20);
    }

    await cart.save();
    await cart.populate({ path: 'items.product', select: 'name price discountPrice images isAvailable type' });

    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/cart/item/:itemId - Remove item
 */
exports.removeFromCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return next(new AppError('Cart not found', 404));

    cart.items.pull({ _id: req.params.itemId });
    await cart.save();
    await cart.populate({ path: 'items.product', select: 'name price discountPrice images isAvailable type' });

    res.json({ success: true, cart });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/cart/clear - Clear entire cart
 */
exports.clearCart = async (req, res, next) => {
  try {
    await Cart.findOneAndUpdate(
      { user: req.user._id },
      { $set: { items: [], appliedCoupon: null } }
    );
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    next(error);
  }
};
