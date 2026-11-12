"""Test anti-fuite de `risque/variables.py` (même vérification que le notebook 02).

Il faut les CSV OULAD dans `ml/donnees/` (jamais versionnés) et pandas : en CI, ce test est
sauté proprement.
"""
from pathlib import Path

import pytest

DOSSIER = Path(__file__).resolve().parent.parent / "donnees"
pytestmark = pytest.mark.skipif(not (DOSSIER / "studentInfo.csv").exists(),
                                reason="CSV OULAD absents (ml/donnees/), test anti-fuite sauté")


@pytest.fixture(scope="module")
def donnees():
    pytest.importorskip("pandas")
    from risque.variables import charger_tables, preparer
    return preparer(charger_tables(DOSSIER))


@pytest.mark.parametrize("J", [14, 28, 42, 56])
def test_variables_identiques_sans_le_futur(donnees, J):
    import pandas as pd
    from risque.variables import CLE, VARIABLES, construire_variables, tronquer

    complet = construire_variables(donnees, J)[CLE + VARIABLES].sort_values(CLE).reset_index(drop=True)
    passe_seul = construire_variables(tronquer(donnees, J), J)[CLE + VARIABLES].sort_values(CLE).reset_index(drop=True)
    pd.testing.assert_frame_equal(complet, passe_seul)
