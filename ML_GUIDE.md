# ML Pipeline Guide — Aura Presentation Mentor

This document describes the exact steps to build, train, and deploy three ML components for the body language analysis system.

---

## Prerequisites

```bash
pip install tensorflow numpy scikit-learn pandas matplotlib
npm install @tensorflow/tfjs  # In the client/ directory
```

---

## 1. Gesture Classification Model

**Goal:** Classify each frame's hand position into a gesture type (open-palm, pointing, fidgeting, resting, illustrative).

### Step 1: Collect Training Data

1. Open the profiler at `http://localhost:3000/profiler`
2. Instead of TED videos, record yourself performing each gesture type for ~60 seconds each
3. While recording, press a hotkey to label the current gesture class

We need a **data export** from the profiler. The raw data format per frame is:

```json
{
  "label": "open_palm",
  "landmarks": [
    { "x": 0.52, "y": 0.31, "z": -0.02, "visibility": 0.99 },
    ...  // 33 pose landmarks
  ]
}
```

**Concrete steps to build the collector:**

1. Add a `/collector` page (or extend `/profiler`) with 5 buttons: `Open Palm`, `Pointing`, `Fidgeting`, `Resting`, `Illustrative`
2. While a button is held, every frame's 33 pose landmarks get saved to an array with that label
3. Add an "Export Dataset" button that downloads a `gesture_dataset.json`
4. **Target: ~100 samples per class = 500 total.** At 10 frames/sec, that's ~10 seconds of holding each button × a few angles/positions

### Step 2: Prepare the Dataset

Create a Python script `ml/prepare_gestures.py`:

```python
import json
import numpy as np
from sklearn.model_selection import train_test_split

# Load the exported dataset
with open('gesture_dataset.json') as f:
    data = json.load(f)

# Flatten landmarks into a feature vector
# 33 landmarks × 4 values (x, y, z, visibility) = 132 features
X = []
y = []
labels = ['open_palm', 'pointing', 'fidgeting', 'resting', 'illustrative']

for sample in data:
    landmarks = sample['landmarks']
    # Normalize: subtract hip center (landmark 23/24 midpoint)
    hip_center_x = (landmarks[23]['x'] + landmarks[24]['x']) / 2
    hip_center_y = (landmarks[23]['y'] + landmarks[24]['y']) / 2

    features = []
    for lm in landmarks:
        features.extend([
            lm['x'] - hip_center_x,  # Relative to hip
            lm['y'] - hip_center_y,
            lm['z'],
            lm.get('visibility', 1.0)
        ])
    X.append(features)
    y.append(labels.index(sample['label']))

X = np.array(X)
y = np.array(y)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
np.savez('gesture_data.npz', X_train=X_train, X_test=X_test, y_train=y_train, y_test=y_test)
print(f"Dataset: {len(X_train)} train, {len(X_test)} test samples")
```

### Step 3: Train the Model

Create `ml/train_gesture_model.py`:

```python
import numpy as np
import tensorflow as tf

data = np.load('gesture_data.npz')
X_train, X_test = data['X_train'], data['X_test']
y_train, y_test = data['y_train'], data['y_test']

NUM_CLASSES = 5

model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(132,)),
    tf.keras.layers.Dense(64, activation='relu'),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(32, activation='relu'),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(NUM_CLASSES, activation='softmax')
])

model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])
model.fit(X_train, y_train, epochs=50, batch_size=16, validation_split=0.15)

loss, acc = model.evaluate(X_test, y_test)
print(f"Test accuracy: {acc:.2%}")

# Export for TensorFlow.js
import tensorflowjs as tfjs
tfjs.converters.save_keras_model(model, 'gesture_model_tfjs')
print("Model saved to gesture_model_tfjs/")
```

### Step 4: Load in Browser

```typescript
// client/src/hooks/useGestureClassifier.ts
import * as tf from '@tensorflow/tfjs';

const GESTURE_LABELS = ['open_palm', 'pointing', 'fidgeting', 'resting', 'illustrative'];
let model: tf.LayersModel | null = null;

export async function loadGestureModel() {
    model = await tf.loadLayersModel('/models/gesture_model_tfjs/model.json');
}

export function classifyGesture(poseLandmarks: {x:number,y:number,z:number,visibility?:number}[]): string {
    if (!model || poseLandmarks.length < 33) return 'unknown';

    const hipCenterX = (poseLandmarks[23].x + poseLandmarks[24].x) / 2;
    const hipCenterY = (poseLandmarks[23].y + poseLandmarks[24].y) / 2;

    const features: number[] = [];
    for (const lm of poseLandmarks) {
        features.push(lm.x - hipCenterX, lm.y - hipCenterY, lm.z, lm.visibility ?? 1.0);
    }

    const input = tf.tensor2d([features]);
    const prediction = model.predict(input) as tf.Tensor;
    const classIndex = prediction.argMax(1).dataSync()[0];
    input.dispose();
    prediction.dispose();

    return GESTURE_LABELS[classIndex];
}
```

### Step 5: Deploy

Copy the `gesture_model_tfjs/` folder to `client/public/models/gesture_model_tfjs/`.

---

## 2. TED Benchmark Dataset

**Goal:** Profile 15–20 TED talks to build a statistically meaningful benchmark.

### Step 1: Select Videos

