# -*- coding: utf-8 -*-
"""Generate the Cert_EET class diagrams (PlantUML) from the REAL schema introspected
after running all 43 migrations on PostgreSQL 16 + pgvector (main = e7216f2, PR #141)."""
import re, json, os
from collections import OrderedDict, defaultdict

S = "/home/claude/schema/"
OUT = "/home/claude/out/v4/10_diagrammes/classes/"
os.makedirs(OUT, exist_ok=True)

CLS = OrderedDict([
 # table: (Class, package)
 ("users", ("User", "P1")), ("refresh_tokens", ("RefreshToken", "P1")), ("comptes_oauth", ("CompteOauth", "P1")),
 ("jetons_lien_email", ("JetonLienEmail", "P1")), ("demandes_role", ("DemandeRole", "P1")),
 ("universites", ("Universite", "P2")), ("etablissements", ("Etablissement", "P2")), ("domaines_etudes", ("DomaineEtudes", "P2")),
 ("etablissement_domaine", ("EtablissementDomaine", "P2")),
 ("formations", ("Formation", "P3")), ("modules", ("ModuleFormation", "P3")), ("formation_formateurs", ("AffectationFormateur", "P3")),
 ("inscriptions", ("Inscription", "P3")), ("ressources_module", ("RessourceModule", "P3")),
 ("demandes_affectation", ("DemandeAffectation", "P3")), ("propositions_formation", ("PropositionFormation", "P3")),
 ("qcm", ("Qcm", "P4")), ("config_anti_fraude", ("ConfigurationAntiFraude", "P4")), ("questions", ("Question", "P4")),
 ("options", ("Option", "P4")), ("qcm_questions", ("QcmQuestion", "P4")), ("tentatives_qcm", ("TentativeQcm", "P4")),
 ("reponses", ("Reponse", "P4")), ("reponse_options", ("ReponseOption", "P4")), ("analyses_ia_tentatives", ("AnalyseIaTentative", "P4")),
 ("captures_webcam", ("CaptureWebcam", "P5")), ("evenements_surveillance", ("EvenementSurveillance", "P5")),
 ("ateliers", ("Atelier", "P6")), ("grilles", ("Grille", "P6")), ("criteres", ("Critere", "P6")), ("niveaux_performance", ("NiveauPerformance", "P6")),
 ("livrables", ("Livrable", "P6")), ("fichiers_livrables", ("FichierLivrable", "P6")), ("corrections", ("Correction", "P6")),
 ("notes_criteres", ("NoteCritere", "P6")), ("consultations_feedback", ("ConsultationFeedback", "P6")),
 ("certificats", ("Certificat", "P7")),
 ("supports_pedagogiques", ("SupportPedagogique", "P8")), ("segments_support", ("SegmentSupport", "P8")),
 ("generations_ia", ("GenerationIa", "P8")), ("suggestions_questions_ia", ("SuggestionQuestionIa", "P8")),
 ("extractions_questions_ia", ("ExtractionQuestionsIa", "P8")), ("questions_extraites_ia", ("QuestionExtraiteIa", "P8")),
 ("alertes_decrochage", ("AlerteDecrochage", "P9")), ("actions_alerte", ("ActionAlerte", "P9")), ("scores_risque", ("ScoreRisque", "P9")),
 ("rapports", ("Rapport", "P9")),
 ("audit_logs", ("AuditLog", "P10")),
])
NO_ENTITY = {"segments_support", "captures_webcam", "demandes_affectation", "propositions_formation", "jetons_lien_email",
             "analyses_ia_tentatives", "evenements_surveillance"}
PKG = OrderedDict([
 ("P1", ("Utilisateurs & sécurité", "#FDEDEC")), ("P2", ("Référentiel des établissements", "#F4F6F7")),
 ("P3", ("Formations & pédagogie", "#EAF2F8")), ("P4", ("Évaluations QCM (F1)", "#E8F8F5")),
 ("P5", ("Surveillance des QCM (F1)", "#FEF5E7")), ("P6", ("Ateliers pratiques (F2)", "#F4ECF7")),
 ("P7", ("Certification (F3)", "#FEF9E7")), ("P8", ("Assistance IA aux formateurs (F4)", "#EBF5FB")),
 ("P9", ("Pilotage, rapports & prédiction (F6)", "#E9F7EF")), ("P10", ("Transverse (F7)", "#F2F3F4")),
])
IMMUABLE = {"audit_logs": "immuable (déclencheur)", "certificats": "ACTIF immuable sauf → REVOQUE",
            "tentatives_qcm": "NOTEE immuable", "livrables": "NOTE immuable", "corrections": "TERMINEE immuable",
            "notes_criteres": "figée si correction TERMINEE", "actions_alerte": "immuable"}

