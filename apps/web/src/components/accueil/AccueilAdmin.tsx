'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TableauDeBordGlobal, getTableauDeBordGlobal } from '../../lib/api';
import { ICONES, Raccourci, Salutation, Tuile } from './elements';

/** Accueil de l'administrateur : chiffres clés et accès aux écrans. */
export function AccueilAdmin({ email }: { email: string }): JSX.Element {
  const [tdb, setTdb] = useState<TableauDeBordGlobal | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    getTableauDeBordGlobal()
      .then((t) => {
        if (!annule) setTdb(t);
      })
      .catch(() => {
        if (!annule) setErreur(true);
      });
    return () => {
      annule = true;
    };
  }, []);

  const alertes = tdb ? tdb.alertes.reduce((n, a) => n + a.nombre, 0) : null;
  const v = (n: number | undefined): number | string => (n === undefined ? '—' : n);

  return (
    <div className="accueil">
      <Salutation email={email} role="ADMINISTRATEUR" texte="Vue d’ensemble de la plateforme et accès rapide à l’administration.">
        <Link href="/admin/tableau-de-bord" className="bouton bouton-plein">
          Tableau de bord complet
        </Link>
      </Salutation>

      {erreur && <p className="alert alert-error">Impossible de charger les chiffres clés.</p>}

      <div className="tuiles">
        <Tuile valeur={v(tdb?.utilisateurs.total)} libelle="Utilisateurs" href="/admin/utilisateurs" />
        <Tuile valeur={v(tdb?.formations.total)} libelle="Formations" href="/admin/formations" />
        <Tuile valeur={v(tdb?.inscriptions.total)} libelle="Inscriptions" href="/admin/tableau-de-bord" />
        <Tuile valeur={v(tdb?.certificats.emis)} libelle="Certificats émis" href="/admin/certificats" />
        <Tuile
          valeur={alertes === null ? '—' : alertes}
          libelle="Alertes système"
          href="/admin/tableau-de-bord"
          ton={alertes ? 'alerte' : undefined}
        />
      </div>

      <section className="accueil-section" aria-labelledby="admin-titre">
        <h2 id="admin-titre" className="accueil-section-titre">
          Administration
        </h2>
        <div className="raccourcis">
          <Raccourci
            href="/admin/utilisateurs"
            titre="Utilisateurs"
            texte="Comptes, rôles et statuts."
            icone={ICONES.utilisateurs}
          />
          <Raccourci
            href="/admin/role-requests"
            titre="Demandes de rôle"
            texte="Approuver ou refuser les demandes."
            icone={ICONES.demande}
          />
          <Raccourci
            href="/admin/formations"
            titre="Formations"
            texte="Catalogue, modules, formateurs, inscriptions."
            icone={ICONES.formation}
          />
          <Raccourci
            href="/admin/certificats"
            titre="Certificats"
            texte="Émission, échecs, révocation."
            icone={ICONES.certificat}
          />
          <Raccourci
            href="/admin/rapports"
            titre="Rapports"
            texte="Exports PDF et CSV."
            icone={ICONES.rapport}
          />
          <Raccourci
            href="/admin/generations-ia"
            titre="Générations IA"
            texte="Traçabilité des générations de questions."
            icone={ICONES.ia}
          />
          <Raccourci
            href="/admin/audit"
            titre="Journal d’audit"
            texte="Toutes les actions sensibles, filtrables."
            icone={ICONES.audit}
          />
          <Raccourci
            href="/admin/tableau-de-bord"
            titre="Tableau de bord"
            texte="Activité, évaluations, alertes."
            icone={ICONES.tableau}
          />
        </div>
      </section>
    </div>
  );
}
