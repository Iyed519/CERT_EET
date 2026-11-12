"""Tests du service ml : santé, prédiction, validation, cohérence SHAP, niveaux et raisons."""
import math

import pytest
from fastapi.testclient import TestClient

from risque.explications import NON_PRESENTEES, SEUIL_ELEVE
from service.app import app
from service.modele import sigmoide
from service.schemas import TAILLE_LOT_MAX

# Apprenant engagé : actif, rend ses travaux, bonnes notes
ENGAGE = {
    "identifiant": "engage", "jours_actifs": 25, "taux_jours_actifs": 0.85,
    "jours_depuis_derniere_activite": 1, "jours_actifs_14_derniers": 12, "delai_inscription": -20,
    "nb_evaluations_echues": 2, "taux_remise": 1.0, "nb_non_rendues": 0, "nb_remises_en_retard": 0,
    "nb_notes": 3, "score_moyen": 82, "nb_echecs": 0, "echecs_consecutifs_fin": 0,
    "tendance_score": 4, "a_au_moins_une_note": 1, "coupure": 28,
}
# Apprenant décroché : aucune activité, rien rendu, aucune note (valeurs vides)
DECROCHE = {
    "identifiant": "decroche", "jours_actifs": 0, "taux_jours_actifs": 0.0,
    "jours_depuis_derniere_activite": 28, "jours_actifs_14_derniers": 0, "delai_inscription": 5,
    "nb_evaluations_echues": 2, "taux_remise": 0.0, "nb_non_rendues": 2, "nb_remises_en_retard": 0,
    "nb_notes": 0, "score_moyen": None, "nb_echecs": 0, "echecs_consecutifs_fin": 0,
    "tendance_score": None, "a_au_moins_une_note": 0, "coupure": 28,
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:   # le « with » déclenche le chargement du modèle au démarrage
        yield c


def predire(client, *apprenants):
    return client.post("/predire", json={"apprenants": list(apprenants)})


# --- Santé -------------------------------------------------------------------

def test_sante(client):
    r = client.get("/sante")
    assert r.status_code == 200
    assert r.json() == {"statut": "ok", "version_modele": "risque_v1", "seuil": 0.355, "nb_entrees": 16}


def test_documentation_non_exposee(client):
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


# --- Prédiction --------------------------------------------------------------

def test_prediction_valeurs_connues(client):
    r = predire(client, ENGAGE, DECROCHE)
    assert r.status_code == 200
    corps = r.json()
    assert corps["version_modele"] == "risque_v1" and corps["seuil"] == 0.355
    engage, decroche = corps["predictions"]
    assert engage["identifiant"] == "engage" and decroche["identifiant"] == "decroche"
    assert 0 <= engage["probabilite"] < decroche["probabilite"] <= 1
    assert decroche["niveau"] == "élevé"
    assert engage["niveau"] in {"faible", "moyen"}


def test_valeurs_vides_acceptees(client):
    r = predire(client, DECROCHE)
    assert r.status_code == 200
    p = r.json()["predictions"][0]
    assert not math.isnan(p["probabilite"])
    assert 1 <= len(p["raisons"]) <= 3


def test_champs_vides_omis_equivalents_a_null(client):
    sans = {k: v for k, v in DECROCHE.items() if k not in ("score_moyen", "tendance_score")}
    assert predire(client, sans).json()["predictions"] == predire(client, DECROCHE).json()["predictions"]


def test_lot_ordre_conserve_et_independant(client):
    lot = [dict(ENGAGE, identifiant=f"a{i}") if i % 2 else dict(DECROCHE, identifiant=f"a{i}") for i in range(50)]
    r = predire(client, *lot)
    assert r.status_code == 200
    preds = r.json()["predictions"]
    assert [p["identifiant"] for p in preds] == [f"a{i}" for i in range(50)]
    # Prédire seul ou dans un lot donne exactement le même résultat
    seul = predire(client, ENGAGE).json()["predictions"][0]
    assert preds[1]["probabilite"] == seul["probabilite"]


def test_lot_maximal_accepte(client):
    lot = [dict(ENGAGE, identifiant=f"x{i}") for i in range(TAILLE_LOT_MAX)]
    assert predire(client, *lot).status_code == 200


# --- Validation des entrées -------------------------------------------------

@pytest.mark.parametrize("modif, champ", [
    ({"taux_remise": 1.5}, "taux_remise"),
    ({"jours_actifs": -1}, "jours_actifs"),
    ({"score_moyen": 120}, "score_moyen"),
    ({"a_au_moins_une_note": 2}, "a_au_moins_une_note"),
    ({"jours_actifs_14_derniers": 15}, "jours_actifs_14_derniers"),
    ({"coupure": "abc"}, "coupure"),
    ({"identifiant": ""}, "identifiant"),
    ({"inconnu": 1}, "inconnu"),
])
def test_valeur_invalide_refusee(client, modif, champ):
    r = predire(client, dict(ENGAGE, **modif))
    assert r.status_code == 422
    corps = r.json()
    assert corps["erreur"] == "Entrées invalides"
    assert any(champ in d["champ"] for d in corps["details"])


def test_variable_manquante_refusee(client):
    incomplet = {k: v for k, v in ENGAGE.items() if k != "taux_remise"}
    r = predire(client, incomplet)
    assert r.status_code == 422
    assert any(d["champ"].endswith("taux_remise") for d in r.json()["details"])


def test_valeur_non_vide_obligatoire(client):
    """Seuls score_moyen et tendance_score peuvent être vides."""
    r = predire(client, dict(ENGAGE, jours_actifs=None))
    assert r.status_code == 422


def test_nan_refuse(client):
    r = client.post("/predire", content='{"apprenants": [' + str(ENGAGE).replace("'", '"').replace(
        '"jours_actifs": 25', '"jours_actifs": NaN') + "]}", headers={"content-type": "application/json"})
    assert r.status_code == 422


def test_lot_vide_ou_trop_grand(client):
    assert client.post("/predire", json={"apprenants": []}).status_code == 422
    lot = [dict(ENGAGE, identifiant=f"x{i}") for i in range(TAILLE_LOT_MAX + 1)]
    assert predire(client, *lot).status_code == 422


def test_corps_invalide(client):
    assert client.post("/predire", content="pas du json", headers={"content-type": "application/json"}).status_code == 422
    assert client.post("/predire", json={}).status_code == 422


# --- Cohérence SHAP, niveaux et raisons -------------------------------------

def test_coherence_shap(client):
    """Valeur de base + somme des contributions = score brut ; sigmoïde(score brut) = probabilité."""
    m = client.app.state.modele
    for r in m.predire([ENGAGE, DECROCHE]):
        assert math.isclose(r.valeur_base + sum(r.contributions.values()), r.score_brut, abs_tol=1e-9)
        assert math.isclose(sigmoide(r.score_brut), r.probabilite, abs_tol=1e-4)
        assert set(r.contributions) == set(m.entrees)


def test_niveaux_suivent_les_seuils(client):
    m = client.app.state.modele
    for r in m.predire([ENGAGE, DECROCHE, dict(ENGAGE, jours_depuis_derniere_activite=14, jours_actifs_14_derniers=0)]):
        attendu = "élevé" if r.probabilite >= SEUIL_ELEVE else "moyen" if r.probabilite >= m.seuil else "faible"
        assert r.niveau == attendu


def test_raisons_en_francais_et_pertinentes(client):
    m = client.app.state.modele
    r = m.predire([DECROCHE])[0]
    assert 1 <= len(r.raisons) <= 3 and len(set(r.raisons)) == len(r.raisons)
    # Les raisons viennent des contributions positives, jamais du calendrier
    positives = {n for n, c in r.contributions.items() if c > 0 and n not in NON_PRESENTEES}
    assert positives
    texte = " ".join(r.raisons)
    assert "coupure" not in texte and "nb_evaluations_echues" not in texte
    assert any(mot in texte for mot in ("activité", "rendu", "note", "actif"))


def test_fiche_et_modele_coherents(client):
    m = client.app.state.modele
    assert m.entrees[0] == "jours_actifs" and m.entrees[-1] == "coupure" and len(m.entrees) == 16
