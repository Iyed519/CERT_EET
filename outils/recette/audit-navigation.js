#!/usr/bin/env node
/**
 * Cert_EET — US-QUAL-01 — Audit de navigation rejouable (Playwright).
 *
 * Pour chaque rôle (visiteur, apprenant, formateur, administrateur, compte
 * protégé par MFA) et chaque largeur (1280 et 390 px), parcourt TOUS les
 * liens internes atteignables depuis la page d'accueil du rôle, ses menus et
 * ses pages, puis clique chaque bouton sans effet destructeur. Signale :
 *   - lien vers une page inexistante (404) ;
 *   - page blanche (contenu principal vide) ;
 *   - erreur de page JavaScript ou erreur dans la console ;
 *   - réponse 5xx (ou 404 d'un appel à l'api) pendant la navigation ;
 *   - défilement horizontal (mise en page cassée) ;
 *   - bouton sans effet visible (ni navigation, ni modale, ni changement de la page) ;
 *   - page d'un autre rôle accessible sans redirection propre.
 *
 * Prérequis : la pile tourne (https://localhost par défaut) et le jeu de
 * démonstration est chargé (`npm run demo:charger` dans apps/api).
 *
 * Usage :
 *   cd outils/recette && npm ci
 *   CHROME=/chemin/vers/chrome node audit-navigation.js
 * Variables : BASE (https://localhost), CHROME (exécutable Chromium/Chrome ;
 * sinon le canal « chrome » installé), LARGEURS (1280,390), ROLES (liste),
 * MAX_PAGES (par rôle, 120), RAPPORT (fichier JSON du rapport).
 * Code de sortie : 0 si aucun problème, 1 sinon.
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { authenticator } = require('otplib');

const BASE = (process.env.BASE || 'https://localhost').replace(/\/$/, '');
const LARGEURS = (process.env.LARGEURS || '1280,390').split(',').map(Number);
const MAX_PAGES = Number(process.env.MAX_PAGES || 120);
const MOT_DE_PASSE = 'Demo_Passe123!';
const SECRET_MFA = 'JBSWY3DPEHPK3PXP';

const ROLES = {
  visiteur: { email: null, accueil: '/' },
  apprenant: { email: 'demo-apprenant@cert-eet.local', accueil: '/mon-espace' },
  formateur: { email: 'demo-formateur@cert-eet.local', accueil: '/formateur/tableau-de-bord' },
  administrateur: { email: 'demo-admin@cert-eet.local', accueil: '/admin/tableau-de-bord' },
  securite: { email: 'demo-securite@cert-eet.local', accueil: '/mon-espace', mfa: true },
};
const ROLES_CHOISIS = (process.env.ROLES || Object.keys(ROLES).join(',')).split(',');

/** Pages réservées à d'autres rôles : on doit être redirigé vers sa page de rôle (ou la connexion). */
const INTERDITES = {
  visiteur: ['/catalogue', '/mes-certificats', '/formateur/tableau-de-bord', '/admin/utilisateurs'],
  apprenant: ['/admin/utilisateurs', '/admin/tableau-de-bord', '/formateur/tableau-de-bord', '/rapports'],
  formateur: ['/admin/utilisateurs', '/admin/demandes-affectation', '/admin/propositions-formation', '/mon-espace'],
  administrateur: [],
  securite: ['/admin/audit', '/formateur/demandes'],
};

