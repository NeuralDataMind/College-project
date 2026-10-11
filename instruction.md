# Project Instructions

---

## Complete Project Structure (`D:\clg\final-year\project`)

```text
D:\clg\final-year\project\
├── venv\                        <-- Python Virtual Environment
├── ml_service\                  <-- Machine Learning & XAI Microservice
│   ├── artifacts\               <-- Saved Model & SHAP Explainer
│   ├── generate_data.py         <-- Synthetic Time-Series Data Generator
│   ├── train_and_export.py      <-- XGBoost + TreeSHAP Training Pipeline
│   ├── predict_server.py        <-- FastAPI Inference Microservice
│   └── requirements.txt         <-- Python Dependencies
├── backend\                     <-- Node.js / Express REST API
│   ├── models\
│   │   └── InventoryBatch.js    <-- MongoDB FEFO Schema
│   ├── package.json
│   └── server.js                <-- Express REST Controller
└── frontend\                    <-- Presentation Layer
    └── index.html               <-- Dashboard UI (Chart.js + SHAP Plots)

```

---

## Phase 1: Environment Initialization & Setup

Execute these commands in your PowerShell or WSL terminal to build the workspace and initialize the virtual environment:

```powershell
# 1. Navigate to your project folder
cd D:\clg\final-year\project

# 2. Create the Python Virtual Environment
python -m venv venv

# 3. Activate the Virtual Environment
# PowerShell:
.\venv\Scripts\Activate.ps1
# CMD:
# .\venv\Scripts\activate.bat

# 4. Create Subdirectories
mkdir ml_service, ml_service\artifacts, backend, backend\models, frontend

```

---

## Phase 2: Python ML Service Files (`ml_service/`)

### 1. Dependencies File (`ml_service/requirements.txt`)

Create `D:\clg\final-year\project\ml_service\requirements.txt`:

```text
xgboost
shap
pandas
numpy
joblib
fastapi
uvicorn
pydantic

```

Install them inside your activated virtual environment:

```powershell
pip install -r ml_service/requirements.txt

```

### 2. Data Generation Script (`ml_service/generate_data.py`)

Create `D:\clg\final-year\project\ml_service\generate_data.py`:

```python
import pandas as pd
import numpy as np

def generate_quick_commerce_data(n_samples=5000):
    np.random.seed(42)
    
    time_of_day = np.random.randint(0, 24, n_samples)
    price = np.round(np.random.uniform(2.0, 30.0, n_samples), 2)
    shelf_life_days = np.random.randint(1, 15, n_samples)
    historical_demand = np.random.randint(20, 300, n_samples)
    is_weekend = np.random.choice([0, 1], p=[0.71, 0.29], size=n_samples)
    
    # Peak hour demand spikes (lunch: 12-14, evening: 18-21)
    peak_hour_boost = np.where((time_of_day >= 18) & (time_of_day <= 21), 45, 
                       np.where((time_of_day >= 12) & (time_of_day <= 14), 25, 0))
    
    # Demand logic formula with non-linear relationships
    demand = (
        historical_demand * 0.6 +
        peak_hour_boost +
        is_weekend * 30 -
        price * 1.5 -
        (15 - shelf_life_days) * 0.8 +
        np.random.normal(0, 8, n_samples)
    )
    
    df = pd.DataFrame({
        'time_of_day': time_of_day,
        'price': price,
        'shelf_life_days': shelf_life_days,
        'historical_demand': historical_demand,
        'is_weekend': is_weekend,
        'demand': np.maximum(0, np.round(demand)).astype(int)
    })
    
    df.to_csv('artifacts/quick_commerce_demand.csv', index=False)
    print("✅ 5,000 quick-commerce dataset samples generated at ml_service/artifacts/quick_commerce_demand.csv")

if __name__ == "__main__":
    generate_quick_commerce_data()

```

### 3. Model Training Pipeline (`ml_service/train_and_export.py`)

Create `D:\clg\final-year\project\ml_service\train_and_export.py`:

