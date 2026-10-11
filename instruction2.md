# TASK SPECIFICATION: Smart Inventory Forecasting & XAI Pipeline

## 1. Executive Summary & Objective

Implement a full-stack, end-to-end Explainable AI (XAI) Quick-Commerce Inventory Forecasting system inside `D:\clg\final-year\project`.

The system must:

1. Support Blinkit/Zepto product categories (e.g., Dairy, Produce, Snacks, Beverages, Meat) and individual product SKUs.
2. Accept batch CSV uploads of warehouse data as well as single-product queries.
3. Train an XGBoost Regressor to forecast exact integer units of demand.
4. Integrate SHAP (SHapley Additive exPlanations) to provide feature-level and category-level impact attributions.
5. Enforce First-Expiring-First-Out (FEFO) stock logic backed by MongoDB.
6. Display rounded integer predictions and visual SHAP plots on a dark-themed dashboard UI.

## 2. Directory Architecture & Environment Setup

Target workspace root: `D:\clg\final-year\project`

```text
D:\clg\final-year\project\
├── venv\
├── ml_service\
│   ├── artifacts\
│   │   ├── quick_commerce_demand.csv
│   │   ├── xgboost_model.pkl
│   │   └── shap_explainer.pkl
│   ├── generate_data.py
│   ├── train_and_export.py
│   ├── predict_server.py
│   └── requirements.txt
├── backend\
│   ├── models\
│   │   └── InventoryBatch.js
│   ├── uploads\
│   ├── package.json
│   └── server.js
└── frontend\
    └── index.html
```

### Environment Initialization Requirements

- Python Virtual Environment: `python -m venv venv`
- Activate script and install dependencies from `ml_service/requirements.txt`:
  `xgboost`, `shap`, `pandas`, `numpy`, `joblib`, `fastapi`, `uvicorn`, `pydantic`, `python-multipart`
- Node.js dependencies in `backend/`:
  `express`, `mongoose`, `axios`, `cors`, `multer`, `csv-parser`

## 3. Data Generation Module (`ml_service/generate_data.py`)

Generate a synthetic dataset capturing Blinkit and Zepto product catalogs, categories, pricing, shelf-life, time-of-day, and demand metrics.

```python
import pandas as pd
import numpy as np
import os

def generate_quick_commerce_data(n_samples=5000):
    np.random.seed(42)

    categories = ['Dairy', 'Produce', 'Snacks', 'Beverages', 'Meat']
    products_by_cat = {
        'Dairy': ['Dairy_Milk_1L', 'Dairy_Paneer_200g', 'Dairy_Curd_500g'],
        'Produce': ['Produce_Tomatoes_500g', 'Produce_Onions_1kg', 'Produce_Bananas_1dz'],
        'Snacks': ['Snacks_Chips_100g', 'Snacks_Biscuits_200g'],
        'Beverages': ['Beverages_ColdDrink_2L', 'Beverages_Juice_1L'],
        'Meat': ['Meat_Chicken_500g', 'Meat_Eggs_6pack']
    }

    cat_list = np.random.choice(categories, n_samples)
    prod_list = [np.random.choice(products_by_cat[c]) for c in cat_list]

    time_of_day = np.random.randint(0, 24, n_samples)
    price = np.round(np.random.uniform(5.0, 50.0, n_samples), 2)
    shelf_life_days = np.random.randint(1, 15, n_samples)
    historical_demand = np.random.randint(20, 300, n_samples)
    is_weekend = np.random.choice([0, 1], p=[0.71, 0.29], size=n_samples)

    cat_multipliers = {'Dairy': 1.2, 'Produce': 1.5, 'Snacks': 0.8, 'Beverages': 1.0, 'Meat': 0.9}
    mult_array = np.array([cat_multipliers[c] for c in cat_list])

    peak_hour_boost = np.where((time_of_day >= 18) & (time_of_day <= 21), 45,
                       np.where((time_of_day >= 12) & (time_of_day <= 14), 25, 0))

    demand = (
        (historical_demand * 0.5 * mult_array) +
        peak_hour_boost +
        (is_weekend * 25) -
        (price * 0.8) -
        ((15 - shelf_life_days) * 0.5) +
        np.random.normal(0, 5, n_samples)
    )

    df = pd.DataFrame({
        'category': cat_list,
        'product_id': prod_list,
        'time_of_day': time_of_day,
        'price': price,
        'shelf_life_days': shelf_life_days,
        'historical_demand': historical_demand,
        'is_weekend': is_weekend,
        'demand': np.maximum(0, np.round(demand)).astype(int)
    })

    os.makedirs('artifacts', exist_ok=True)
    df.to_csv('artifacts/quick_commerce_demand.csv', index=False)
    print("✅ Generated dataset: artifacts/quick_commerce_demand.csv")

if __name__ == "__main__":
    generate_quick_commerce_data()
```

