const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const InventoryBatch = require('./models/InventoryBatch');

const app = express();
app.use(express.json());
app.use(cors());

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

// Fallback seed inventory batches across Blinkit/Zepto categories
const initialBatches = [
  // Dairy
  {
    productId: 'Dairy_Milk_1L',
    productName: 'Fresh Whole Milk 1L',
    category: 'Dairy',
    batchNumber: 'BATCH-DAIRY-01',
    quantity: 90,
    price: 14.5,
    expirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  },
  {
    productId: 'Dairy_Milk_1L',
    productName: 'Fresh Whole Milk 1L',
    category: 'Dairy',
    batchNumber: 'BATCH-DAIRY-02',
    quantity: 50,
    price: 14.5,
    expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  },
  {
    productId: 'Dairy_Paneer_200g',
    productName: 'Fresh Malai Paneer 200g',
    category: 'Dairy',
    batchNumber: 'BATCH-DAIRY-03',
    quantity: 40,
    price: 18.0,
    expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  },
  {
    productId: 'Dairy_Curd_500g',
    productName: 'Natural Set Curd 500g',
    category: 'Dairy',
    batchNumber: 'BATCH-DAIRY-04',
    quantity: 60,
    price: 9.0,
    expirationDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
  },
  // Produce
  {
    productId: 'Produce_Tomatoes_500g',
    productName: 'Farm Fresh Tomatoes 500g',
    category: 'Produce',
    batchNumber: 'BATCH-PROD-01',
    quantity: 110,
    price: 8.5,
    expirationDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
  },
  {
    productId: 'Produce_Onions_1kg',
    productName: 'Red Onions 1kg',
    category: 'Produce',
    batchNumber: 'BATCH-PROD-02',
    quantity: 140,
    price: 12.0,
    expirationDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
  },
  {
    productId: 'Produce_Bananas_1dz',
    productName: 'Robusta Bananas 1 Dozen',
    category: 'Produce',
    batchNumber: 'BATCH-PROD-03',
    quantity: 75,
    price: 10.0,
    expirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  },
  // Snacks
  {
    productId: 'Snacks_Chips_100g',
    productName: 'Classic Salted Potato Chips 100g',
    category: 'Snacks',
    batchNumber: 'BATCH-SNACK-01',
    quantity: 160,
    price: 6.0,
    expirationDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
  },
  {
    productId: 'Snacks_Biscuits_200g',
    productName: 'Butter Cookies 200g',
    category: 'Snacks',
    batchNumber: 'BATCH-SNACK-02',
    quantity: 120,
    price: 7.5,
    expirationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  },
  // Beverages
  {
    productId: 'Beverages_ColdDrink_2L',
    productName: 'Sparkling Cola 2L',
    category: 'Beverages',
    batchNumber: 'BATCH-BEV-01',
    quantity: 80,
    price: 15.0,
    expirationDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
  },
  {
    productId: 'Beverages_Juice_1L',
    productName: 'Orange Juice 1L',
    category: 'Beverages',
    batchNumber: 'BATCH-BEV-02',
    quantity: 95,
    price: 22.0,
    expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  },
  // Meat
  {
    productId: 'Meat_Chicken_500g',
    productName: 'Tender Chicken Breast 500g',
    category: 'Meat',
    batchNumber: 'BATCH-MEAT-01',
    quantity: 50,
    price: 28.0,
    expirationDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  },
  {
    productId: 'Meat_Eggs_6pack',
    productName: 'Farm Fresh Brown Eggs (Pack of 6)',
    category: 'Meat',
    batchNumber: 'BATCH-MEAT-02',
    quantity: 130,
    price: 11.0,
    expirationDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000)
  }
];

