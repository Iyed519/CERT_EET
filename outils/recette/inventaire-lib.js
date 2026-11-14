/**
 * Cert_EET — US-UX-01 — Logique pure de l'inventaire des actions.
 *
 * Utilisée par `inventaire-actions.js` (relevé dans le navigateur) et par
 * `comparer-inventaires.js` (garde-fou de l'épopée E11 : « aucune action
 * perdue, au plus un clic de plus »). Aucune dépendance : testée par
 * `node --test inventaire-lib.test.js`.
 */

/** Libellé lisible et stable : espaces réduits, nombres remplacés par « # ». */
function normaliserLibelle(texte) {
  return String(texte ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .trim();
}

/** Clé de comparaison d'un libellé : normalisé, en minuscules, apostrophes unifiées. */
function cleLibelle(texte) {
  return normaliserLibelle(texte).toLowerCase().replace(/[’`]/g, "'");
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Gabarit d'une adresse interne : identifiants remplacés par « :id », sans requête ni ancre. */
function gabarit(chemin) {
  if (!chemin) return null;
  return String(chemin).split('#')[0].split('?')[0].replace(UUID, ':id').replace(/\/$/, '') || '/';
}

/**
 * Index d'un inventaire pour un rôle : pour chaque page (gabarit), ses actions
 * et les pages atteignables en un clic (liens de la page, profondeur 0).
 */
function indexer(pages) {
  const index = new Map();
  for (const [chemin, page] of Object.entries(pages ?? {})) {
    const voisins = new Set();
    for (const a of page.actions ?? []) {
      if (a.href && (a.profondeur ?? 0) === 0) {
        const g = gabarit(a.href);
        if (g && g !== chemin) voisins.add(g);
      }
    }
    index.set(chemin, { actions: page.actions ?? [], voisins });
  }
  return index;
}

/** Deux actions sont-elles « la même » ? Même libellé, même destination, ou équivalence documentée. */
function correspond(avant, apres, equivalences) {
  const ka = cleLibelle(avant.libelle);
  const kp = cleLibelle(apres.libelle);
  if (ka && ka === kp) return true;
  if (avant.href && apres.href && gabarit(avant.href) === gabarit(apres.href)) return true;
  const eq = equivalences?.[ka];
  if (eq) {
    const cibles = (Array.isArray(eq) ? eq : [eq]).map(cleLibelle);
    if (cibles.includes(kp)) return true;
  }
  return false;
}

/**
 * Coût minimal (en clics) pour atteindre une action « avant » dans l'inventaire
 * « après », depuis la même page : profondeur sur la page elle-même, ou 1 +
 * profondeur sur une page liée directement. `null` si elle n'est pas dans ce
 * voisinage.
 */
function coutApres(chemin, action, indexApres, equivalences) {
  const page = indexApres.get(chemin);
  if (!page) return null;
  let meilleur = null;
  const essayer = (actions, base) => {
    for (const a of actions) {
      if (correspond(action, a, equivalences)) {
        const c = base + (a.profondeur ?? 0);
        if (meilleur === null || c < meilleur) meilleur = c;
      }
    }
  };
  essayer(page.actions, 0);
  for (const v of page.voisins) {
    const pv = indexApres.get(v);
    if (pv) essayer(pv.actions, 1);
  }
  return meilleur;
}

/** L'action existe-t-elle quelque part dans l'inventaire « après » du rôle ? */
function existeAilleurs(action, indexApres, equivalences) {
  for (const [chemin, page] of indexApres) {
    if (page.actions.some((a) => correspond(action, a, equivalences))) return chemin;
  }
  return null;
}

/**
 * Compare deux inventaires (même forme que la sortie de inventaire-actions.js).
 * Pour chaque rôle et chaque action « avant » (dédupliquée par page) :
 *   - « conservee » : atteinte au plus à un clic de plus, depuis la même page ;
 *   - « plus-loin » : atteinte depuis la même page, mais à plus d'un clic de plus ;
 *   - « deplacee »  : présente ailleurs dans l'espace du rôle, pas depuis la même page ;
 *   - « perdue »    : introuvable.
 * Une page « avant » absente de l'inventaire « après » est signalée.
 */
function comparer(avant, apres, equivalences = {}) {
  const resultat = { roles: {}, perdues: 0, plusLoin: 0, deplacees: 0, conservees: 0, pagesDisparues: 0 };
  const eq = {};
  for (const [k, v] of Object.entries(equivalences)) eq[cleLibelle(k)] = v;
  for (const [role, inv] of Object.entries(avant.roles ?? {})) {
    const indexApres = indexer(apres.roles?.[role]?.pages);
    const r = { perdues: [], plusLoin: [], deplacees: [], conservees: 0, pagesDisparues: [] };
    for (const [chemin, page] of Object.entries(inv.pages ?? {})) {
      if (!indexApres.has(chemin)) r.pagesDisparues.push(chemin);
      const vues = new Set();
      for (const action of page.actions ?? []) {
        const cle = `${cleLibelle(action.libelle)}|${gabarit(action.href) ?? ''}`;
        if (vues.has(cle)) continue;
        vues.add(cle);
        const cout = coutApres(chemin, action, indexApres, eq);
        const base = action.profondeur ?? 0;
        if (cout !== null && cout <= base + 1) r.conservees++;
        else if (cout !== null) r.plusLoin.push({ page: chemin, ...action, avant: base, apres: cout });
        else {
          const ailleurs = existeAilleurs(action, indexApres, eq);
          if (ailleurs) r.deplacees.push({ page: chemin, ...action, ailleurs });
          else r.perdues.push({ page: chemin, ...action });
        }
      }
    }
    resultat.roles[role] = r;
    resultat.perdues += r.perdues.length;
    resultat.plusLoin += r.plusLoin.length;
    resultat.deplacees += r.deplacees.length;
    resultat.conservees += r.conservees;
    resultat.pagesDisparues += r.pagesDisparues.length;
  }
  return resultat;
}

/** Rapport Markdown d'une comparaison. */
function rapportMarkdown(cmp) {
  const l = [];
  l.push('# Inventaire des actions — comparaison avant / après', '');
  l.push(
    `Conservées : **${cmp.conservees}** · plus d'un clic de plus : **${cmp.plusLoin}** · déplacées : **${cmp.deplacees}** · perdues : **${cmp.perdues}** · pages disparues : **${cmp.pagesDisparues}**`,
    '',
  );
  const ligne = (a) => `- \`${a.page}\` — [${a.type}] « ${a.libelle} »${a.contexte ? ` (${a.contexte})` : ''}`;
  for (const [role, r] of Object.entries(cmp.roles)) {
    l.push(`## ${role}`, '', `Conservées : ${r.conservees}.`, '');
    if (r.perdues.length) l.push('### Perdues', '', ...r.perdues.map(ligne), '');
    if (r.plusLoin.length)
      l.push('### Plus d’un clic de plus', '', ...r.plusLoin.map((a) => `${ligne(a)} : ${a.avant} → ${a.apres} clic(s)`), '');
    if (r.deplacees.length)
      l.push('### Déplacées (présentes ailleurs)', '', ...r.deplacees.map((a) => `${ligne(a)} → \`${a.ailleurs}\``), '');
    if (r.pagesDisparues.length) l.push('### Pages non atteintes', '', ...r.pagesDisparues.map((p) => `- \`${p}\``), '');
  }
  return `${l.join('\n')}\n`;
}

/** Résumé Markdown d'un inventaire : chaque page et ses actions, par rôle. */
function resumeMarkdown(inv) {
  const l = ['# Inventaire des actions', '', `Relevé le ${inv.genere} sur ${inv.base} (jeu de démonstration).`, ''];
  for (const [role, r] of Object.entries(inv.roles ?? {})) {
    const pages = Object.entries(r.pages ?? {});
    const total = pages.reduce((n, [, p]) => n + (p.actions?.length ?? 0), 0);
    l.push(`## ${role} — ${pages.length} pages, ${total} actions`, '');
    for (const [chemin, p] of pages) {
      l.push(`### \`${chemin}\`${p.titre ? ` — ${p.titre}` : ''}`, '');
      for (const a of p.actions ?? []) {
        const ou = a.profondeur ? ` _(${a.contexte ?? 'un clic'})_` : '';
        l.push(`- [${a.type}] ${a.libelle}${a.href ? ` → \`${gabarit(a.href)}\`` : ''}${ou}`);
      }
      l.push('');
    }
  }
  return `${l.join('\n')}\n`;
}

module.exports = {
  normaliserLibelle,
  cleLibelle,
  gabarit,
  indexer,
  correspond,
  coutApres,
  comparer,
  rapportMarkdown,
  resumeMarkdown,
};
