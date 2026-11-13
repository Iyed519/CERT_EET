import type { EspaceFormationVue, TableauDeBordFormateur, TableauDeBordGlobal } from './api';
import { LIBELLES_ALERTE_SYSTEME } from './format';

/**
 * US-UI-03 — « À faire maintenant » : règles PURES (aucun appel réseau), à
 * partir des réponses d'API existantes. Chaque élément mène en un clic à
 * l'écran qui permet de le faire.
 */
export interface ElementAFaire {
  /** Clé stable (liste React). */
  cle: string;
  /** Ce qu'il faut faire, avec un verbe. */
  libelle: string;
  /** Contexte : formation, échéance… */
  detail: string;
  href: string;
  /** Libellé du bouton. */
  action: string;
  /** 0 : le plus urgent. */
  urgence: number;
  /** Pour trier à urgence égale (horodatage ISO, ou chaîne vide). */
  echeance: string;
}

const trier = (elements: ElementAFaire[]): ElementAFaire[] =>
  [...elements].sort(
    (a, b) =>
      a.urgence - b.urgence ||
      (a.echeance || '9999').localeCompare(b.echeance || '9999') ||
      a.libelle.localeCompare(b.libelle, 'fr'),
  );

const pluriel = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;

/**
 * Apprenant : QCM à reprendre (tentative en cours), QCM ouvert à passer (à
 * faire, ou échoué avec des tentatives restantes), livrable à rendre (dépôt
 * ouvert ou en retard, rien déposé), feedback non lu. Seules les inscriptions
 * EN_COURS comptent.
 */
export function aFaireApprenant(espaces: readonly EspaceFormationVue[]): ElementAFaire[] {
  const elements: ElementAFaire[] = [];
  for (const e of espaces) {
    if (e.inscription.statut !== 'EN_COURS') continue;
    const espace = `/mes-inscriptions/${e.formation.id}`;
    for (const m of e.modules) {
      for (const q of m.qcms) {
        if (q.tentativeEnCoursId) {
          elements.push({
            cle: `reprendre-${q.id}`,
            libelle: `Reprendre le QCM « ${q.titre} »`,
            detail: `${e.formation.titre} · tentative commencée`,
            href: `/tentatives/${q.tentativeEnCoursId}`,
            action: 'Reprendre',
            urgence: 0,
            echeance: q.dateFermeture ?? '',
          });
          continue;
        }
        const restantes =
          q.nbTentativesMax === null || q.nbTentativesPassees < q.nbTentativesMax;
        const aPasser =
          q.fenetre === 'OUVERTE' &&
          restantes &&
          (q.avancement === 'A_FAIRE' || q.avancement === 'ECHOUE');
        if (aPasser) {
          elements.push({
            cle: `passer-${q.id}`,
            libelle: `${q.avancement === 'ECHOUE' ? 'Retenter' : 'Passer'} le QCM « ${q.titre} »`,
            detail: `${e.formation.titre} · ${m.titre}`,
            href: espace,
            action: q.avancement === 'ECHOUE' ? 'Retenter' : 'Passer le QCM',
            urgence: 2,
            echeance: q.dateFermeture ?? '',
          });
        }
      }
      for (const a of m.ateliers) {
        if (a.nouveauFeedback) {
          elements.push({
            cle: `feedback-${a.id}`,
            libelle: `Lire le retour du formateur sur « ${a.titre} »`,
            detail: e.formation.titre,
            href: `/mes-ateliers/${a.id}`,
            action: 'Lire',
            urgence: 3,
            echeance: '',
          });
        }
        if (a.statutMonLivrable === null && (a.etatDepot === 'OUVERT' || a.etatDepot === 'EN_RETARD')) {
          elements.push({
            cle: `livrable-${a.id}`,
            libelle: `Rendre le livrable « ${a.titre} »`,
            detail: `${e.formation.titre} · ${a.etatDepot === 'EN_RETARD' ? 'en retard' : 'à rendre'}`,
            href: `/mes-ateliers/${a.id}`,
            action: 'Déposer',
            urgence: a.etatDepot === 'EN_RETARD' ? 1 : 2,
            echeance: a.dateLimite,
          });
        }
      }
    }
  }
  return trier(elements);
}