mongoose.connect('mongodb://localhost:27017/smart_inventory', {
  serverSelectionTimeoutMS: 3000
})
  .then(async () => {
    console.log('✅ Connected to MongoDB (smart_inventory)');
    try {
      const count = await InventoryBatch.countDocuments();
      if (count === 0) {
        await InventoryBatch.insertMany(initialBatches);
        console.log(`🌱 Seeded ${initialBatches.length} initial FEFO inventory batches into MongoDB`);
      }
    } catch (seedErr) {
      console.warn('MongoDB seed warning:', seedErr.message);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.warn('ℹ️  Using fallback FEFO warehouse batches (operating seamlessly in offline mode).');
  });

// Helper to fetch batches with FEFO sort
async function getBatchesForProduct(productId) {
  if (mongoose.connection.readyState === 1) {
    return await InventoryBatch.find({ productId }).sort({ expirationDate: 1 });
  } else {
    // In-memory FEFO fallback
    const matched = initialBatches.filter(b => b.productId === productId);
    return matched.sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));
  }
}

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 1. Single Forecast & FEFO Check Endpoint
app.post('/api/v1/forecast-and-stock', async (req, res) => {
  try {
    const {
      productId,
      product_id,
      category = 'Dairy',
      time_of_day = 19,
      price = 14.5,
      historical_demand = 140,
      is_weekend = 1
    } = req.body;

    const actualProductId = productId || product_id || 'Dairy_Milk_1L';

    // FEFO: Fetch batches sorted by earliest expiration date first
    const batches = await getBatchesForProduct(actualProductId);
    const totalStock = Math.round(batches.reduce((sum, b) => sum + b.quantity, 0));
    const nearestBatch = batches[0] || null;

    let shelf_life_days = 10;
    if (nearestBatch) {
      const diffTime = new Date(nearestBatch.expirationDate) - new Date();
      shelf_life_days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    // Call FastAPI ML Microservice
    const mlResponse = await axios.post('http://localhost:8000/predict', {
      category,
      product_id: actualProductId,
      time_of_day: parseInt(time_of_day, 10),
      price: parseFloat(price),
      shelf_life_days,
      historical_demand: parseInt(historical_demand, 10),
      is_weekend: parseInt(is_weekend, 10)
    });

    const predictedDemand = Math.round(mlResponse.data.predicted_demand);
    const isLowStock = totalStock < predictedDemand;
    const restockQuantity = isLowStock ? Math.round(predictedDemand - totalStock) : 0;

    res.json({
      productId: actualProductId,
      category,
      currentStock: totalStock,
      predictedDemand: predictedDemand,
      fefoStatus: {
        nearestBatch: nearestBatch ? nearestBatch.batchNumber : "N/A",
        expirationDate: nearestBatch ? nearestBatch.expirationDate : "N/A",
        daysRemaining: shelf_life_days
      },
      alerts: {
        stockoutWarning: isLowStock,
        restockQuantity: restockQuantity
      },
      explainability: {
        shapAttributions: mlResponse.data.shap_attributions
      }
    });

  } catch (error) {
    console.error('Error handling forecast:', error.message);
    res.status(500).json({ error: 'Failed to generate inventory forecast', details: error.message });
  }
});

// 2. Batch CSV Upload & Forecast Endpoint
app.post('/api/v1/forecast-batch', upload.single('warehouseData'), async (req, res) => {
  try {
    let rows = [];

    // Support both multipart file upload and JSON body array
    if (req.file) {
      const filePath = req.file.path;
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => rows.push(data))
          .on('end', resolve)
          .on('error', reject);
      });
      // Delete temporary uploaded file
      try { fs.unlinkSync(filePath); } catch (e) {}
    } else if (Array.isArray(req.body.items)) {
      rows = req.body.items;
    } else if (Array.isArray(req.body)) {
      rows = req.body;
    } else {
      return res.status(400).json({ error: "No CSV file ('warehouseData') or JSON items array provided." });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: "Uploaded CSV contains no valid data rows." });
    }

    // Prepare batch payload for ML microservice & gather FEFO status
    const mlBatchPayload = [];
    const metaList = [];

    for (const row of rows) {
      const category = row.category || 'Dairy';
      const pid = row.productId || row.product_id || 'Dairy_Milk_1L';
      const time_of_day = parseInt(row.time_of_day || row.timeOfDay || 19, 10);
      const price = parseFloat(row.price || 15.0);
      const historical_demand = parseInt(row.historical_demand || row.historicalDemand || 100, 10);
      const is_weekend = parseInt(row.is_weekend || row.isWeekend || 0, 10);

      // Lookup FEFO batches
      const batches = await getBatchesForProduct(pid);
      const totalStock = row.current_stock || row.currentStock
        ? Math.round(parseFloat(row.current_stock || row.currentStock))
        : Math.round(batches.reduce((sum, b) => sum + b.quantity, 0));

      const nearestBatch = batches[0] || null;
      let shelf_life_days = parseInt(row.shelf_life_days || 10, 10);
      if (nearestBatch && !row.shelf_life_days) {
        const diffTime = new Date(nearestBatch.expirationDate) - new Date();
        shelf_life_days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }

      mlBatchPayload.push({
        category,
        product_id: pid,
        time_of_day,
        price,
        shelf_life_days,
        historical_demand,
        is_weekend
      });

      metaList.push({
        productId: pid,
        category,
        totalStock,
        nearestBatch: nearestBatch ? nearestBatch.batchNumber : "N/A",
        expirationDate: nearestBatch ? nearestBatch.expirationDate : "N/A",
        shelf_life_days
      });
    }

    // Call FastAPI /predict-batch
    const mlResponse = await axios.post('http://localhost:8000/predict-batch', mlBatchPayload);
    const predictions = mlResponse.data;

    // Combine results into final response
    const results = predictions.map((pred, idx) => {
      const meta = metaList[idx];
      const predictedDemand = Math.round(pred.predicted_demand);
      const isLowStock = meta.totalStock < predictedDemand;
      const restockQuantity = isLowStock ? Math.round(predictedDemand - meta.totalStock) : 0;

      return {
        productId: meta.productId,
        category: meta.category,
        currentStock: meta.totalStock,
        predictedDemand: predictedDemand,
        fefoStatus: {
          nearestBatch: meta.nearestBatch,
          expirationDate: meta.expirationDate,
          daysRemaining: meta.shelf_life_days
        },
        alerts: {
          stockoutWarning: isLowStock,
          restockQuantity: restockQuantity
        },
        explainability: {
          shapAttributions: pred.shap_attributions
        }
      };
    });

    res.json({
      status: 'success',
      count: results.length,
      items: results
    });

  } catch (error) {
    console.error('Error handling batch forecast:', error.message);
    res.status(500).json({ error: 'Failed to process batch inventory forecast', details: error.message });
  }
});

