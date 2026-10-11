import os
import sys
import joblib
import pandas as pd
import shap
import xgboost as xgb

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def train_model():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    artifacts_dir = 'artifacts' if os.path.exists('artifacts') else os.path.join(script_dir, 'artifacts')
    data_path = os.path.join(artifacts_dir, 'quick_commerce_demand.csv')

    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Dataset not found at {data_path}! Run generate_data.py first.")

    df = pd.read_csv(data_path)
    X = df.drop(columns=['demand'])
    y = df['demand']

    # Apply One-Hot Encoding for categorical features
    X_encoded = pd.get_dummies(X, columns=['category', 'product_id'], dtype=float)
    feature_columns = list(X_encoded.columns)

    # Train XGBoost Regressor
    model = xgb.XGBRegressor(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.05,
        random_state=42
    )
    model.fit(X_encoded, y)

    # Train SHAP TreeExplainer
    explainer = shap.TreeExplainer(model)

    # Save artifacts
    os.makedirs(artifacts_dir, exist_ok=True)
    joblib.dump(model, os.path.join(artifacts_dir, 'xgboost_model.pkl'))
    joblib.dump(explainer, os.path.join(artifacts_dir, 'shap_explainer.pkl'))
    joblib.dump(feature_columns, os.path.join(artifacts_dir, 'feature_columns.pkl'))

    print(f"[SUCCESS] XGBoost model, SHAP Explainer & {len(feature_columns)} feature columns saved in {artifacts_dir}")

if __name__ == "__main__":
    train_model()