ENUMS = {}
for l in open(S + "enums.txt"):
    n, v = l.strip().split("|"); ENUMS[n] = v.split(",")
COLS = OrderedDict()
for l in open(S + "cols.txt"):
    t, c, ty, ln, nl, df = l.rstrip("\n").split("|", 5)
    if t == "migrations": continue
    COLS.setdefault(t, []).append((c, ty, ln, nl == "YES"))
FKS = []
for l in open(S + "fks.txt"):
    t, n, r, d, df = l.rstrip("\n").split("|", 4)
    col = re.match(r"FOREIGN KEY \(([^)]*)\)", df).group(1)
    FKS.append((t, col, r, d))
UNIQ = set()
for l in open(S + "uniq.txt"):
    m = re.search(r"ON public\.(\w+) USING btree \((\w+)\)$", l.strip())
    if m: UNIQ.add((m.group(1), m.group(2)))
CHECK_VALUES = {}
for l in open(S + "checks.txt"):
    parts = l.rstrip("\n").split("|", 2)
    if len(parts) < 3: continue
    t, n, d = parts
    m = re.match(r"CHECK \(\(\((\w+)\)::text = ANY \(\(ARRAY\[(.*?)\]\)", d)
    if m:
        CHECK_VALUES[(t, m.group(1))] = re.findall(r"'([^']+)'::", m.group(2))
    m = re.match(r"CHECK \(\(\((\w+) IS NULL\) OR \(\((\w+)\)::text = ANY \(\(ARRAY\[(.*?)\]\)", d)
    if m:
        CHECK_VALUES[(t, m.group(2))] = re.findall(r"'([^']+)'::", m.group(3))

def camel(c):
    p = c.split("_"); return p[0] + "".join(x.capitalize() for x in p[1:])

TYPEMAP = {"character varying": "String", "text": "String", "uuid": "UUID", "integer": "int", "smallint": "int",
           "bigint": "long", "boolean": "boolean", "numeric": "decimal", "timestamp with time zone": "DateTime",
           "date": "Date", "jsonb": "JSON", "ARRAY": "String[]", "character": "String"}

def enum_name(t, c):
    return f"{t}_{c}_enum"

ENUM_CLASSES = OrderedDict()
def typ(t, c, ty):
    if ty == "USER-DEFINED":
        if c == "embedding": return "vector(384)"
        en = enum_name(t, c)
        if en in ENUMS:
            nice = {
             "users_role_enum": "Role", "users_statut_enum": "StatutCompte", "users_niveau_etudes_enum": "NiveauEtudes",
             "formations_statut_enum": "StatutFormation", "inscriptions_statut_enum": "StatutInscription",
             "qcm_statut_enum": "StatutQcm", "questions_type_enum": "TypeQuestion", "questions_origine_enum": "OrigineQuestion",
             "tentatives_qcm_statut_enum": "StatutTentative", "config_anti_fraude_affichage_resultats_enum": "AffichageResultats",
             "ateliers_statut_enum": "StatutAtelier", "livrables_statut_enum": "StatutLivrable", "corrections_statut_enum": "StatutCorrection",
             "certificats_statut_enum": "StatutCertificat", "certificats_motif_revocation_enum": "MotifRevocation",
             "supports_pedagogiques_statut_enum": "StatutSupport", "generations_ia_statut_enum": "StatutGeneration",
             "suggestions_questions_ia_statut_enum": "StatutSuggestion", "alertes_decrochage_critere_enum": "CritereAlerte",
             "alertes_decrochage_statut_enum": "StatutAlerte", "actions_alerte_type_enum": "TypeActionAlerte",
             "rapports_type_enum": "TypeRapport", "rapports_format_enum": "FormatRapport", "rapports_statut_enum": "StatutRapport",
             "demandes_role_role_demande_enum": "RoleDemande", "demandes_role_statut_enum": "StatutDemande",
             "ressources_module_nature_enum": "NatureRessource"}[en]
            ENUM_CLASSES[nice] = ENUMS[en]
            return nice
    if (t, c) in CHECK_VALUES and c in ("statut", "type", "niveau", "objet", "mode_lecture", "format"):
        return "String {" + "|".join(CHECK_VALUES[(t, c)]) + "}"
    return TYPEMAP.get(ty, ty)

FKCOLS = {(t, c) for t, c, r, d in FKS}

def attrs(t, full=True):
    out = []
    for c, ty, ln, nul in COLS[t]:
        if c == "id": continue
        if (t, c) in FKCOLS and full: continue  # shown as association
        tp = typ(t, c, ty)
        if len(tp) > 70: tp = tp[:67] + "…}"
        out.append(f"  - {camel(c)} : {tp}{' [0..1]' if nul else ''}")
    return out