Download MP4s of these talks (mix of styles):

| # | Speaker | Talk | Style |
|---|---------|------|-------|
| 1 | Amy Cuddy | Your Body Language May Shape Who You Are | High gesture, dominant |
| 2 | Sir Ken Robinson | Do Schools Kill Creativity? | Natural, comedic |
| 3 | Simon Sinek | How Great Leaders Inspire Action | Deliberate, structured |
| 4 | Brené Brown | The Power of Vulnerability | Emotional, personal |
| 5 | Hans Rosling | The Best Stats You've Ever Seen | Energetic, demonstrative |
| 6 | Chimamanda Adichie | The Danger of a Single Story | Calm, storytelling |
| 7 | Tim Urban | Inside the Mind of a Procrastinator | Comedic, high energy |
| 8 | Jill Bolte Taylor | My Stroke of Insight | Dramatic, emotional |
| 9 | Dan Pink | The Puzzle of Motivation | Corporate, measured |
| 10 | Elizabeth Gilbert | Your Elusive Creative Genius | Conversational |

**Tip:** Use `yt-dlp` to download: `yt-dlp -f mp4 "URL" -o "talks/%(title)s.mp4"`

### Step 2: Batch Profile

1. Open `http://localhost:3000/profiler`
2. Upload each video → Start Scan → Let it complete
3. After all videos are scanned, click **"Export Benchmarks JSON"**

This gives you a `ted_benchmarks.json` with averaged metrics across all talks.

### Step 3: Store Individual Profiles

For richer analysis, modify the profiler export to also save per-video metrics. This lets you show ranges instead of just averages:

```json
{
  "benchmarks": {
    "gesturesPerMin": { "mean": 22, "min": 8, "max": 42, "stddev": 9.3 },
    "postureAngle":   { "mean": 162, "min": 148, "max": 174, "stddev": 6.1 }
  }
}
```

---

## 3. Charisma / Engagement Score Predictor

**Goal:** Given a user's body language metrics, predict how engaging their delivery would be.

### Step 1: Build the Training Set

After profiling 15+ TED talks, create a CSV:

```csv
speaker,views,gestures_per_min,posture_angle,stability,smile,expressiveness,hand_vis,overall
Amy Cuddy,68000000,32,168,0.88,0.45,0.72,0.91,82
Sir Ken Robinson,73000000,18,161,0.95,0.38,0.65,0.78,79
...
```

- `views` is the target variable (proxy for engagement)
- Use log(views) as the target to normalize the wide range

### Step 2: Train

Create `ml/train_charisma_model.py`:

```python
import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
import joblib

df = pd.read_csv('ted_profiles.csv')
features = ['gestures_per_min','posture_angle','stability','smile','expressiveness','hand_vis']

X = df[features].values
y = np.log10(df['views'].values)  # Log-scale views

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

model = GradientBoostingRegressor(n_estimators=100, max_depth=3, random_state=42)
model.fit(X_scaled, y)

# Save
joblib.dump(model, 'charisma_model.pkl')
joblib.dump(scaler, 'charisma_scaler.pkl')

# Feature importance (great for the demo!)
for name, imp in sorted(zip(features, model.feature_importances_), key=lambda x: -x[1]):
    print(f"  {name}: {imp:.2%}")
```

### Step 3: Deploy as API

Add an endpoint to the Node.js server, or convert to TensorFlow.js:

**Option A — Server-side (Python microservice):**
```python
# ml/serve_charisma.py
from flask import Flask, request, jsonify
import joblib, numpy as np

app = Flask(__name__)
model = joblib.load('charisma_model.pkl')
scaler = joblib.load('charisma_scaler.pkl')

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    features = np.array([[data['gestures_per_min'], data['posture_angle'],
                          data['stability'], data['smile'],
                          data['expressiveness'], data['hand_vis']]])
    scaled = scaler.transform(features)
    log_views = model.predict(scaled)[0]
    score = int(min(100, max(0, (log_views - 4) / 4 * 100)))  # Normalize to 0-100
    return jsonify({'charisma_score': score, 'predicted_log_views': round(log_views, 2)})
```

**Option B — Convert to ONNX and run in-browser** (more complex but no server needed).

---

## Directory Structure After ML

```
gemini-pitch-agent/
├── client/
│   ├── public/models/gesture_model_tfjs/   ← TF.js gesture model
│   └── src/hooks/useGestureClassifier.ts   ← Browser inference
├── ml/
│   ├── prepare_gestures.py
│   ├── train_gesture_model.py
│   ├── train_charisma_model.py
│   ├── serve_charisma.py
│   ├── gesture_data.npz
│   ├── ted_profiles.csv
│   └── talks/                              ← Downloaded TED MP4s
└── server/
    └── src/data/benchmarks.json            ← Generated from profiler
```

---

## Quick Reference: Timeline

| Day | Task | Output |
|-----|------|--------|
| 1 | Build gesture data collector UI | `/collector` page |
| 2 | Record gesture samples (~500) | `gesture_dataset.json` |
| 3 | Train + export gesture model | `gesture_model_tfjs/` |
| 4–5 | Profile 15 TED talks via scanner | `ted_benchmarks.json` |
| 6 | Build charisma training CSV | `ted_profiles.csv` |
| 7 | Train + deploy charisma model | API endpoint or TF.js |
