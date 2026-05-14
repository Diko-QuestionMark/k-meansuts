from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import json
import os

app = Flask(__name__)
def load_data():
    
    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Mall_Customers.csv')
    df = pd.read_csv(csv_path)
    return df
@app.route('/')
def index():
    
    df = load_data()
    columns = df.columns.tolist()
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    preview = df.to_dict(orient='records')
    
    return render_template('index.html', 
                           columns=columns,
                           numeric_cols=numeric_cols,
                           preview=preview,
                           total_rows=len(df))
@app.route('/api/data', methods=['GET'])
def get_data():
    
    df = load_data()
    return jsonify({
        'columns': df.columns.tolist(),
        'numeric_columns': df.select_dtypes(include=[np.number]).columns.tolist(),
        'data': df.to_dict(orient='records'),
        'total_rows': len(df),
        'stats': {
            col: {
                'min': float(df[col].min()),
                'max': float(df[col].max()),
                'mean': float(df[col].mean()),
                'std': float(df[col].std())
            } for col in df.select_dtypes(include=[np.number]).columns
        }
    })
@app.route('/api/cluster', methods=['POST'])
def run_clustering():
    
    data = request.get_json()
    feature_x = data.get('feature_x', 'Annual Income (k$)')
    feature_y = data.get('feature_y', 'Spending Score (1-100)')
    k = int(data.get('k', 5))
    max_iter = int(data.get('max_iter', 300))
    use_scaling = data.get('use_scaling', False)
    
    df = load_data()
    X = df[[feature_x, feature_y]].values
    scaler = None
    X_scaled = X.copy()
    if use_scaling:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
    kmeans = KMeans(n_clusters=k, max_iter=max_iter, n_init=10, random_state=42)
    labels = kmeans.fit_predict(X_scaled)
    centroids = kmeans.cluster_centers_
    if use_scaling and scaler is not None:
        centroids = scaler.inverse_transform(centroids)
    cluster_stats = []
    for i in range(k):
        mask = labels == i
        cluster_points = X[mask]
        centroid = centroids[i]
        wcss = float(np.sum((cluster_points - centroid) ** 2))
        
        cluster_stats.append({
            'cluster_id': i,
            'size': int(np.sum(mask)),
            'centroid_x': float(centroid[0]),
            'centroid_y': float(centroid[1]),
            'wcss': round(wcss, 2),
            'mean_x': float(cluster_points[:, 0].mean()) if len(cluster_points) > 0 else 0,
            'mean_y': float(cluster_points[:, 1].mean()) if len(cluster_points) > 0 else 0,
        })
    points = []
    for i in range(len(X)):
        points.append({
            'x': float(X[i][0]),
            'y': float(X[i][1]),
            'cluster': int(labels[i]),
            'customer_id': int(df.iloc[i]['CustomerID']),
            'gender': df.iloc[i]['Gender'],
            'age': int(df.iloc[i]['Age'])
        })
    
    return jsonify({
        'success': True,
        'k': k,
        'feature_x': feature_x,
        'feature_y': feature_y,
        'total_wcss': round(float(kmeans.inertia_), 2) if not use_scaling else round(float(np.sum([s['wcss'] for s in cluster_stats])), 2),
        'iterations': int(kmeans.n_iter_),
        'cluster_stats': cluster_stats,
        'points': points,
        'centroids': [{'x': float(c[0]), 'y': float(c[1])} for c in centroids]
    })
@app.route('/api/elbow', methods=['POST'])
def elbow_method():
    
    data = request.get_json()
    feature_x = data.get('feature_x', 'Annual Income (k$)')
    feature_y = data.get('feature_y', 'Spending Score (1-100)')
    max_k = int(data.get('max_k', 10))
    use_scaling = data.get('use_scaling', False)
    
    df = load_data()
    X = df[[feature_x, feature_y]].values
    
    if use_scaling:
        scaler = StandardScaler()
        X = scaler.fit_transform(X)
    
    wcss_values = []
    for k in range(1, max_k + 1):
        kmeans = KMeans(n_clusters=k, max_iter=300, n_init=10, random_state=42)
        kmeans.fit(X)
        wcss_values.append({
            'k': k,
            'wcss': round(float(kmeans.inertia_), 2)
        })
    
    return jsonify({
        'success': True,
        'feature_x': feature_x,
        'feature_y': feature_y,
        'elbow_data': wcss_values
    })
if __name__ == '__main__':
    print("=" * 60)
    print("  K-Means Clustering - Mall Customers Analysis")
    print("  Buka browser di: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(debug=True, port=5000)