def role_label(col):
    return {"apprenant_id": "apprenant", "formateur_id": "formateur", "correcteur_id": "correcteur",
            "revoque_par": "révoqué par", "traite_par": "traité par", "affecte_par": "affecté par",
            "suspendue_par": "suspendue par", "decide_par": "décidé par", "depose_par": "déposé par",
            "ajoute_par": "ajouté par", "auteur_id": "auteur", "demandeur_id": "demandeur", "examine_par": "examiné par",
            "user_id": "", "remplace_certificat_id": "remplace"}.get(col, "")

def is_nullable(t, c):
    for cc, ty, ln, nul in COLS[t]:
        if cc == c: return nul
    return False

def rel(t, c, r, d):
    A, B = CLS[t][0], CLS[r][0]
    one_one = (t, c) in UNIQ
    nul = is_nullable(t, c)
    parent_m = "0..1" if nul else "1"
    child_m = "0..1" if one_one else "0..*"
    lab = role_label(c)
    lab = f" : {lab}" if lab else ""
    if d == "c" and not nul and r != "users":
        return f'{B} "{parent_m}" *-[#C0392B]- "{child_m}" {A}{lab}'
    if r == "users":
        return f'{A} "{child_m}" -[#2471A3]-> "{parent_m}" {B}{lab}'
    return f'{A} "{child_m}" -[#2471A3]-> "{parent_m}" {B}{lab}'

HEAD = """skinparam backgroundColor #FFFFFF
skinparam shadowing false
skinparam DefaultFontName "Segoe UI"
skinparam DefaultFontSize 10
skinparam classAttributeIconSize 0
skinparam dpi 130
skinparam nodesep 45
skinparam ranksep 60
skinparam class {
  BackgroundColor #FFFFFF
  BorderColor #34495E
  HeaderBackgroundColor #EAECEE
}
skinparam package {
  BorderColor #7F8C8D
  FontStyle bold
}
skinparam note {
  BackgroundColor #FEF9E7
  BorderColor #B7950B
  FontSize 9
}
hide empty methods
"""

def class_block(t, full=True, stub=False):
    name = CLS[t][0]
    st = []
    if t in NO_ENTITY: st.append("SQL direct")
    if t in IMMUABLE and full: st.append(IMMUABLE[t])
    s = f" <<{' · '.join(st)}>>" if st else ""
    if stub:
        return f"class {name} #F8F9F9 {{\n}}\n"
    body = "\n".join(attrs(t)) if full else ""
    return f"class {name}{s} {{\n{body}\n}}\n"

def legend():
    return """legend bottom right
  | <color:#C0392B><b>◆──</b></color> | composition (suppression en cascade) |
  | <color:#2471A3><b>──></b></color> | association (clé étrangère) |
  | <<SQL direct>> | table sans entité TypeORM (requêtes SQL) |
  | gris | classe d'un autre package |
endlegend
"""

def write(name, body):
    with open(OUT + name + ".puml", "w", encoding="utf-8") as f:
        f.write(body)

# ---- per-package diagrams
INDEX = []
for i, (pk, (pname, color)) in enumerate(PKG.items(), 1):
    tables = [t for t, (c, p) in CLS.items() if p == pk]
    fks = [(t, c, r, d) for t, c, r, d in FKS if t in tables or (r in tables and r != "users")]
    if pk == "P1":
        fks = [(t, c, r, d) for t, c, r, d in FKS if t in tables]
    ext = sorted({x for t, c, r, d in fks for x in (t, r) if x not in tables})
    code = f"CLS-{i:02d}"
    import unicodedata
    slug = unicodedata.normalize('NFD', pname.split(' (')[0]).encode('ascii', 'ignore').decode()
    fn = f"Cert_EET_{code}_{re.sub(r'[^A-Za-z]+', '_', slug).strip('_')}"
    b = f"@startuml {fn}\n' {code} — {pname} · généré depuis le schéma réel (43 migrations, PR #141)\n" + HEAD
    b += f'title <size:14><b>Cert_EET — {code} : {pname}</b></size>\\n<size:10>Classes = tables PostgreSQL réelles · attributs = colonnes (clés étrangères en associations) · v3.0 — 18/11/2026</size>\n'
    b += f'package "{pname}" {color} {{\n'
    for t in tables: b += class_block(t)
    b += "}\n"
    if pk == "P1":
        nu = sum(1 for t, c, r, d in FKS if r == "users" and t not in tables)
        b += f'note bottom of User\n  Table unique pour les trois rôles\n  (colonne <b>role</b>). Référencée par\n  <b>{nu}</b> autres clés étrangères\n  (apprenant, formateur, correcteur…).\nend note\n'
    for t in ext: b += class_block(t, stub=True)
    for f in fks:
        b += rel(*f) + "\n"
    used = set()
    for t in tables:
        for c, ty, ln, nul in COLS[t]:
            tp = typ(t, c, ty)
            if tp in ENUM_CLASSES: used.add(tp)
    for e in sorted(used):
        b += f"enum {e} {{\n" + "\n".join("  " + v for v in ENUM_CLASSES[e]) + "\n}\n"
    b += legend() + "@enduml\n"
    write(fn, b)
    INDEX.append((code, pname, fn, len(tables), [CLS[t][0] for t in tables]))

