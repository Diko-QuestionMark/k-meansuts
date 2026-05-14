const CLUSTER_COLORS = [
    '#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e',
    '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'
];

const CLUSTER_COLORS_RGBA = CLUSTER_COLORS.map(hex => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
});
let currentData = null;
let clusterResult = null;
let elbowData = null;
let scatterChart = null;
let elbowChart = null;

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = '0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) {
        btn.classList.add('loading');
        btn.disabled = true;
    } else {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

async function loadData() {
    try {
        const response = await fetch('/api/data');
        currentData = await response.json();
        updateDataPreview();
        updateStats();
    } catch (err) {
        showToast('Gagal memuat data: ' + err.message, 'error');
    }
}

function updateDataPreview() {
    if (!currentData) return;
    const tbody = document.getElementById('dataPreviewBody');
    if (!tbody) return;

    const rows = currentData.data;
    tbody.innerHTML = rows.map(row => `
        <tr>
            <td>${row['CustomerID']}</td>
            <td>${row['Gender']}</td>
            <td>${row['Age']}</td>
            <td>${row['Annual Income (k$)']}</td>
            <td>${row['Spending Score (1-100)']}</td>
        </tr>
    `).join('');
}

function updateStats() {
    if (!currentData) return;
    document.getElementById('statRows').textContent = currentData.total_rows;

    const numCols = currentData.numeric_columns.length;
    document.getElementById('statFeatures').textContent = numCols;
}

async function runClustering() {
    const featureX = document.getElementById('featureX').value;
    const featureY = document.getElementById('featureY').value;
    const k = parseInt(document.getElementById('kSlider').value);
    const maxIter = parseInt(document.getElementById('maxIter').value);
    const useScaling = document.getElementById('useScaling').checked;

    if (featureX === featureY) {
        showToast('Pilih dua fitur yang berbeda!', 'error');
        return;
    }

    setLoading('btnRun', true);

    try {
        const response = await fetch('/api/cluster', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                feature_x: featureX,
                feature_y: featureY,
                k: k,
                max_iter: maxIter,
                use_scaling: useScaling
            })
        });

        clusterResult = await response.json();

        if (clusterResult.success) {
            drawScatterChart();
            updateClusterStats();
            updateResultInfo();
            showToast(`Clustering selesai! ${k} cluster, ${clusterResult.iterations} iterasi`, 'success');
        } else {
            showToast('Error pada clustering', 'error');
        }
    } catch (err) {
        showToast('Gagal menjalankan clustering: ' + err.message, 'error');
    } finally {
        setLoading('btnRun', false);
    }
}

async function runElbow() {
    const featureX = document.getElementById('featureX').value;
    const featureY = document.getElementById('featureY').value;
    const useScaling = document.getElementById('useScaling').checked;

    if (featureX === featureY) {
        showToast('Pilih dua fitur yang berbeda!', 'error');
        return;
    }

    setLoading('btnElbow', true);

    try {
        const response = await fetch('/api/elbow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                feature_x: featureX,
                feature_y: featureY,
                max_k: 10,
                use_scaling: useScaling
            })
        });

        const result = await response.json();

        if (result.success) {
            elbowData = result.elbow_data;
            drawElbowChart();
            showToast('Elbow Method selesai dihitung!', 'success');
        }
    } catch (err) {
        showToast('Gagal menghitung Elbow: ' + err.message, 'error');
    } finally {
        setLoading('btnElbow', false);
    }
}

