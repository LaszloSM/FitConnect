"""Modelos entrenados con los datos de cada gimnasio (sin LLM).

Todo lo de este paquete es numpy + scikit-learn sobre arreglos planos: las
consultas viven en `data.py`, la persistencia en `registry.py`. Cada modelo
tiene un umbral de datos por debajo del cual no se entrena y la pantalla cae a
la heurística de `insights_engine.py`, diciéndolo.
"""