## 4. Model Training & Export (`ml_service/train_and_export.py`)

1. Load dataset from `artifacts/quick_commerce_demand.csv`.
2. Apply One-Hot Encoding via `pd.get_dummies()` for `category` and `product_id`.
3. Train `xgb.XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.05, random_state=42)`.
4. Train `shap.TreeExplainer(model)`.
5. Export trained model, explainer, and feature column list to `artifacts/` via `joblib`.

## 5. Inference Microservice (`ml_service/predict_server.py`)

FastAPI app running on port 8000 handling single predictions and batch array payloads.

### Rules

- Round all `predicted_demand` outputs to whole integers using `int(np.round(...))`.
- Parse incoming `category` and `product_id` strings and align them with one-hot feature columns.
- Compute local SHAP attribution values for all features (including categorical features).

Endpoints:

- `POST /predict`: Handles single item payload.
- `POST /predict-batch`: Accepts a list of item objects and returns array of integer predictions + SHAP explanations.

## 6. Express Backend & FEFO Gateway (`backend/server.js`)

Node.js/Express server running on port 5000 connected to MongoDB (`mongodb://localhost:27017/smart_inventory`).

### Requirements

1. `backend/models/InventoryBatch.js`:
   Mongoose schema with `productId`, `productName`, `category`, `batchNumber`, `quantity`, `price`, `expirationDate`.
2. `POST /api/v1/forecast-and-stock`:
   - Single item endpoint.
   - Sorts MongoDB inventory batches by `expirationDate: 1` (FEFO).
   - Queries FastAPI `http://localhost:8000/predict`.
   - Returns rounded integer values for stock and predicted demand.
3. `POST /api/v1/forecast-batch`:
   - Uses `multer` to handle uploaded CSV files (`warehouseData`).
   - Parses CSV using `csv-parser`.
   - Sends batch records to FastAPI `http://localhost:8000/predict-batch`.
   - Returns processed array with integer demand predictions and FEFO alerts.

## 7. Frontend Dashboard (`frontend/index.html`)

Dark-themed responsive dashboard using Chart.js.

### UI Specs

- Mode 1 (Single Forecast): Form inputs for `Category`, `Product ID`, `Time of Day`, `Price`, `Historical Demand`, `Is Weekend`.
- Mode 2 (Batch CSV Upload): CSV File input for uploading full dark store inventory reports.
- Display cards:
  - Current Stock (Integer units).
  - Predicted Demand (Integer units — NO floating decimals!).
  - Nearest Expiring Batch (FEFO ID & days remaining).
  - Restock Alert box showing stockout deficits.
- Charts:
  - Bar chart comparing Inventory Stock vs. XGBoost Predicted Demand.
  - Horizontal Bar chart displaying SHAP feature attributions (green for positive contribution, orange for negative).

## 8. Verification & Test Script

Run these tasks sequentially to verify end-to-end execution:

1. `cd ml_service && python generate_data.py && python train_and_export.py`
2. Start FastAPI server: `python predict_server.py`
3. Start Express server: `cd ../backend && node server.js`
4. Test API batch response:

```bash
curl -X POST http://localhost:5000/api/v1/forecast-and-stock \
  -H "Content-Type: application/json" \
  -d "{\"productId\":\"Dairy_Milk_1L\",\"category\":\"Dairy\",\"time_of_day\":19,\"price\":14.5,\"historical_demand\":140,\"is_weekend\":1}"
```

5. Confirm that all returned demand numbers are whole integers.

---

### How to use this with Antigravity / Agent

1. Save the block above as `INSTRUCTIONS.md` inside `D:\clg\final-year\project\`.
2. Open your AI agent terminal/workspace in `D:\clg\final-year\project`.
3. Give the prompt: `"Read INSTRUCTIONS.md and build the complete project end-to-end."`
4. Go focus on your TCS CodeVita practice while the agent generates, tests, and connects the full stack.
