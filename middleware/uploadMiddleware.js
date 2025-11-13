// middleware/uploadMiddleware.js
// Configuração centralizada para uploads (memória)

const multer = require('multer');

const MAX_FILE_SIZE_MB = 8;
const ACCEPTED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]);

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
  if (ACCEPTED_MIME_TYPES.has(file.mimetype)) {
    return callback(null, true);
  }

  const error = new Error('Tipo de ficheiro não suportado. Utilize planilhas .xlsx.');
  error.statusCode = 400;
  return callback(error);
};

const ordersUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024
  },
  fileFilter
});

module.exports = {
  ordersUpload
};

