"""Explainability Service using SHAP"""

import numpy as np
import pandas as pd
import random

class ExplainabilityService:
    """Service for generating explanations using SHAP"""
    
    def __init__(self):
        self.feature_names = [
            'Age', 'BMI', 'Glucose', 'Insulin', 'HOMA', 
            'Leptin', 'Adiponectin', 'Resistin', 'MCP.1',
            'smoking_status', 'alcohol_units', 'exercise_hours', 
            'diet_quality', 'family_history'
        ]
    
    def explain_prediction(self, input_data, model=None):
        """
        Generate SHAP explanation for a prediction
        
        Args:
            input_data: Dictionary with patient features
            model: Trained model (optional, will use global if not provided)
        
        Returns:
            Dictionary with feature importance and explanations
        """
        
        # For demo purposes, generate mock SHAP values
        feature_importance = self._generate_shap_values(input_data)
        
        return {
            'feature_importance': feature_importance,
            'top_features': self._get_top_features(feature_importance, n=5),
            'explanation_text': self._generate_explanation_text(feature_importance)
        }
    
    def _generate_shap_values(self, input_data):
        """Generate mock SHAP values for demonstration"""
        
        importance = {}
        
        # Age contribution
        age = input_data['Age']
        importance['Age'] = max(-0.1, min(0.3, (age - 40) / 100))
        
        # BMI contribution
        bmi = input_data['BMI']
        importance['BMI'] = max(0, (bmi - 25) / 30)
        
        # Glucose contribution
        glucose = input_data['Glucose']
        importance['Glucose'] = max(0, (glucose - 100) / 150)
        
        # Insulin contribution
        insulin = input_data['Insulin']
        importance['Insulin'] = max(0, (insulin - 10) / 50)
        
        # Family history (strong indicator)
        importance['family_history'] = input_data.get('family_history', 0) * 0.25
        
        # Smoking (strong negative impact)
        importance['smoking_status'] = input_data.get('smoking_status', 0) * 0.15
        
        # Exercise (protective factor)
        exercise = input_data.get('exercise_hours', 0)
        importance['exercise_hours'] = -min(0.2, exercise * 0.03)
        
        # Diet quality (protective factor)
        diet = input_data.get('diet_quality', 5)
        importance['diet_quality'] = -min(0.15, (diet - 5) / 40)
        
        # Alcohol (moderate impact)
        alcohol = input_data.get('alcohol_units', 0)
        importance['alcohol_units'] = min(0.1, alcohol * 0.02)
        
        # Other biomarkers with smaller contributions
        for feature in ['Leptin', 'Adiponectin', 'Resistin', 'MCP.1', 'HOMA']:
            base_value = input_data.get(feature, 0)
            importance[feature] = random.uniform(-0.08, 0.08) * (base_value / 100 if base_value else 1)
        
        return importance
    
    def _get_top_features(self, feature_importance, n=5):
        """Get top N most important features"""
        
        sorted_features = sorted(
            feature_importance.items(),
            key=lambda x: abs(x[1]),
            reverse=True
        )
        
        return [
            {
                'feature': feature,
                'importance': round(importance, 4),
                'direction': 'increases risk' if importance > 0 else 'decreases risk'
            }
            for feature, importance in sorted_features[:n]
        ]
    
    def _generate_explanation_text(self, feature_importance):
        """Generate human-readable explanation"""
        
        top_3 = self._get_top_features(feature_importance, n=3)
        
        if not top_3:
            return "No significant factors identified."
        
        explanations = []
        
        for item in top_3:
            feature = item['feature']
            direction = item['direction']
            
            if feature == 'Age':
                explanations.append(f"Patient age {direction}")
            elif feature == 'BMI':
                explanations.append(f"Body mass index {direction}")
            elif feature == 'Glucose':
                explanations.append(f"Blood glucose levels {direction}")
            elif feature == 'family_history':
                explanations.append(f"Family medical history {direction}")
            elif feature == 'smoking_status':
                explanations.append(f"Smoking status {direction}")
            elif feature == 'exercise_hours':
                explanations.append(f"Physical activity level {direction}")
            else:
                explanations.append(f"{feature} {direction}")
        
        return ". ".join(explanations) + "."