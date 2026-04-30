const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { AppError } = require('../middleware/errorMiddleware');
const User = require('../models/User');

router.use(protect);

router.post('/addresses', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.addresses.push(req.body);
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (e) { next(e); }
});

router.put('/addresses/:addressId', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const addr = user.addresses.id(req.params.addressId);
    if (!addr) return next(new AppError('Address not found', 404));
    Object.assign(addr, req.body);
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (e) { next(e); }
});

router.delete('/addresses/:addressId', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.addresses.pull({ _id: req.params.addressId });
    await user.save();
    res.json({ success: true, addresses: user.addresses });
  } catch (e) { next(e); }
});

module.exports = router;