/** Formateur : livrables à corriger et tentatives à évaluer par formation, alertes ouvertes. */
export function aFaireFormateur(
  t: TableauDeBordFormateur,
  alertesSurveillance = 0,
): ElementAFaire[] {
  const elements: ElementAFaire[] = [];
  // US-QCM-15 : alertes de la surveillance par IA, avec leur photo.
  if (alertesSurveillance > 0) {
    elements.push({
      cle: 'surveillance',
      libelle: `Examiner ${pluriel(alertesSurveillance, 'alerte de surveillance', 'alertes de surveillance')}`,
      detail: 'Photos prises pendant les QCM',
      href: '/formateur/alertes/surveillance',
      action: 'Voir les photos',
      urgence: 0,
      echeance: '',
    });
  }
  for (const f of t.mesFormations) {
    if (f.livrablesAEvaluer > 0) {
      elements.push({
        cle: `livrables-${f.id}`,
        libelle: `Corriger ${pluriel(f.livrablesAEvaluer, 'livrable', 'livrables')}`,
        detail: f.titre,
        href: `/formateur/formations/${f.id}`,
        action: 'Corriger',
        urgence: 1,
        echeance: '',
      });
    }
    if (f.tentativesAEvaluer > 0) {
      elements.push({
        cle: `tentatives-${f.id}`,
        libelle: `Évaluer ${pluriel(f.tentativesAEvaluer, 'tentative', 'tentatives')} de QCM`,
        detail: f.titre,
        href: `/formateur/formations/${f.id}`,
        action: 'Évaluer',
        urgence: 1,
        echeance: '',
      });
    }
  }
  if (t.alertesOuvertes > 0) {
    elements.push({
      cle: 'alertes',
      libelle: `Traiter ${pluriel(t.alertesOuvertes, 'alerte de décrochage', 'alertes de décrochage')}`,
      detail: 'Apprenants inactifs ou en difficulté',
      href: '/formateur/alertes',
      action: 'Voir les alertes',
      urgence: 0,
      echeance: '',
    });
  }
  return trier(elements);
}

/** Administrateur : demandes en attente, alertes système (avec leur écran quand il existe). */
export function aFaireAdministrateur(t: TableauDeBordGlobal): ElementAFaire[] {
  const elements: ElementAFaire[] = [];
  const d = t.demandesEnAttente;
  const demandes: Array<[number, string, string, string, string]> = [
    [d.role, 'demande de rôle', 'demandes de rôle', '/admin/role-requests', 'role'],
    [d.affectation, 'demande d’affectation', 'demandes d’affectation', '/admin/demandes-affectation', 'affectation'],
    [d.propositions, 'proposition de formation', 'propositions de formation', '/admin/propositions-formation', 'propositions'],
  ];
  for (const [n, un, plusieurs, href, cle] of demandes) {
    if (n > 0) {
      elements.push({
        cle: `demandes-${cle}`,
        libelle: `Traiter ${pluriel(n, un, plusieurs)}`,
        detail: 'En attente de votre décision',
        href,
        action: 'Traiter',
        urgence: 1,
        echeance: '',
      });
    }
  }
  for (const a of t.alertes) {
    // Déjà couvert par la demande de rôle ci-dessus.
    if (a.code === 'DEMANDES_ROLE_EN_ATTENTE' || a.nombre <= 0) continue;
    const [libelle, lien] = LIBELLES_ALERTE_SYSTEME[a.code] ?? [a.code, ''];
    elements.push({
      cle: `alerte-${a.code}`,
      libelle: `Vérifier : ${a.nombre} ${libelle}`,
      detail: 'Alerte système',
      href: lien || '/admin/tableau-de-bord#alertes',
      action: lien ? 'Ouvrir' : 'Voir le détail',
      urgence: a.code === 'CERTIFICATS_BLOQUES' ? 0 : 2,
      echeance: '',
    });
  }
  return trier(elements);
}
