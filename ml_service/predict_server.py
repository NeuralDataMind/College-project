import os
import sys
import time
from typing import List, Optional, Union
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import pandas as pd
import numpy as np
import xgboost as xgb
import shap

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

app = FastAPI(title="Smart Quick-Commerce XGBoost + TreeSHAP Inference API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

script_dir = os.path.dirname(os.path.abspath(__file__))
artifacts_dir = 'artifacts' if os.path.exists('artifacts/xgboost_model.pkl') else os.path.join(script_dir, 'artifacts')

# Load saved artifacts
model = joblib.load(os.path.join(artifacts_dir, 'xgboost_model.pkl'))
explainer = joblib.load(os.path.join(artifacts_dir, 'shap_explainer.pkl'))
feature_columns = joblib.load(os.path.join(artifacts_dir, 'feature_columns.pkl'))

# Telemetry state
server_start_time = time.time()
request_counter = 0
latency_history = []
last_retrain_time = time.time()
current_params = {
    "n_estimators": 100,
    "max_depth": 5,
    "learning_rate": 0.05,
    "random_state": 42
}

class PredictionItem(BaseModel):
    category: Optional[str] = "Dairy"
    product_id: Optional[str] = None
    productId: Optional[str] = None
    time_of_day: int = 19
    price: float = 14.5
    shelf_life_days: int = 10
    historical_demand: int = 140
    is_weekend: int = 1

class RetrainRequest(BaseModel):
    n_estimators: Optional[int] = 100
    max_depth: Optional[int] = 5
    learning_rate: Optional[float] = 0.05
    n_samples: Optional[int] = 5000

def run_inference_batch(items: List[PredictionItem]):
    global request_counter, latency_history
    start_t = time.time()

    if not items:
        return []

    records = []
    for item in items:
        pid = item.product_id or item.productId or "Dairy_Milk_1L"
        cat = item.category or "Dairy"
        records.append({
            'category': cat,
            'product_id': pid,
            'time_of_day': int(item.time_of_day),
            'price': float(item.price),
            'shelf_life_days': int(item.shelf_life_days),
            'historical_demand': int(item.historical_demand),
            'is_weekend': int(item.is_weekend)
        })

    raw_df = pd.DataFrame(records)
    
    # One-hot encode category & product_id
    encoded_df = pd.get_dummies(raw_df, columns=['category', 'product_id'], dtype=float)
    
    # Reindex columns to match exact trained feature columns
    aligned_df = encoded_df.reindex(columns=feature_columns, fill_value=0.0)

    # 1. XGBoost Inference (Strictly integer demand output)
    preds = model.predict(aligned_df)
    
    # 2. Local TreeSHAP Explainability Calculation
    shap_results = explainer(aligned_df)

    output = []
    for idx in range(len(records)):
        pred_int = int(max(0, np.round(preds[idx])))
        base_val = float(shap_results.base_values[idx])
        
        all_attributions = {
            col: round(float(val), 3)
            for col, val in zip(feature_columns, shap_results.values[idx])
        }

        output.append({
            "category": records[idx]['category'],
            "product_id": records[idx]['product_id'],
            "productId": records[idx]['product_id'],
            "predicted_demand": pred_int,
            "base_value": round(base_val, 2),
            "shap_attributions": all_attributions
        })

    elapsed_ms = (time.time() - start_t) * 1000
    request_counter += len(items)
    latency_history.append(elapsed_ms)
    if len(latency_history) > 100:
        latency_history.pop(0)

    return output

@app.post("/predict")
def predict_single(item: PredictionItem):
    results = run_inference_batch([item])
    if not results:
        raise HTTPException(status_code=400, detail="Invalid payload")
    return results[0]

@app.post("/predict-batch")
def predict_batch(items: List[PredictionItem]):
    return run_inference_batch(items)

@app.get("/health")
@app.get("/admin/model-info")
def get_model_info():
    avg_latency = round(np.mean(latency_history), 2) if latency_history else 12.5
    uptime = int(time.time() - server_start_time)
    return {
        "status": "healthy",
        "engine": "XGBoost Regressor + TreeSHAP Engine",
        "version": xgb.__version__,
        "hyperparameters": current_params,
        "features_count": len(feature_columns),
        "feature_list": feature_columns,
        "total_requests_served": request_counter,
        "average_latency_ms": avg_latency,
        "uptime_seconds": uptime,
        "last_retrain_timestamp": last_retrain_time,
        "artifacts_directory": artifacts_dir
    }

@app.post("/admin/retrain")
def retrain_model_endpoint(req: RetrainRequest):
    global model, explainer, feature_columns, last_retrain_time, current_params
    start_t = time.time()

    data_path = os.path.join(artifacts_dir, 'quick_commerce_demand.csv')
    if not os.path.exists(data_path):
        raise HTTPException(status_code=404, detail="Dataset quick_commerce_demand.csv not found")

    df = pd.read_csv(data_path)
    X = df.drop(columns=['demand'])
    y = df['demand']

    X_encoded = pd.get_dummies(X, columns=['category', 'product_id'], dtype=float)
    new_feature_columns = list(X_encoded.columns)

    # Train with requested hyperparameters
    new_params = {
        "n_estimators": req.n_estimators or 100,
        "max_depth": req.max_depth or 5,
        "learning_rate": req.learning_rate or 0.05,
        "random_state": 42
    }

    new_model = xgb.XGBRegressor(**new_params)
    new_model.fit(X_encoded, y)

    # TreeSHAP explainer
    new_explainer = shap.TreeExplainer(new_model)

    # Persist artifacts
    joblib.dump(new_model, os.path.join(artifacts_dir, 'xgboost_model.pkl'))
    joblib.dump(new_explainer, os.path.join(artifacts_dir, 'shap_explainer.pkl'))
    joblib.dump(new_feature_columns, os.path.join(artifacts_dir, 'feature_columns.pkl'))

    # Hot-reload in memory
    model = new_model
    explainer = new_explainer
    feature_columns = new_feature_columns
    last_retrain_time = time.time()
    current_params = new_params

    duration_sec = round(time.time() - start_t, 2)

    return {
        "status": "success",
        "message": "Model retrained and hot-swapped in memory successfully without service downtime.",
        "duration_seconds": duration_sec,
        "new_hyperparameters": current_params,
        "features_count": len(feature_columns),
        "samples_trained": len(df)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