```python
import os
import joblib
import pandas as pd
import shap
import xgboost as xgb

def train_model():
    # Load dataset
    data_path = 'artifacts/quick_commerce_demand.csv'
    if not os.path.exists(data_path):
        raise FileNotFoundError("Dataset not found! Run generate_data.py first.")
    
    df = pd.read_csv(data_path)
    X = df.drop(columns=['demand'])
    y = df['demand']

    # Train XGBoost Regressor
    model = xgb.XGBRegressor(
        n_estimators=100, 
        max_depth=5, 
        learning_rate=0.05, 
        random_state=42
    )
    model.fit(X, y)

    # Train SHAP TreeExplainer
    explainer = shap.TreeExplainer(model)

    # Save artifacts
    joblib.dump(model, 'artifacts/xgboost_model.pkl')
    joblib.dump(explainer, 'artifacts/shap_explainer.pkl')

    print("✅ XGBoost model & SHAP Explainer successfully saved in artifacts/")

if __name__ == "__main__":
    train_model()

```

### 4. FastAPI Inference Microservice (`ml_service/predict_server.py`)

Create `D:\clg\final-year\project\ml_service\predict_server.py`:

```python
from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import pandas as pd
import numpy as np

app = FastAPI(title="XGBoost + SHAP Inference API")

model = joblib.load('artifacts/xgboost_model.pkl')
explainer = joblib.load('artifacts/shap_explainer.pkl')

class PredictionInput(BaseModel):
    time_of_day: int
    price: float
    shelf_life_days: int
    historical_demand: int
    is_weekend: int

@app.post("/predict")
def predict_demand(data: PredictionInput):
    input_df = pd.DataFrame([data.dict()])
    
    # 1. XGBoost Prediction
    raw_pred = model.predict(input_df)[0]
    predicted_demand = float(np.round(raw_pred, 2))
    
    # 2. Local SHAP Attribution Calculation
    shap_values = explainer(input_df)
    feature_impacts = dict(zip(input_df.columns, shap_values.values[0].tolist()))
    
    return {
        "predicted_demand": max(0.0, predicted_demand),
        "base_value": float(shap_values.base_values[0]),
        "shap_attributions": feature_impacts
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

```

---

## Phase 3: Backend Node.js & MongoDB FEFO Integration

### 1. Package Configuration (`backend/package.json`)

Create `D:\clg\final-year\project\backend\package.json`:

```json
{
  "name": "smart-inventory-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "mongoose": "^8.0.0"
  }
}

```

Run install inside `backend/`:

```powershell
cd D:\clg\final-year\project\backend
npm install

```

### 2. MongoDB FEFO Schema (`backend/models/InventoryBatch.js`)

Create `D:\clg\final-year\project\backend\models\InventoryBatch.js`:

```javascript
const mongoose = require('mongoose');

const InventoryBatchSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  batchNumber: { type: String, required: true, unique: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  expirationDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('InventoryBatch', InventoryBatchSchema);

```

### 3. REST API Gateway (`backend/server.js`)

Create `D:\clg\final-year\project\backend\server.js`:

```javascript
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const InventoryBatch = require('./models/InventoryBatch');

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect('mongodb://localhost:27017/smart_inventory')
  .then(() => console.log('✅ Connected to MongoDB (smart_inventory)'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

app.post('/api/v1/forecast-and-stock', async (req, res) => {
  try {
    const { productId, time_of_day, price, historical_demand, is_weekend } = req.body;

    // FEFO: Fetch batches sorted by earliest expiration date first
    const batches = await InventoryBatch.find({ productId }).sort({ expirationDate: 1 });
    
    const totalStock = batches.reduce((sum, b) => sum + b.quantity, 0);
    const nearestBatch = batches[0] || null;

    let shelf_life_days = 10;
    if (nearestBatch) {
      const diffTime = new Date(nearestBatch.expirationDate) - new Date();
      shelf_life_days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    // Call Python FastAPI ML microservice
    const mlResponse = await axios.post('http://localhost:8000/predict', {
      time_of_day,
      price,
      shelf_life_days,
      historical_demand,
      is_weekend
    });

    const { predicted_demand, shap_attributions } = mlResponse.data;
    const isLowStock = totalStock < predicted_demand;

    res.json({
      productId,
      currentStock: totalStock,
      predictedDemand: predicted_demand,
      fefoStatus: {
        nearestBatch: nearestBatch ? nearestBatch.batchNumber : "N/A",
        expirationDate: nearestBatch ? nearestBatch.expirationDate : "N/A",
        daysRemaining: shelf_life_days
      },
      alerts: {
        stockoutWarning: isLowStock,
        restockQuantity: isLowStock ? (predicted_demand - totalStock) : 0
      },
      explainability: {
        shapAttributions: shap_attributions
      }
    });

  } catch (error) {
    console.error('Error handling forecast:', error.message);
    res.status(500).json({ error: 'Failed to generate inventory forecast' });
  }
});

app.listen(5000, () => console.log('🚀 Express Backend active on http://localhost:5000'));

```

