/**
 * Cloudinary Configuration
 * Image upload and management
 */
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
// Multer storage with Cloudinary
const createStorage = (folder, transformations = []) =>
  new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `restaurant/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'avif','HEIC','SVG'],
      transformation: transformations.length
        ? transformations
        : [{ width: 800, height: 600, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }],
    },
  });

// Different upload configs for different content types
const productUpload = multer({
  storage: createStorage('products', [
    { width: 800, height: 600, crop: 'fill', gravity: 'center', quality: 'auto:best', fetch_format: 'auto' },
  ]),
  limits: { fileSize: 8 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});
const categoryUpload = multer({
  storage: createStorage('categories', [
    { width: 400, height: 400, crop: 'fill', quality: 'auto:good', fetch_format: 'auto' },
  ]),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});
const bannerUpload = multer({
  storage: createStorage('banners', [
    { width: 1920, height: 600, crop: 'fill', gravity: 'center', quality: 'auto:best', fetch_format: 'auto' },
  ]),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});
// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Failed to delete Cloudinary image:', error);
  }
};
// Extract public_id from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  const folder = parts[parts.length - 2];
  const parentFolder = parts[parts.length - 3];
  return `${parentFolder}/${folder}/${filename.split('.')[0]}`;
};
module.exports = {
  cloudinary,
  productUpload,
  categoryUpload,
  bannerUpload,
  deleteImage,
  getPublicIdFromUrl,
};