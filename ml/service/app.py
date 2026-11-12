"""Service de prédiction du risque de décrochage (Cert_EET).

Conteneur séparé, joignable seulement sur le réseau interne Docker (jamais exposé par nginx).
L'API NestJS l'appelle périodiquement ; s'il est arrêté, l'application continue avec les
seules règles d'alerte.

    GET  /sante    statut, version du modèle, seuil
    POST /predire  lot d'apprenants -> probabilité, niveau, 3 raisons
"""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from service.modele import ModeleRisque
from service.schemas import DemandePrediction, Prediction, ReponsePrediction, Sante

DOSSIER_MODELES = Path(os.environ.get("ML_DOSSIER_MODELES", Path(__file__).resolve().parent.parent / "modeles"))
VERSION_MODELE = os.environ.get("ML_VERSION_MODELE", "risque_v1")

journal = logging.getLogger("service.ml")


@asynccontextmanager
async def cycle_de_vie(app: FastAPI):
    # Chargé une seule fois au démarrage : si le modèle est absent ou incohérent, le
    # service ne démarre pas (le contrôle de santé échoue, l'API passe en repli).
    app.state.modele = ModeleRisque(DOSSIER_MODELES, VERSION_MODELE)
    journal.info("Modèle %s chargé (seuil %.3f)", app.state.modele.version, app.state.modele.seuil)
    yield


app = FastAPI(
    title="Cert_EET — prédiction du risque",
    version="1.0.0",
    lifespan=cycle_de_vie,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.exception_handler(RequestValidationError)
async def erreur_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Erreurs d'entrée lisibles : quel champ, quel problème (sans renvoyer les valeurs reçues)."""
    details = [
        {"champ": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]}
        for e in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"erreur": "Entrées invalides", "details": details})


@app.get("/sante", response_model=Sante)
def sante(request: Request) -> Sante:
    m: ModeleRisque = request.app.state.modele
    return Sante(statut="ok", version_modele=m.version, seuil=m.seuil, nb_entrees=len(m.entrees))


@app.post("/predire", response_model=ReponsePrediction)
def predire(demande: DemandePrediction, request: Request) -> ReponsePrediction:
    m: ModeleRisque = request.app.state.modele
    lignes = [a.model_dump() for a in demande.apprenants]
    resultats = m.predire(lignes)
    return ReponsePrediction(
        version_modele=m.version,
        seuil=m.seuil,
        predictions=[
            Prediction(identifiant=ligne["identifiant"], probabilite=r.probabilite, niveau=r.niveau, raisons=r.raisons)
            for ligne, r in zip(lignes, resultats)
        ],
    )
