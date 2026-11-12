"""Niveau de risque et raisons lisibles en français, à partir des contributions SHAP.

Une contribution positive pousse la prédiction vers « à risque » ; je ne garde que celles-là
comme raisons, car ce sont elles qui expliquent l'alerte.
"""
import math

SEUIL_ELEVE = 0.60   # au-delà, la calibration montre un risque réel élevé (environ 60 % ou plus)

# Variables jamais présentées comme raisons : elles décrivent le calendrier, pas l'apprenant
NON_PRESENTEES = {"coupure", "nb_evaluations_echues"}


def niveau(proba, seuil):
    """faible / moyen / élevé. Le seuil d'alerte du modèle sépare « faible » de « moyen »."""
    if proba >= SEUIL_ELEVE:
        return "élevé"
    if proba >= seuil:
        return "moyen"
    return "faible"


def _vide(v):
    return v is None or (isinstance(v, float) and math.isnan(v))


def _n(v, singulier, pluriel):
    v = int(round(v))
    return f"{v} {singulier if v <= 1 else pluriel}"


PHRASES = {
    "jours_depuis_derniere_activite": lambda v: f"Aucune activité depuis {_n(v, 'jour', 'jours')}",
    "jours_actifs_14_derniers": lambda v: f"Seulement {_n(v, 'jour actif', 'jours actifs')} sur les 14 derniers jours",
    "jours_actifs": lambda v: f"Seulement {_n(v, 'jour actif', 'jours actifs')} depuis le début",
    "taux_jours_actifs": lambda v: f"Actif seulement {v:.0%} des jours depuis le début",
    "taux_remise": lambda v: ("Aucun travail échu n'a été rendu" if v == 0
                              else f"Seulement {v:.0%} des travaux échus ont été rendus"),
    "nb_non_rendues": lambda v: f"{_n(v, 'travail non rendu', 'travaux non rendus')} après la date limite",
    "nb_remises_en_retard": lambda v: f"{_n(v, 'travail rendu', 'travaux rendus')} en retard",
    "score_moyen": lambda v: "Aucune note pour l'instant" if _vide(v) else f"Moyenne des notes : {v:.0f}/100",
    "a_au_moins_une_note": lambda v: "Aucune note pour l'instant" if v == 0 else None,
    "nb_notes": lambda v: f"Peu de notes obtenues ({int(v)})",
    "nb_echecs": lambda v: f"{_n(v, 'note', 'notes')} sous 40/100",
    "echecs_consecutifs_fin": lambda v: f"{_n(v, 'échec consécutif', 'échecs consécutifs')} sur les dernières notes",
    "tendance_score": lambda v: None if _vide(v) else f"Notes en baisse ({v:+.0f} points par rapport aux précédentes)",
    "delai_inscription": lambda v: (f"Inscription tardive ({int(v)} jours après le début)" if v > 0
                                   else f"Inscription {int(-v)} jours avant le début"),
}


def raisons(valeurs, contributions, n=3):
    """Les n raisons qui augmentent le plus le risque, en phrases simples (sans doublon)."""
    candidates = sorted(
        ((nom, c) for nom, c in contributions.items() if c > 0 and nom not in NON_PRESENTEES and nom in PHRASES),
        key=lambda x: x[1], reverse=True)
    phrases = []
    for nom, _ in candidates:
        phrase = PHRASES[nom](valeurs[nom])
        if phrase and phrase not in phrases:
            phrases.append(phrase)
        if len(phrases) == n:
            break
    return phrases