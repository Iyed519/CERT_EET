"""Variables de prédiction du risque, calculées à une date de coupure.

Règle anti-fuite : à la date de coupure J (en jours depuis le début de la session),
je n'utilise que ce qui s'est passé AVANT le jour J.
"""
from pathlib import Path

import numpy as np
import pandas as pd

CLE = ["code_module", "code_presentation", "id_student"]
SESSION = ["code_module", "code_presentation"]
SEUIL_ECHEC = 40        # note minimale de réussite à l'Open University
FENETRE_RECENTE = 14    # nombre de jours pour l'activité récente

VARIABLES = [
    "jours_actifs", "taux_jours_actifs", "jours_depuis_derniere_activite",
    "jours_actifs_14_derniers", "delai_inscription",
    "nb_evaluations_echues", "taux_remise", "nb_non_rendues", "nb_remises_en_retard",
    "nb_notes", "score_moyen", "nb_echecs", "echecs_consecutifs_fin",
    "tendance_score", "a_au_moins_une_note",
]
AUDIT = ["gender", "age_band", "disability"]   # jamais utilisées comme entrées


def charger_tables(dossier):
    """Lit les CSV utiles d'OULAD (les « ? » sont des valeurs manquantes)."""
    dossier = Path(dossier)

    def lire(nom, **options):
        return pd.read_csv(dossier / f"{nom}.csv", na_values=["?"], **options)

    return {
        "studentInfo": lire("studentInfo"),
        "studentRegistration": lire("studentRegistration"),
        "studentVle": lire("studentVle", usecols=CLE + ["date"]),   # les clics ne sont pas utilisés
        "studentAssessment": lire("studentAssessment"),
        "assessments": lire("assessments"),
        "courses": lire("courses"),
    }


def preparer(t):
    """Met les tables en forme une seule fois (ne dépend pas de la date de coupure)."""
    ev = t["assessments"].merge(t["courses"], on=SESSION)
    ev["date"] = ev["date"].fillna(ev["module_presentation_length"])   # examen sans date = fin de session
    ev = ev[ev["assessment_type"] != "Exam"]                            # examens : après la prédiction

    rem = t["studentAssessment"]
    rem = rem[rem["is_banked"] == 0]   # notes reportées d'une session précédente : exclues
    rem = rem.merge(ev[["id_assessment", *SESSION, "date"]], on="id_assessment")
    rem = rem.rename(columns={"date": "date_limite"})

    insc = t["studentInfo"].merge(t["studentRegistration"], on=CLE)
    insc["a_risque"] = insc["final_result"].isin(["Fail", "Withdrawn"]).astype(int)

    return {
        "inscriptions": insc,
        "jours": t["studentVle"].drop_duplicates(),   # un jour actif = au moins une interaction ce jour-là
        "evaluations": ev,
        "remises": rem,
    }


def construire_variables(d, J):
    """Une ligne par apprenant encore inscrit au jour J, avec ses variables calculées avant J."""
    insc = d["inscriptions"]
    deja_inscrit = insc["date_registration"].isna() | (insc["date_registration"] < J)
    pas_parti = insc["date_unregistration"].isna() | (insc["date_unregistration"] >= J)
    base = insc.loc[deja_inscrit & pas_parti,
                    CLE + ["date_registration", "final_result", "a_risque", *AUDIT]].copy()
    base["coupure"] = J

    # 1. Activité : jours actifs avant J
    j = d["jours"]
    j = j[j["date"] < J]
    j = j.assign(en_session=j["date"] >= 0, recent=j["date"] >= J - FENETRE_RECENTE)
    act = (j.groupby(CLE)
             .agg(jours_actifs=("date", "size"), derniere=("date", "max"),
                  jours_session=("en_session", "sum"),
                  jours_actifs_14_derniers=("recent", "sum"))
             .reset_index())
    base = base.merge(act, on=CLE, how="left")
    for c in ["jours_actifs", "jours_session", "jours_actifs_14_derniers"]:
        base[c] = base[c].fillna(0)
    base["taux_jours_actifs"] = base["jours_session"] / J
    base["jours_depuis_derniere_activite"] = (J - base["derniere"]).clip(upper=J).fillna(J)

    # 2. Inscription : nombre de jours avant (négatif) ou après le début de la session
    base["delai_inscription"] = base["date_registration"].fillna(base["date_registration"].median())

    # 3. Remises : seulement les évaluations dont la date limite est passée
    ev = d["evaluations"]
    echues = (ev[ev["date"] < J].groupby(SESSION).size()
                .rename("nb_evaluations_echues").reset_index())
    base = base.merge(echues, on=SESSION, how="left")
    base["nb_evaluations_echues"] = base["nb_evaluations_echues"].fillna(0)

    r = d["remises"]
    r = r[r["date_submitted"] < J]
    rendues = r[r["date_limite"] < J].groupby(CLE).size().rename("nb_rendues")
    retard = r[r["date_submitted"] > r["date_limite"]].groupby(CLE).size().rename("nb_remises_en_retard")

    # 4. Notes connues avant J, dans l'ordre chronologique
    n = r[r["score"].notna()].sort_values(["date_submitted", "id_assessment"])
    n = n.assign(echec=(n["score"] < SEUIL_ECHEC).astype(int))
    n["serie"] = n.iloc[::-1].groupby(CLE)["echec"].cumprod()   # échecs consécutifs en fin de liste
    g = n.groupby(CLE)
    notes = pd.DataFrame({
        "nb_notes": g.size(),
        "score_moyen": g["score"].mean(),
        "somme": g["score"].sum(),
        "derniere_note": g["score"].last(),
        "nb_echecs": g["echec"].sum(),
        "echecs_consecutifs_fin": g["serie"].sum(),
    })

    base = (base.merge(rendues.reset_index(), on=CLE, how="left")
                .merge(retard.reset_index(), on=CLE, how="left")
                .merge(notes.reset_index(), on=CLE, how="left"))
    for c in ["nb_rendues", "nb_remises_en_retard", "nb_notes", "nb_echecs", "echecs_consecutifs_fin"]:
        base[c] = base[c].fillna(0)

    base["nb_non_rendues"] = (base["nb_evaluations_echues"] - base["nb_rendues"]).clip(lower=0)
    base["taux_remise"] = (base["nb_rendues"] / base["nb_evaluations_echues"]).where(
        base["nb_evaluations_echues"] > 0, 1.0)
    precedentes = (base["somme"] - base["derniere_note"]) / (base["nb_notes"] - 1)
    base["tendance_score"] = (base["derniere_note"] - precedentes).where(base["nb_notes"] >= 2)
    base["a_au_moins_une_note"] = (base["nb_notes"] > 0).astype(int)

    return base[CLE + ["coupure"] + VARIABLES + ["a_risque", "final_result", *AUDIT]].reset_index(drop=True)


def tronquer(d, J):
    """Copie des données où TOUT ce qui arrive à partir du jour J est effacé (test anti-fuite)."""
    insc = d["inscriptions"]
    insc = insc[insc["date_registration"].isna() | (insc["date_registration"] < J)].copy()
    insc.loc[insc["date_unregistration"] >= J, "date_unregistration"] = np.nan
    insc["final_result"] = "inconnu"   # le résultat final n'est pas connu au jour J
    insc["a_risque"] = -1
    return {
        "inscriptions": insc,
        "jours": d["jours"][d["jours"]["date"] < J],
        "evaluations": d["evaluations"],   # le calendrier des évaluations est connu à l'avance
        "remises": d["remises"][d["remises"]["date_submitted"] < J],
    }