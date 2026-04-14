import numpy as np
import tensorflow as tf
import joblib


class DLPredictionService:
    """
    Breast cancer risk prediction using trained Deep Learning model.
    - Uses SAME preprocessing as Colab
    - Uses saved scaler (NO refit)
    - Uses 14 biomedical + lifestyle features
    """

    def __init__(self, model_path: str, scaler_path: str):
        print("Loading trained Keras model...")
        self.model = tf.keras.models.load_model(model_path)
        self.scaler = joblib.load(scaler_path)

        # EXACT feature order used during training
        self.FEATURES = [
            "Age",
            "BMI",
            "Glucose",
            "Insulin",
            "HOMA",
            "Leptin",
            "Adiponectin",
            "Resistin",
            "MCP.1",
            "smoking_status",
            "alcohol_units",
            "exercise_hours",
            "diet_quality",
            "family_history"
        ]

    # ---------- helpers ----------
    def _prepare_input(self, data: dict) -> np.ndarray:
        """
        Convert input dict → numpy array in correct order
        """
        try:
            X = np.array([[data[f] for f in self.FEATURES]], dtype=float)
        except KeyError as e:
            raise ValueError(f"Missing required feature: {e}")

        return X

    def _get_risk_label(self, prob: float):
        if prob >= 0.75:
            return "High Risk", "red"
        elif prob >= 0.40:
            return "Medium Risk", "orange"
        else:
            return "Low Risk", "green"

    # ---------- public ----------
    def predict(self, data: dict) -> dict:
        # Step 1: prepare input
        X = self._prepare_input(data)

        # Step 2: scale input (CRITICAL)
        X_scaled = self.scaler.transform(X)

        # Step 3: predict probability
        prob = float(self.model.predict(X_scaled, verbose=0)[0][0])

        # Safety clamp
        prob = max(0.01, min(0.99, prob))

        # Step 4: risk label
        risk_level, risk_color = self._get_risk_label(prob)

        confidence = round(abs(prob - 0.5) * 2, 4)

        return {
            "probability": round(prob, 4),
            "risk_level": risk_level,
            "risk_color": risk_color,
            "confidence": confidence
        }