// Full Catalog SKUs across Blinkit/Zepto categories
const catalogProducts = [
  { category: 'Dairy', productId: 'Dairy_Milk_1L', productName: 'Fresh Whole Milk 1L', defaultPrice: 14.5, defaultDemand: 140 },
  { category: 'Dairy', productId: 'Dairy_Paneer_200g', productName: 'Fresh Malai Paneer 200g', defaultPrice: 18.0, defaultDemand: 90 },
  { category: 'Dairy', productId: 'Dairy_Curd_500g', productName: 'Natural Set Curd 500g', defaultPrice: 9.0, defaultDemand: 110 },
  { category: 'Produce', productId: 'Produce_Tomatoes_500g', productName: 'Farm Fresh Tomatoes 500g', defaultPrice: 8.5, defaultDemand: 180 },
  { category: 'Produce', productId: 'Produce_Onions_1kg', productName: 'Red Onions 1kg', defaultPrice: 12.0, defaultDemand: 150 },
  { category: 'Produce', productId: 'Produce_Bananas_1dz', productName: 'Robusta Bananas 1 Dozen', defaultPrice: 10.0, defaultDemand: 160 },
  { category: 'Snacks', productId: 'Snacks_Chips_100g', productName: 'Classic Salted Potato Chips 100g', defaultPrice: 6.0, defaultDemand: 220 },
  { category: 'Snacks', productId: 'Snacks_Biscuits_200g', productName: 'Butter Cookies 200g', defaultPrice: 7.5, defaultDemand: 130 },
  { category: 'Beverages', productId: 'Beverages_ColdDrink_2L', productName: 'Sparkling Cola 2L', defaultPrice: 15.0, defaultDemand: 110 },
  { category: 'Beverages', productId: 'Beverages_Juice_1L', productName: 'Orange Juice 1L', defaultPrice: 22.0, defaultDemand: 80 },
  { category: 'Meat', productId: 'Meat_Chicken_500g', productName: 'Tender Chicken Breast 500g', defaultPrice: 28.0, defaultDemand: 130 },
  { category: 'Meat', productId: 'Meat_Eggs_6pack', productName: 'Farm Fresh Brown Eggs (Pack of 6)', defaultPrice: 11.0, defaultDemand: 140 }
];