---

## Phase 4: Frontend UI Dashboard (`frontend/index.html`)

Create `D:\clg\final-year\project\frontend\index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Smart Inventory Forecasting Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 30px; background: #0f172a; color: #f8fafc; }
    .container { max-width: 1200px; margin: auto; }
    .grid { display: flex; gap: 20px; margin-top: 20px; }
    .card { background: #1e293b; padding: 20px; border-radius: 12px; flex: 1; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    button { background: #38bdf8; color: #0f172a; font-weight: bold; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; }
    button:hover { background: #0284c7; color: white; }
    .alert { padding: 15px; background: #f87171; color: #7f1d1d; font-weight: bold; margin-top: 20px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Smart Inventory Forecasting & FEFO Dashboard</h2>
    <button onclick="runForecast()">Run Real-time Intraday Forecast</button>
    
    <div id="alertBox" class="alert" style="display:none;"></div>

    <div class="grid">
      <div class="card">
        <h3>Stock Level vs XGBoost Demand Forecast</h3>
        <canvas id="demandChart"></canvas>
      </div>
      <div class="card">
        <h3>SHAP Feature Attributions (XAI Explanations)</h3>
        <canvas id="shapChart"></canvas>
      </div>
    </div>
  </div>

  <script>
    let demandChart, shapChart;

    async function runForecast() {
      const response = await fetch('http://localhost:5000/api/v1/forecast-and-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: "PROD_DAIRY_01",
          time_of_day: 19,
          price: 14.5,
          historical_demand: 140,
          is_weekend: 1
        })
      });

      const data = await response.json();

      // Handle Stock Alerts
      const alertBox = document.getElementById('alertBox');
      if (data.alerts.stockoutWarning) {
        alertBox.style.display = 'block';
        alertBox.innerText = `⚠️ RESTOCK ALERT: Current stock is below demand! Restock ${data.alerts.restockQuantity} units. Nearest batch (${data.fefoStatus.nearestBatch}) expires in ${data.fefoStatus.daysRemaining} days.`;
      } else {
        alertBox.style.display = 'none';
      }

      // Render Demand Comparison
      if (demandChart) demandChart.destroy();
      demandChart = new Chart(document.getElementById('demandChart'), {
        type: 'bar',
        data: {
          labels: ['Current Inventory Stock', 'XGBoost Predicted Demand'],
          datasets: [{
            data: [data.currentStock, data.predictedDemand],
            backgroundColor: ['#38bdf8', '#f43f5e']
          }]
        },
        options: { plugins: { legend: { display: false } } }
      });

      // Render SHAP Feature Impact
      const keys = Object.keys(data.explainability.shapAttributions);
      const values = Object.values(data.explainability.shapAttributions);

      if (shapChart) shapChart.destroy();
      shapChart = new Chart(document.getElementById('shapChart'), {
        type: 'bar',
        data: {
          labels: keys,
          datasets: [{
            label: 'SHAP Contribution Value',
            data: values,
            backgroundColor: values.map(v => v >= 0 ? '#34d399' : '#fb923c')
          }]
        },
        options: { indexAxis: 'y' }
      });
    }
  </script>
</body>
</html>

```

---

## Execution Command Checklist

Open three terminal windows inside `D:\clg\final-year\project` to start the live pipeline:

**Terminal 1 (Train & Start ML Server):**

```powershell
cd D:\clg\final-year\project
.\venv\Scripts\Activate.ps1
cd ml_service
python generate_data.py
python train_and_export.py
python predict_server.py

```

**Terminal 2 (Start Node.js Backend):**

```powershell
cd D:\clg\final-year\project\backend
node server.js

```

**Terminal 3 (Open Dashboard UI):**
Simply double-click `D:\clg\final-year\project\frontend\index.html` or open it directly in Chrome/Edge, then click **Run Real-time Intraday Forecast**.
