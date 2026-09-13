"""Segmentos de socios con K-means sobre recencia, frecuencia, gasto, antigüedad y horario.

El número de grupos lo elige la silueta (3 a 5) y el nombre sale del centroide:
un dueño no sabe qué hacer con "cluster 2", sí con "Alejándose".
"""
from __future__ import annotations

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

MIN_MEMBERS = 30
COLUMNS = ["recency_days", "visits_90", "paid_180", "tenure_days", "avg_hour"]

_DESCRIPCIONES = {
    "Fieles": "Vienen seguido y llevan tiempo. Cuídalos: son la base del mes.",
    "Alejándose": "Hace rato no vienen. Un mensaje a tiempo vale más que una promoción.",
    "Recién llegados": "Entraron hace poco. Las primeras semanas deciden si se quedan.",
    "Madrugadores": "Entrenan temprano. Sirven para llenar clases de la mañana.",
    "De la noche": "Entrenan tarde. Son los que más sienten el aforo de las 7 p. m.",
    "Ocasionales": "Vienen de vez en cuando. Un plan con clases puede engancharlos.",
}


def segment(X: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    """X: filas en el orden de `COLUMNS`. Devuelve etiquetas y descripción de cada grupo."""
    X = np.asarray(X, dtype=float)
    if len(X) < MIN_MEMBERS:
        raise ValueError(f"hacen falta {MIN_MEMBERS} socios activos (hay {len(X)})")

    Z = X.copy()
    for j in (0, 1, 2, 3):
        Z[:, j] = np.log1p(np.clip(Z[:, j], 0, None))
    Z = StandardScaler().fit_transform(Z)

    mejor = None
    for k in (3, 4, 5):
        if k >= len(X):
            break
        km = KMeans(n_clusters=k, n_init=4, random_state=0).fit(Z)
        if len(set(km.labels_)) < 2:
            continue
        s = silhouette_score(Z, km.labels_)
        if mejor is None or s > mejor[0]:
            mejor = (s, km)
    if mejor is None:
        raise ValueError("los socios son demasiado parecidos para separarlos en grupos")
    silueta, km = mejor
    labels = km.labels_

    grupos = []
    for c in range(km.n_clusters):
        filas = X[labels == c]
        grupos.append({
            "cluster": int(c),
            "size": int(len(filas)),
            "avg_recency_days": round(float(filas[:, 0].mean()), 1),
            "avg_visits_90": round(float(filas[:, 1].mean()), 1),
            "avg_paid_180": round(float(filas[:, 2].mean()), 0),
            "avg_tenure_days": round(float(filas[:, 3].mean()), 0),
            "avg_hour": round(float(filas[:, 4].mean()), 1),
        })
    _nombrar(grupos)
    for g in grupos:
        g["silhouette"] = round(float(silueta), 3)
    return labels, sorted(grupos, key=lambda g: -g["size"])


def _nombrar(grupos: list[dict]) -> None:
    libres = list(grupos)

    def tomar(nombre: str, clave, reverso: bool) -> None:
        if not libres:
            return
        g = sorted(libres, key=lambda x: x[clave], reverse=reverso)[0]
        g["name"] = nombre
        libres.remove(g)

    tomar("Fieles", "avg_visits_90", True)
    tomar("Alejándose", "avg_recency_days", True)
    tomar("Recién llegados", "avg_tenure_days", False)
    for g in list(libres):
        if g["avg_hour"] < 9:
            g["name"] = "Madrugadores"
        elif g["avg_hour"] >= 18:
            g["name"] = "De la noche"
        else:
            g["name"] = "Ocasionales"
        libres.remove(g)

    vistos: dict[str, int] = {}
    for g in grupos:
        n = vistos.get(g["name"], 0)
        vistos[g["name"]] = n + 1
        g["description"] = _DESCRIPCIONES[g["name"]]
        if n:
            g["name"] = f"{g['name']} {n + 1}"