/** Liens jamais suivis : sortie de session, téléchargements, liens externes. */
const A_IGNORER = [/^\/api\//, /\/logout/, /^mailto:/, /^tel:/];
/** Boutons jamais cliqués : actions qui modifient des données ou la session. */
const BOUTONS_DANGEREUX =
  /supprim|archiv|clôtur|clotur|révoqu|revoqu|anonymis|désactiv|desactiv|réactiv|reactiv|déconnect|deconnect|refus|rejet|approuv|accept|publi|envoyer|valider|soumettre|démarrer|demarrer|terminer|finalis|enregistrer|importer|générer|generer|réémettre|reemettre|inscri|désinscri|desinscri|confirmer|appliquer|annuler la demande|rouvrir|mot de passe|mfa|activer|exporter|télécharger|telecharger|changer|modifier le rôle|demander des modifications|retirer|traiter|relancer|dupliquer|déposer|deposer|remplacer|corriger|noter|ajouter|créer|creer|affecter|fermer la session/i;

const problemes = [];
function signaler(contexte, type, detail) {
  problemes.push({ ...contexte, type, detail });
  console.log(`  ✗ [${contexte.role} ${contexte.largeur}px] ${type} — ${contexte.page ?? ''} ${detail}`);
}

function interne(href) {
  try {
    const u = new URL(href, BASE);
    if (u.origin !== new URL(BASE).origin) return null;
    const chemin = `${u.pathname}${u.search}`;
    if (A_IGNORER.some((r) => r.test(chemin))) return null;
    return chemin;
  } catch {
    return null;
  }
}

/** Clé de déduplication : un seul exemple par gabarit de route (identifiants remplacés). */
function gabarit(chemin) {
  return chemin
    .split('?')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');
}

async function connecter(page, role) {
  const r = ROLES[role];
  if (!r.email) return;
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#email');
  await page.fill('#email', r.email);
  await page.fill('#password', MOT_DE_PASSE);
  await page.click('button[type=submit]');
  if (r.mfa) {
    await page.waitForSelector('#code');
    await page.fill('#code', authenticator.generate(SECRET_MFA));
    await page.click('button[type=submit]');
  }
  await page.waitForSelector('.compte-bouton', { timeout: 15000 });
}

async function attendreStable(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function examinerPage(page, ctx) {
  const etat = await page.evaluate(() => {
    const main = document.querySelector('main.site-main') || document.body;
    const texte = (main.innerText || '').trim();
    return {
      texte: texte.length,
      introuvable: /could not be found|page introuvable|404/i.test(document.title + ' ' + texte.slice(0, 300)),
      debordement: document.documentElement.scrollWidth > window.innerWidth + 1,
      liens: Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')),
    };
  });
  if (etat.introuvable) signaler(ctx, 'PAGE_INEXISTANTE', '');
  else if (etat.texte < 15) signaler(ctx, 'PAGE_BLANCHE', `(${etat.texte} caractères)`);
  if (etat.debordement) signaler(ctx, 'DEFILEMENT_HORIZONTAL', '');
  return etat.liens;
}

/** Clique les boutons sûrs de la page et vérifie qu'ils produisent un effet. */
async function essayerBoutons(page, ctx, chemin) {
  const boutons = await page.$$eval('main button, header button', (els) =>
    els.map((b, i) => ({
      i,
      texte: (b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '),
      desactive: b.disabled,
      type: b.getAttribute('type') || 'submit',
      visible: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length),
      dansFormulaire: !!b.closest('form'),
      // Filtre déjà sélectionné : le recliquer ne change rien, c'est normal.
      enfonce: b.getAttribute('aria-pressed') === 'true',
    })),
  );
  let essais = 0;
  for (const b of boutons) {
    if (essais >= 12) break;
    if (!b.visible || b.desactive || b.enfonce || !b.texte || BOUTONS_DANGEREUX.test(b.texte)) continue;
    if (b.dansFormulaire && b.type === 'submit') continue;
    essais++;
    const avant = await page.evaluate(() => ({
      url: location.href,
      html: document.body.innerHTML.length,
      dialog: document.querySelectorAll('[role=dialog], [role=menu], .menu-mobile, .profil-overlay').length,
    }));
    let requetes = 0;
    const compter = () => requetes++;
    page.on('request', compter);
    try {
      await page.locator('main button, header button').nth(b.i).click({ timeout: 3000 });
    } catch {
      page.off('request', compter);
      continue;
    }
    await page.waitForTimeout(600);
    page.off('request', compter);
    const apres = await page.evaluate(() => ({
      url: location.href,
      html: document.body.innerHTML.length,
      dialog: document.querySelectorAll('[role=dialog], [role=menu], .menu-mobile, .profil-overlay').length,
    }));
    const effet = apres.url !== avant.url || apres.html !== avant.html || apres.dialog !== avant.dialog || requetes > 0;
    if (!effet) signaler({ ...ctx, page: chemin }, 'BOUTON_SANS_EFFET', `« ${b.texte} »`);
    // Remise à zéro : on revient sur la page d'origine.
    if (apres.url !== `${BASE}${chemin}` || apres.dialog > 0 || apres.html !== avant.html) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.goto(`${BASE}${chemin}`);
      await attendreStable(page);
    }
  }
}

async function auditer(navigateur, role, largeur) {
  console.log(`\n▶ ${role} — ${largeur}px`);
  const contexte = await navigateur.newContext({ ignoreHTTPSErrors: true, viewport: { width: largeur, height: 900 } });
  const page = await contexte.newPage();
  const ctx = { role, largeur, page: null };
  page.on('pageerror', (e) => signaler(ctx, 'ERREUR_JAVASCRIPT', String(e).slice(0, 200)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Les codes HTTP sont vérifiés par les réponses ci-dessous (avec l'URL).
    if (/Failed to load resource/.test(t)) return;
    signaler(ctx, 'ERREUR_CONSOLE', t.slice(0, 200));
  });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 500) signaler(ctx, 'ERREUR_SERVEUR', `${r.status()} ${u}`);
    else if (
      r.status() === 404 &&
      !u.endsWith('/page-qui-n-existe-pas') &&
      (u.includes('/api/') || r.request().resourceType() === 'document' || /favicon|icon/.test(u))
    ) {
      signaler(ctx, 'RESSOURCE_404', u);
    }
  });

  await connecter(page, role);
  const vues = new Set();
  const gabaritsVus = new Set();
  const file = [ROLES[role].accueil];
  let pages = 0;
  while (file.length && pages < MAX_PAGES) {
    const chemin = file.shift();
    if (vues.has(chemin)) continue;
    vues.add(chemin);
    const g = gabarit(chemin);
    if (gabaritsVus.has(g)) continue;
    gabaritsVus.add(g);
    pages++;
    ctx.page = chemin;
    const reponse = await page.goto(`${BASE}${chemin}`).catch(() => null);
    if (reponse && reponse.status() === 404) signaler(ctx, 'LIEN_MORT', '404');
    await attendreStable(page);
    const liens = await examinerPage(page, ctx);
    // Menu de compte et menu mobile : leurs liens comptent aussi.
    for (const sel of ['.compte-bouton', '.topbar-burger']) {
      if (await page.locator(sel).isVisible().catch(() => false)) {
        await page.click(sel).catch(() => {});
        liens.push(...(await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))));
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
    for (const l of liens) {
      const c = l && interne(l);
      if (c && !vues.has(c)) file.push(c);
    }
    await essayerBoutons(page, ctx, chemin);
  }
  console.log(`  ${pages} gabarits de pages parcourus`);
  if (process.env.VERBEUX) console.log(`  ${[...gabaritsVus].join('\n  ')}`);

  // Pages d'un autre rôle : redirection propre attendue.
  for (const chemin of INTERDITES[role] ?? []) {
    ctx.page = chemin;
    await page.goto(`${BASE}${chemin}`);
    await attendreStable(page);
    const arrivee = new URL(page.url()).pathname;
    const attendu = role === 'visiteur' ? '/login' : ROLES[role].accueil;
    if (arrivee !== attendu) signaler(ctx, 'ACCES_MAUVAIS_ROLE', `arrivé sur ${arrivee} (attendu ${attendu})`);
  }
  // Page inexistante : page « introuvable » propre, en français, avec un lien de retour.
  ctx.page = '/page-qui-n-existe-pas';
  await page.goto(`${BASE}/page-qui-n-existe-pas`);
  await attendreStable(page);
  const introuvable = await page.evaluate(() => ({
    fr: /introuvable/i.test(document.body.innerText),
    retour: !!document.querySelector('main a[href]'),
  }));
  if (!introuvable.fr || !introuvable.retour) signaler(ctx, 'PAGE_404_NON_TRAITEE', 'pas de page « introuvable » en français avec un lien de retour');
  await contexte.close();
  return pages;
}

(async () => {
  const navigateur = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    channel: process.env.CHROME ? undefined : 'chrome',
    args: ['--no-sandbox'],
  });
  let total = 0;
  for (const largeur of LARGEURS) {
    for (const role of ROLES_CHOISIS) total += await auditer(navigateur, role, largeur);
  }
  await navigateur.close();
  // Une même anomalie vue à plusieurs endroits n'est comptée qu'une fois par rôle et largeur.
  const uniques = [...new Map(problemes.map((p) => [`${p.role}|${p.largeur}|${p.type}|${p.page}|${p.detail}`, p])).values()];
  if (process.env.RAPPORT) fs.writeFileSync(process.env.RAPPORT, JSON.stringify(uniques, null, 2));
  console.log(`\n${total} pages parcourues ; ${uniques.length} problème(s).`);
  process.exit(uniques.length ? 1 : 0);
})();