// 3. Complete Catalog Forecast & Explanations Endpoint (All Products)
app.all('/api/v1/forecast-all', async (req, res) => {
  try {
    const time_of_day = parseInt(req.query.time_of_day || (req.body && req.body.time_of_day) || 19, 10);
    const is_weekend = parseInt(req.query.is_weekend || (req.body && req.body.is_weekend) || 1, 10);

    const mlBatchPayload = [];
    const metaList = [];

    for (const prod of catalogProducts) {
      const batches = await getBatchesForProduct(prod.productId);
      const totalStock = Math.round(batches.reduce((sum, b) => sum + b.quantity, 0));
      const nearestBatch = batches[0] || null;

      let shelf_life_days = 10;
      if (nearestBatch) {
        const diffTime = new Date(nearestBatch.expirationDate) - new Date();
        shelf_life_days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      }

      mlBatchPayload.push({
        category: prod.category,
        product_id: prod.productId,
        time_of_day,
        price: prod.defaultPrice,
        shelf_life_days,
        historical_demand: prod.defaultDemand,
        is_weekend
      });

      metaList.push({
        productId: prod.productId,
        productName: prod.productName,
        category: prod.category,
        price: prod.defaultPrice,
        historicalDemand: prod.defaultDemand,
        totalStock,
        nearestBatch: nearestBatch ? nearestBatch.batchNumber : "N/A",
        expirationDate: nearestBatch ? nearestBatch.expirationDate : "N/A",
        shelf_life_days
      });
    }

    const mlResponse = await axios.post('http://localhost:8000/predict-batch', mlBatchPayload);
    const predictions = mlResponse.data;

    const results = predictions.map((pred, idx) => {
      const meta = metaList[idx];
      const predictedDemand = Math.round(pred.predicted_demand);
      const isLowStock = meta.totalStock < predictedDemand;
      const restockQuantity = isLowStock ? Math.round(predictedDemand - meta.totalStock) : 0;

      // Generate human-readable explanation summary
      const attrs = pred.shap_attributions || {};
      const keyDrivers = Object.entries(attrs)
        .filter(([k, v]) => Math.abs(v) > 1.0)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

      const topPositives = keyDrivers.filter(([, v]) => v > 0).slice(0, 3).map(([k, v]) => `${k.replace('category_', 'Cat: ').replace(/_/g, ' ')} (+${Math.round(v)})`);
      const topNegatives = keyDrivers.filter(([, v]) => v < 0).slice(0, 3).map(([k, v]) => `${k.replace('category_', 'Cat: ').replace(/_/g, ' ')} (${Math.round(v)})`);

      let narrative = `Baseline demand is ${Math.round(pred.base_value)} units.`;
      if (topPositives.length > 0) narrative += ` Boosted by ${topPositives.join(', ')}.`;
      if (topNegatives.length > 0) narrative += ` Reduced by ${topNegatives.join(', ')}.`;

      return {
        productId: meta.productId,
        productName: meta.productName,
        category: meta.category,
        price: meta.price,
        historicalDemand: meta.historicalDemand,
        currentStock: meta.totalStock,
        predictedDemand: predictedDemand,
        baseValue: Math.round(pred.base_value),
        fefoStatus: {
          nearestBatch: meta.nearestBatch,
          expirationDate: meta.expirationDate,
          daysRemaining: meta.shelf_life_days
        },
        alerts: {
          stockoutWarning: isLowStock,
          restockQuantity: restockQuantity
        },
        explanationNarrative: narrative,
        explainability: {
          shapAttributions: pred.shap_attributions
        }
      };
    });

    res.json({
      status: 'success',
      scenario: { time_of_day, is_weekend },
      count: results.length,
      items: results
    });
  } catch (error) {
    console.error('Error handling catalog forecast:', error.message);
    res.status(500).json({ error: 'Failed to process catalog forecast', details: error.message });
  }
});

