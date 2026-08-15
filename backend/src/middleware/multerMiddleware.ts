import multer from 'multer';
import { Request } from 'express';

// Define allowed mime types
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];

// Configure multer to use memory storage
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`));
  }
};

// Create multer instance with configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: fileFilter,
});

// Export a single file upload middleware named 'file'
export const uploadSingle = upload.single('file');
