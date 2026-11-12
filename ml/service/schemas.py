"""Formats d'entrée et de sortie du service (validation stricte avec Pydantic).

Les 16 variables sont celles de `risque/variables.py`, dans l'ordre de la fiche
`modeles/risque_v1.json`. Seules `score_moyen` et `tendance_score` peuvent être vides
(aucune note, ou moins de deux notes) : le modèle sait traiter ces valeurs manquantes.
"""
import os
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

TAILLE_LOT_MAX = int(os.environ.get("ML_TAILLE_LOT_MAX", "500"))

# Un compteur de jours ou d'évaluations : entier positif, borné pour refuser les valeurs absurdes
Compteur = Annotated[float, Field(ge=0, le=100_000)]
Taux = Annotated[float, Field(ge=0, le=1)]
Note = Annotated[float, Field(ge=0, le=100)]


class Apprenant(BaseModel):
    """Un apprenant (une inscription) et ses 16 variables à l'instant du calcul."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    identifiant: str = Field(min_length=1, max_length=64)

    jours_actifs: Compteur
    taux_jours_actifs: Taux
    jours_depuis_derniere_activite: Compteur
    jours_actifs_14_derniers: Annotated[float, Field(ge=0, le=14)]
    delai_inscription: Annotated[float, Field(ge=-100_000, le=100_000)]
    nb_evaluations_echues: Compteur
    taux_remise: Taux
    nb_non_rendues: Compteur
    nb_remises_en_retard: Compteur
    nb_notes: Compteur
    score_moyen: Note | None = None
    nb_echecs: Compteur
    echecs_consecutifs_fin: Compteur
    tendance_score: Annotated[float, Field(ge=-100, le=100)] | None = None
    a_au_moins_une_note: Literal[0, 1]
    coupure: Compteur


class DemandePrediction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    apprenants: list[Apprenant] = Field(min_length=1, max_length=TAILLE_LOT_MAX)


class Prediction(BaseModel):
    identifiant: str
    probabilite: float
    niveau: Literal["faible", "moyen", "élevé"]
    raisons: list[str]


class ReponsePrediction(BaseModel):
    version_modele: str
    seuil: float
    predictions: list[Prediction]


class Sante(BaseModel):
    statut: Literal["ok"]
    version_modele: str
    seuil: float
    nb_entrees: int
