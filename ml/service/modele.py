"""Chargement du modèle et prédiction (probabilité, niveau, raisons).

Les explications viennent du calcul SHAP natif de LightGBM
(`predict(X, pred_contrib=True)` : une contribution par variable, puis la valeur de base
en dernière colonne). Le niveau et les raisons sont produits par `risque/explications.py`,
le même code que les notebooks : rien n'est dupliqué ici.
"""
import json
import math
import warnings
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np

from risque.explications import niveau, raisons


@dataclass
class ResultatApprenant:
    probabilite: float
    niveau: str
    raisons: list[str]
    score_brut: float
    contributions: dict[str, float]
    valeur_base: float


class ModeleRisque:
    def __init__(self, dossier: Path, version: str):
        fiche = json.loads((dossier / f"{version}.json").read_text(encoding="utf-8"))
        self.modele = joblib.load(dossier / f"{version}.joblib")
        self.version = fiche["version"]
        self.seuil = float(fiche["seuil"])
        self.entrees: list[str] = list(fiche["entrees"])

        # Garde-fou : la fiche et le modèle doivent annoncer exactement les mêmes variables, dans le même ordre
        noms_modele = [str(n) for n in getattr(self.modele, "feature_names_in_", [])]
        if noms_modele != self.entrees:
            raise ValueError("Les entrées de la fiche ne correspondent pas à celles du modèle")

    def _matrice(self, lignes: list[dict]) -> np.ndarray:
        """Valeurs dans l'ordre de la fiche ; une valeur vide devient NaN (manquante pour LightGBM)."""
        return np.array(
            [[np.nan if ligne[nom] is None else float(ligne[nom]) for nom in self.entrees] for ligne in lignes],
            dtype=float,
        )

    def predire(self, lignes: list[dict]) -> list[ResultatApprenant]:
        X = self._matrice(lignes)
        with warnings.catch_warnings():
            # Le modèle a été entraîné avec un DataFrame ; ici une matrice dans le même ordre suffit
            warnings.filterwarnings("ignore", message="X does not have valid feature names")
            probas = self.modele.predict_proba(X)[:, 1]
            contribs = self.modele.predict(X, pred_contrib=True)

        resultats = []
        for ligne, proba, c in zip(lignes, probas, contribs):
            contributions = {nom: float(v) for nom, v in zip(self.entrees, c[:-1])}
            valeurs = {nom: ligne[nom] for nom in self.entrees}
            resultats.append(ResultatApprenant(
                probabilite=round(float(proba), 4),
                niveau=niveau(float(proba), self.seuil),
                raisons=raisons(valeurs, contributions, n=3),
                score_brut=float(c.sum()),
                contributions=contributions,
                valeur_base=float(c[-1]),
            ))
        return resultats


def sigmoide(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))