function drawScatterChart() {
    if (!clusterResult) return;

    const canvas = document.getElementById('scatterCanvas');
    const container = canvas.parentElement;
    const placeholder = document.getElementById('scatterPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
    canvas.style.display = 'block';
    const width = container.clientWidth;
    const height = Math.max(450, width * 0.55);
    canvas.width = width * 2; // retina
    canvas.height = height * 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const padding = { top: 40, right: 40, bottom: 60, left: 70 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const points = clusterResult.points;
    const centroids = clusterResult.centroids;
    const xValues = points.map(p => p.x);
    const yValues = points.map(p => p.y);
    const xMin = Math.min(...xValues) - 5;
    const xMax = Math.max(...xValues) + 5;
    const yMin = Math.min(...yValues) - 5;
    const yMax = Math.max(...yValues) + 5;

    const scaleX = (v) => padding.left + ((v - xMin) / (xMax - xMin)) * chartW;
    const scaleY = (v) => padding.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(10, 14, 26, 0.9)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.08)';
    ctx.lineWidth = 1;
    const xTicks = 8;
    const yTicks = 6;

    for (let i = 0; i <= xTicks; i++) {
        const val = xMin + (xMax - xMin) * (i / xTicks);
        const x = scaleX(val);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, padding.top + chartH);
        ctx.stroke();

        ctx.fillStyle = 'rgba(136, 146, 176, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(val), x, height - padding.bottom + 20);
    }

    for (let i = 0; i <= yTicks; i++) {
        const val = yMin + (yMax - yMin) * (i / yTicks);
        const y = scaleY(val);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(136, 146, 176, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(val), padding.left - 10, y + 4);
    }
    ctx.fillStyle = 'rgba(136, 146, 176, 0.9)';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(clusterResult.feature_x, width / 2, height - 8);

    ctx.save();
    ctx.translate(16, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(clusterResult.feature_y, 0, 0);
    ctx.restore();
    points.forEach(p => {
        const x = scaleX(p.x);
        const y = scaleY(p.y);
        const color = CLUSTER_COLORS_RGBA[p.cluster % CLUSTER_COLORS_RGBA.length];
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.15)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.85)`;
        ctx.fill();
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });
    centroids.forEach((c, i) => {
        const x = scaleX(c.x);
        const y = scaleY(c.y);
        const color = CLUSTER_COLORS_RGBA[i % CLUSTER_COLORS_RGBA.length];
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.1)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.5)`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
        ctx.fillStyle = 'white';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`C${i + 1}`, x, y - 22);
    });
    ctx.fillStyle = 'rgba(232, 234, 246, 0.9)';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`K-Means Clustering (K=${clusterResult.k})`, width / 2, 24);
    updateLegend();
}

function updateLegend() {
    if (!clusterResult) return;
    const container = document.getElementById('clusterLegend');
    if (!container) return;

    container.innerHTML = clusterResult.cluster_stats.map((cs, i) => `
        <div class="legend-item">
            <span class="legend-dot" style="background:${CLUSTER_COLORS[i]}"></span>
            Cluster ${i + 1} (${cs.size})
        </div>
    `).join('');
}