# ---- overview
b = "@startuml Cert_EET_CLS-00_Vue_Ensemble\n' CLS-00 — vue d'ensemble du modèle de données réel (48 tables)\n" + HEAD
b += 'title <size:16><b>Cert_EET — CLS-00 : Vue d\'ensemble du modèle de domaine (réalisé)</b></size>\\n<size:11>48 tables métier · 10 packages · 83 clés étrangères · générée depuis le schéma après les 43 migrations (PR #141)</size>\n'
for pk, (pname, color) in PKG.items():
    b += f'package "{pname}" {color} {{\n'
    for t, (c, p) in CLS.items():
        if p == pk:
            b += f"class {c}{' <<SQL direct>>' if t in NO_ENTITY else ''}\n"
    b += "}\n"
seen = set()
for t, c, r, d in FKS:
    A, B = CLS[t][0], CLS[r][0]
    if r == "users":
        continue  # too many: summarised in a note
    key = (A, B)
    if key in seen: continue
    seen.add(key)
    if d == "c" and not is_nullable(t, c):
        b += f"{B} *-[#C0392B]- {A}\n"
    else:
        b += f"{A} -[#2471A3]-> {B}\n"
nusers = sum(1 for t, c, r, d in FKS if r == "users")
b += f'note as NU\n  <b>User</b> est référencé par <b>{nusers}</b> clés étrangères\n  (apprenant, formateur, correcteur, décideur…) :\n  voir les vues CLS-01 à CLS-10.\nend note\n'
b += legend() + "@enduml\n"
write("Cert_EET_CLS-00_Vue_Ensemble", b)

# ---- enums diagram
b = "@startuml Cert_EET_CLS-11_Enumerations\n" + HEAD
b += "title <size:14><b>Cert_EET — CLS-11 : Énumérations PostgreSQL et listes contrôlées</b></size>\\n<size:10>Types ENUM de la base + valeurs imposées par contrainte CHECK · v3.0</size>\n"
for e, v in ENUM_CLASSES.items():
    b += f"enum {e} {{\n" + "\n".join("  " + x for x in v) + "\n}\n"
extra = OrderedDict([
 ("StatutExtraction <<CHECK>>", CHECK_VALUES[("extractions_questions_ia", "statut")]),
 ("StatutQuestionExtraite <<CHECK>>", CHECK_VALUES[("questions_extraites_ia", "statut")]),
 ("TypeEvenementSurveillance <<CHECK>>", re.findall(r"'([A-Z_]+)'", open(S + "checks.txt").read().split("CHK_evenements_surveillance_type")[1].split("\n")[0])),
 ("StatutEvenementSurveillance <<CHECK>>", CHECK_VALUES[("evenements_surveillance", "statut")]),
 ("NiveauRisque <<CHECK>>", CHECK_VALUES[("scores_risque", "niveau")]),
 ("StatutDemandeAffectation <<CHECK>>", CHECK_VALUES[("demandes_affectation", "statut")]),
 ("StatutProposition <<CHECK>>", CHECK_VALUES[("propositions_formation", "statut")]),
 ("ObjetJetonLien <<CHECK>>", CHECK_VALUES[("jetons_lien_email", "objet")]),
 ("NiveauDifficulte <<CHECK>>", CHECK_VALUES[("generations_ia", "niveau")]),
])
for e, v in extra.items():
    b += f"enum \"{e}\" {{\n" + "\n".join("  " + x for x in v) + "\n}\n"
b += "@enduml\n"
write("Cert_EET_CLS-11_Enumerations", b)

json.dump({"index": INDEX, "enums": ENUM_CLASSES, "extra_enums": extra,
           "n_tables": len(CLS), "n_fk": len(FKS), "no_entity": sorted(NO_ENTITY)},
          open("/home/claude/build/classes_index.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(CLS), "tables;", len(FKS), "fks;", len(ENUM_CLASSES), "enums;", len(extra), "check-lists")
assert set(CLS) == set(COLS), set(COLS) ^ set(CLS)