// 4. Role-Based Authentication (Manager & Admin)
app.post('/api/v1/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required.' });
  }

  const u = username.toLowerCase().trim();
  if ((u === 'admin' || u === 'admin@project.local' || u === 'admin@zepto.internal') && password === 'admin123') {
    return res.json({
      success: true,
      user: {
        id: 'usr_admin_01',
        name: 'Alex Rivera',
        email: 'admin@project.local',
        role: 'admin',
        title: 'ML Systems & Platform Admin',
        avatar: '⚙️'
      },
      token: 'jwt_admin_session_token_99'
    });
  }

  if ((u === 'manager' || u === 'manager@project.local' || u === 'manager@zepto.internal') && password === 'manager123') {
    return res.json({
      success: true,
      user: {
        id: 'usr_mgr_01',
        name: 'Sarah Chen',
        email: 'manager@project.local',
        role: 'manager',
        title: 'Store Operations & Inventory Manager',
        avatar: '👤'
      },
      token: 'jwt_manager_session_token_88'
    });
  }

  return res.status(401).json({ error: 'Invalid credentials. Use admin/admin123 or manager/manager123.' });
});

// 5. Admin System Telemetry & Model Monitoring
app.get('/api/v1/admin/telemetry', async (req, res) => {
  try {
    let mlInfo = null;
    try {
      const mlRes = await axios.get('http://127.0.0.1:8000/admin/model-info', { timeout: 3000 });
      mlInfo = mlRes.data;
    } catch (e) {
      try {
        const mlRes = await axios.get('http://localhost:8000/admin/model-info', { timeout: 3000 });
        mlInfo = mlRes.data;
      } catch (err2) {
        mlInfo = { status: 'offline', error: err2.message };
      }
    }

    const isMongo = mongoose.connection.readyState === 1;
    let totalBatchesCount = initialBatches.length;
    if (isMongo) {
      try {
        totalBatchesCount = await InventoryBatch.countDocuments();
      } catch (e) {}
    }

    res.json({
      status: 'healthy',
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      },
      database: {
        type: 'MongoDB',
        status: isMongo ? 'Connected (Production)' : 'Offline In-Memory Resilient Fallback',
        totalBatches: totalBatchesCount
      },
      mlMicroservice: mlInfo
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch telemetry', details: error.message });
  }
});

// 6. Admin Retraining Trigger & Hyperparameter Tuning
app.post('/api/v1/admin/retrain', async (req, res) => {
  try {
    const payload = req.body || {};
    let mlRes;
    try {
      mlRes = await axios.post('http://127.0.0.1:8000/admin/retrain', payload, { timeout: 60000 });
    } catch (e) {
      mlRes = await axios.post('http://localhost:8000/admin/retrain', payload, { timeout: 60000 });
    }
    res.json(mlRes.data);
  } catch (error) {
    res.status(500).json({ error: 'Retraining failed', details: error.message });
  }
});

// 7. Admin Batches Management (List / Add)
app.get('/api/v1/admin/batches', async (req, res) => {
  try {
    let batches = [];
    if (mongoose.connection.readyState === 1) {
      batches = await InventoryBatch.find().sort({ expirationDate: 1 });
    } else {
      batches = initialBatches.slice().sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));
    }
    res.json({ count: batches.length, batches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve batches', details: err.message });
  }
});

app.post('/api/v1/admin/batches', async (req, res) => {
  try {
    const { productId, productName, category, batchNumber, quantity, price, expirationDays = 7 } = req.body;
    if (!productId || !batchNumber || !quantity) {
      return res.status(400).json({ error: 'Missing required batch fields (productId, batchNumber, quantity)' });
    }

    const expDate = new Date(Date.now() + parseInt(expirationDays, 10) * 24 * 60 * 60 * 1000);
    const newBatch = {
      productId,
      productName: productName || productId,
      category: category || 'Dairy',
      batchNumber,
      quantity: parseInt(quantity, 10),
      price: parseFloat(price || 10.0),
      expirationDate: expDate
    };

    if (mongoose.connection.readyState === 1) {
      await InventoryBatch.create(newBatch);
    } else {
      initialBatches.unshift(newBatch);
    }

    res.json({ success: true, message: 'Batch added successfully', batch: newBatch });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create batch', details: err.message });
  }
});

app.listen(5000, '0.0.0.0', () => console.log('🚀 Express Backend active on http://localhost:5000'));