function drawElbowChart() {
    if (!elbowData || elbowData.length === 0) return;

    const canvas = document.getElementById('elbowCanvas');
    const container = canvas.parentElement;
    const placeholder = document.getElementById('elbowPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
    canvas.style.display = 'block';

    const width = container.clientWidth;
    const height = Math.max(350, width * 0.5);
    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    const padding = { top: 40, right: 40, bottom: 55, left: 80 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const kValues = elbowData.map(d => d.k);
    const wcssValues = elbowData.map(d => d.wcss);
    const maxWCSS = Math.max(...wcssValues) * 1.05;
    const minWCSS = 0;

    const scaleX = (k) => padding.left + ((k - 1) / (kValues.length - 1)) * chartW;
    const scaleY = (w) => padding.top + chartH - ((w - minWCSS) / (maxWCSS - minWCSS)) * chartH;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(10, 14, 26, 0.9)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(124, 58, 237, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
        const val = minWCSS + (maxWCSS - minWCSS) * (i / 5);
        const y = scaleY(val);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = 'rgba(136, 146, 176, 0.6)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(val).toLocaleString(), padding.left - 10, y + 4);
    }
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.15)');
    gradient.addColorStop(1, 'rgba(124, 58, 237, 0.01)');

    ctx.beginPath();
    ctx.moveTo(scaleX(kValues[0]), scaleY(wcssValues[0]));
    for (let i = 1; i < kValues.length; i++) {
        ctx.lineTo(scaleX(kValues[i]), scaleY(wcssValues[i]));
    }
    ctx.lineTo(scaleX(kValues[kValues.length - 1]), padding.top + chartH);
    ctx.lineTo(scaleX(kValues[0]), padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(scaleX(kValues[0]), scaleY(wcssValues[0]));
    for (let i = 1; i < kValues.length; i++) {
        ctx.lineTo(scaleX(kValues[i]), scaleY(wcssValues[i]));
    }
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    kValues.forEach((k, i) => {
        const x = scaleX(k);
        const y = scaleY(wcssValues[i]);
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(124, 58, 237, 0.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#a78bfa';
        ctx.fill();
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(136, 146, 176, 0.8)';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`K=${k}`, x, padding.top + chartH + 20);
    });
    ctx.fillStyle = 'rgba(136, 146, 176, 0.9)';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Jumlah Cluster (K)', width / 2, height - 8);

    ctx.save();
    ctx.translate(16, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('WCSS (Within-Cluster Sum of Squares)', 0, 0);
    ctx.restore();
    ctx.fillStyle = 'rgba(232, 234, 246, 0.9)';
    ctx.font = 'bold 15px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Elbow Method - Optimal K', width / 2, 24);
}

function updateClusterStats() {
    if (!clusterResult) return;
    const tbody = document.getElementById('clusterStatsBody');
    if (!tbody) return;

    tbody.innerHTML = clusterResult.cluster_stats.map((cs, i) => `
        <tr>
            <td>
                <span class="cluster-dot" style="background:${CLUSTER_COLORS[i]}"></span>
                Cluster ${i + 1}
            </td>
            <td>${cs.size}</td>
            <td>${cs.centroid_x.toFixed(2)}</td>
            <td>${cs.centroid_y.toFixed(2)}</td>
            <td>${cs.wcss.toLocaleString()}</td>
        </tr>
    `).join('');
    document.getElementById('statsSection').style.display = 'block';
}

function updateResultInfo() {
    if (!clusterResult) return;

    document.getElementById('resultK').textContent = clusterResult.k;
    document.getElementById('resultIter').textContent = clusterResult.iterations;
    document.getElementById('resultWCSS').textContent = clusterResult.total_wcss.toLocaleString();
    document.getElementById('resultFeatureX').textContent = clusterResult.feature_x;
    document.getElementById('resultFeatureY').textContent = clusterResult.feature_y;

    document.getElementById('resultInfo').style.display = 'block';
}

function updateKValue(val) {
    document.getElementById('kValue').textContent = val;
}

function resetAll() {
    clusterResult = null;
    elbowData = null;
    const scatterCanvas = document.getElementById('scatterCanvas');
    const scatterPlaceholder = document.getElementById('scatterPlaceholder');
    if (scatterCanvas) scatterCanvas.style.display = 'none';
    if (scatterPlaceholder) scatterPlaceholder.style.display = 'flex';
    const elbowCanvas = document.getElementById('elbowCanvas');
    const elbowPlaceholder = document.getElementById('elbowPlaceholder');
    if (elbowCanvas) elbowCanvas.style.display = 'none';
    if (elbowPlaceholder) elbowPlaceholder.style.display = 'flex';
    const statsSection = document.getElementById('statsSection');
    if (statsSection) statsSection.style.display = 'none';

    const resultInfo = document.getElementById('resultInfo');
    if (resultInfo) resultInfo.style.display = 'none';
    const legend = document.getElementById('clusterLegend');
    if (legend) legend.innerHTML = '';

    showToast('Reset berhasil!', 'info');
}

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (clusterResult) drawScatterChart();
        if (elbowData) drawElbowChart();
    }, 200);
});

document.addEventListener('DOMContentLoaded', () => {
    loadData();
});
