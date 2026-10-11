const mongoose = require('mongoose');

const InventoryBatchSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  category: { type: String, required: true },
  batchNumber: { type: String, required: true, unique: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  expirationDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InventoryBatch', InventoryBatchSchema);
