import pandas as pd
import numpy as np
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

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

    script_dir = os.path.dirname(os.path.abspath(__file__))
    artifacts_dir = 'artifacts' if os.path.exists('artifacts') else os.path.join(script_dir, 'artifacts')
    os.makedirs(artifacts_dir, exist_ok=True)
    output_path = os.path.join(artifacts_dir, 'quick_commerce_demand.csv')

    df.to_csv(output_path, index=False)
    print(f"[SUCCESS] Generated dataset: {output_path}")

if __name__ == "__main__":
    generate_quick_commerce_data()
