/**
 * Request Validation Middleware (Joi)
 */

const Joi = require('joi');
const { AppError } = require('./errorMiddleware');

const validate = (schema, property = 'body') => (req, res, next) => {
  const { error } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
  if (error) {
    const message = error.details.map((d) => d.message.replace(/"/g, "'")).join('; ');
    return next(new AppError(message, 400));
  }
  next();
};

// ─── Auth Schemas ─────────────────────────────────────────────────────────────
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).optional().messages({
    'string.pattern.base': 'Please provide a valid Indian phone number',
  }),
  password: Joi.string().min(8).max(128).required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.pattern.base': 'Password must contain uppercase, lowercase, and number',
    }),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// ─── Product Schemas ──────────────────────────────────────────────────────────
const productSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().min(10).max(500).required(),
  category: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid category ID',
  }),
  price: Joi.number().min(0).required(),
  discountPrice: Joi.number().min(0).less(Joi.ref('price')).optional(),
  type: Joi.string().valid('veg', 'non-veg', 'vegan', 'egg').required(),
  spiceLevel: Joi.string().valid('none', 'mild', 'medium', 'hot', 'extra-hot').default('none'),
  preparationTime: Joi.number().min(5).max(120).default(20),
  tags: Joi.array().items(Joi.string()).max(10).optional(),
  ingredients: Joi.array().items(Joi.string()).optional(),
  allergens: Joi.array().items(Joi.string()).optional(),
  isAvailable: Joi.boolean().default(true),
  isFeatured: Joi.boolean().default(false),
});

// ─── Order Schemas ────────────────────────────────────────────────────────────
const orderSchema = Joi.object({
  items: Joi.array().items(
    Joi.object({
      product: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
      quantity: Joi.number().min(1).max(20).required(),
      variantId: Joi.string().optional(),
    })
  ).min(1).required(),
  deliveryAddress: Joi.when('deliveryType', {
    is: 'delivery',
    then: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      pincode: Joi.string().pattern(/^\d{6}$/).required(),
      landmark: Joi.string().optional(),
    }).required(),
    otherwise: Joi.optional(),
  }),
  deliveryType: Joi.string().valid('delivery', 'pickup').default('delivery'),
  paymentMethod: Joi.string().valid('online', 'cod').default('online'),
  specialInstructions: Joi.string().max(300).optional(),
  couponCode: Joi.string().optional(),
});

// ─── Category Schema ──────────────────────────────────────────────────────────
const categorySchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  description: Joi.string().max(200).optional(),
  type: Joi.string().valid('veg', 'non-veg', 'vegan', 'drinks', 'desserts', 'mixed').default('mixed'),
  icon: Joi.string().optional(),
  sortOrder: Joi.number().default(0),
  isActive: Joi.boolean().default(true),
});

module.exports = {
  validate,
  schemas: { registerSchema, loginSchema, productSchema, orderSchema, categorySchema },
};
