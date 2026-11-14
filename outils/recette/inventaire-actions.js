#!/usr/bin/env node
/**
 * Cert_EET — US-UX-01 — Inventaire des actions de l'interface (Playwright).
 *
 * Pour chaque rôle choisi (formateur et administrateur par défaut), parcourt
 * toutes les pages atteignables depuis l'accueil du rôle, l'en-tête et le menu
 * du compte (un exemple par gabarit d'adresse, comme audit-navigation.js), et
 * relève chaque action visible : liens, boutons, onglets, éléments de menu,
 * listes de choix et volets dépliables. Puis, sans rien modifier, il ouvre :
 *   - chaque onglet (`[role=tab]`) qui ne change pas d'adresse ;
 *   - chaque menu (`[aria-haspopup]`, `[aria-expanded=false]`, `<summary>`) ;
 *   - chaque fenêtre ouverte par un bouton sans effet destructeur
 *     (même liste noire que l'audit) ;
 * et relève les actions qui y apparaissent, avec une profondeur de 1 (un clic).
 *
 * Sortie : JSON (INVENTAIRE, défaut docs/ux/inventaire.json) + résumé Markdown
 * à côté. Le fichier « avant » de l'épopée E11 est docs/ux/inventaire-avant.json ;
 * `comparer-inventaires.js` compare deux relevés.
 *
 * Usage :
 *   cd outils/recette && npm ci
 *   INVENTAIRE=../../docs/ux/inventaire-avant.json node inventaire-actions.js
 * Variables : BASE (https://localhost), CHROME, ROLES (formateur,administrateur),
 * LARGEUR (1280), MAX_PAGES (150 par rôle), INVENTAIRE (fichier de sortie).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { normaliserLibelle, gabarit, resumeMarkdown } = require('./inventaire-lib');

const BASE = (process.env.BASE || 'https://localhost').replace(/\/$/, '');
const LARGEUR = Number(process.env.LARGEUR || 1280);
const MAX_PAGES = Number(process.env.MAX_PAGES || 150);
const SORTIE = process.env.INVENTAIRE || path.join(__dirname, '../../docs/ux/inventaire.json');
const MOT_DE_PASSE = 'Demo_Passe123!';

const ROLES = {
  formateur: { email: 'demo-formateur@cert-eet.local', accueil: '/formateur/tableau-de-bord' },
  administrateur: { email: 'demo-admin@cert-eet.local', accueil: '/admin/tableau-de-bord' },
  apprenant: { email: 'demo-apprenant@cert-eet.local', accueil: '/mon-espace' },
};
const ROLES_CHOISIS = (process.env.ROLES || 'formateur,administrateur').split(',');

const A_IGNORER = [/^\/api\//, /\/logout/, /^mailto:/, /^tel:/];
/** Même liste noire que audit-navigation.js : ces boutons ne sont jamais cliqués. */
const BOUTONS_DANGEREUX =
  /supprim|archiv|clôtur|clotur|révoqu|revoqu|anonymis|désactiv|desactiv|réactiv|reactiv|déconnect|deconnect|refus|rejet|approuv|accept|publi|envoyer|valider|soumettre|démarrer|demarrer|terminer|finalis|enregistrer|importer|générer|generer|réémettre|reemettre|inscri|désinscri|desinscri|confirmer|appliquer|annuler la demande|rouvrir|mot de passe|mfa|activer|exporter|télécharger|telecharger|changer|modifier le rôle|demander des modifications|retirer|traiter|relancer|dupliquer|déposer|deposer|remplacer|corriger|noter|ajouter|créer|creer|affecter|fermer la session|marquer|examiner|monter|descendre/i;

const SEL_DIALOGUE = '[role=dialog], [role=alertdialog], .profil-overlay';

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

async function connecter(page, role) {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('#email');
  await page.fill('#email', ROLES[role].email);
  await page.fill('#password', MOT_DE_PASSE);
  await page.click('button[type=submit]');
  await page.waitForSelector('.compte-bouton', { timeout: 20000 });
}

async function attendreStable(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * Actions visibles dans une portée (sélecteur CSS), hors portées exclues.
 * Chaque élément reçoit un attribut data-inv (numéro) pour pouvoir être cliqué ensuite.
 */
async function relever(page, portee, exclure) {
  return page.evaluate(
    ({ portee, exclure }) => {
      const racines = Array.from(document.querySelectorAll(portee));
      const visibles = (el) => {
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none') return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      };
      const libelleDe = (el) => {
        let t = (el.innerText || '').trim();
        if (!t) t = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        if (el.tagName === 'SELECT') {
          const id = el.id;
          const lab = (id && document.querySelector(`label[for="${id}"]`)) || el.closest('label');
          let texteLabel = '';
          if (lab) {
            const copie = lab.cloneNode(true);
            copie.querySelectorAll('select, option').forEach((o) => o.remove());
            texteLabel = copie.textContent || '';
          }
          t = el.getAttribute('aria-label') || texteLabel || el.name || 'liste';
        }
        if (el.tagName === 'INPUT') {
          const id = el.id;
          const lab = id ? document.querySelector(`label[for="${id}"]`) : null;
          t = el.getAttribute('aria-label') || (lab ? lab.innerText : '') || el.placeholder || el.name || 'champ';
        }
        return t;
      };
      const typeDe = (el) => {
        const r = el.getAttribute('role');
        if (r === 'tab') return 'onglet';
        if (r === 'menuitem') return 'menu';
        if (el.tagName === 'A') return 'lien';
        if (el.tagName === 'SUMMARY') return 'volet';
        if (el.tagName === 'SELECT') return 'liste';
        if (el.tagName === 'INPUT') return 'recherche';
        return 'bouton';
      };
      const vus = [];
      let n = Number(document.body.dataset.invCompteur || 0);
      for (const racine of racines) {
        const els = racine.querySelectorAll(
          'a[href], button, [role=tab], [role=menuitem], summary, select, input[type=search]',
        );
        for (const el of els) {
          if (exclure && el.closest(exclure)) continue;
          if (!visibles(el)) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          const libelle = libelleDe(el).replace(/\s+/g, ' ').trim();
          if (!libelle) continue;
          if (!el.dataset.inv) el.dataset.inv = String(++n);
          vus.push({
            id: el.dataset.inv,
            type: typeDe(el),
            libelle,
            href: el.tagName === 'A' ? el.getAttribute('href') : undefined,
            menu:
              el.getAttribute('aria-haspopup') === 'menu' ||
              el.getAttribute('aria-haspopup') === 'true' ||
              el.getAttribute('aria-expanded') === 'false' ||
              (el.tagName === 'SUMMARY' && !el.parentElement.open),
            selectionne: el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true',
            desactive: !!el.disabled,
            dansFormulaireSubmit: !!el.closest('form') && el.tagName === 'BUTTON' && (el.getAttribute('type') || 'submit') === 'submit',
          });
        }
      }
      document.body.dataset.invCompteur = String(n);
      return vus;
    },
    { portee, exclure },
  );
}

function versAction(e, profondeur, contexte) {
  const a = { type: e.type, libelle: normaliserLibelle(e.libelle) };
  if (e.href) a.href = interne(e.href) ?? e.href;
  if (profondeur) a.profondeur = profondeur;
  if (contexte) a.contexte = contexte;
  return a;
}

async function etatPage(page) {
  return page.evaluate((sel) => ({ url: location.href, dialogues: document.querySelectorAll(sel).length }), SEL_DIALOGUE);
}

/** Relevé complet d'une page : actions visibles, puis onglets, menus et fenêtres (un clic). */
async function inventorierPage(page, chemin) {
  const actions = [];
  const cles = new Set();
  const ajouter = (e, profondeur, contexte) => {
    const a = versAction(e, profondeur, contexte);
    const cle = `${a.type}|${a.libelle}|${a.href ? gabarit(a.href) : ''}`;
    if (cles.has(cle)) return false;
    cles.add(cle);
    actions.push(a);
    return true;
  };
  const exclureCoque = 'header.topbar, footer, .fil-ariane';
  const initiaux = await relever(page, 'body', exclureCoque);
  for (const e of initiaux) ajouter(e, 0);

  const recharger = async () => {
    await page.goto(`${BASE}${chemin}`);
    await attendreStable(page);
  };

  // Un exemplaire par libellé : les lignes d'une liste portent les mêmes boutons.
  const dejaEssayes = new Set();
  const candidats = initiaux.filter((e) => {
    if (e.desactive || e.type === 'lien' || e.type === 'liste' || e.type === 'recherche') return false;
    const k = `${e.type}|${normaliserLibelle(e.libelle)}`;
    if (dejaEssayes.has(k)) return false;
    dejaEssayes.add(k);
    if (e.type === 'onglet') return !e.selectionne;
    if (e.menu) return true;
    if (e.dansFormulaireSubmit) return false;
    return !BOUTONS_DANGEREUX.test(e.libelle);
  });

  let essais = 0;
  for (const c of candidats) {
    if (essais >= 40) break;
    essais++;
    let loc = page.locator(`[data-inv="${c.id}"]`);
    if (!(await loc.count())) {
      // La page a été rechargée ou redessinée : on retrouve l'élément par son type et son libellé.
      const frais = await relever(page, 'body', exclureCoque);
      const meme = frais.find((e) => e.type === c.type && normaliserLibelle(e.libelle) === normaliserLibelle(c.libelle));
      if (!meme) continue;
      loc = page.locator(`[data-inv="${meme.id}"]`);
    }
    const avant = await etatPage(page);
    try {
      await loc.first().click({ timeout: 3000 });
    } catch {
      continue;
    }
    await page.waitForTimeout(500);
    await attendreStable(page);
    const apres = await etatPage(page);
    if (apres.url !== avant.url) {
      // Bouton qui navigue : la page d'arrivée sera parcourue pour elle-même.
      const dest = interne(apres.url);
      if (dest) actions.push({ type: c.type, libelle: normaliserLibelle(c.libelle), href: dest, navigue: true });
      await recharger();
      continue;
    }
    const dialogue = apres.dialogues > avant.dialogues;
    const contexte = dialogue
      ? `fenêtre « ${normaliserLibelle(c.libelle)} »`
      : c.type === 'onglet'
        ? `onglet « ${normaliserLibelle(c.libelle)} »`
        : c.menu
          ? `menu « ${normaliserLibelle(c.libelle)} »`
          : `après « ${normaliserLibelle(c.libelle)} »`;
    const nouveaux = await relever(page, dialogue ? SEL_DIALOGUE : 'body', exclureCoque);
    for (const e of nouveaux) ajouter(e, 1, contexte);
    if (dialogue || c.menu) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(200);
      const encore = await etatPage(page);
      if (encore.dialogues > avant.dialogues) await recharger();
    } else if (c.type !== 'onglet') {
      await recharger();
    }
  }
  const titre = await page
    .evaluate(() => (document.querySelector('main h1')?.innerText || '').trim())
    .catch(() => '');
  return { titre, actions };
}

/** Coque : navigation de l'en-tête et menu du compte. */
async function inventorierCoque(page) {
  const actions = [];
  const nav = await relever(page, 'header.topbar, aside.nav-laterale', null);
  for (const e of nav) actions.push(versAction(e, 0));
  if (await page.locator('.compte-bouton').isVisible().catch(() => false)) {
    await page.click('.compte-bouton');
    await page.waitForTimeout(300);
    const menu = await relever(page, '.compte-menu', null);
    for (const e of menu) actions.push(versAction(e, 1, 'menu du compte'));
    await page.keyboard.press('Escape').catch(() => {});
  }
  return { titre: 'En-tête et menus', actions };
}

async function inventorierRole(navigateur, role) {
  console.log(`\n▶ ${role}`);
  const contexte = await navigateur.newContext({ ignoreHTTPSErrors: true, viewport: { width: LARGEUR, height: 900 } });
  const page = await contexte.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await connecter(page, role);
  await page.goto(`${BASE}${ROLES[role].accueil}`);
  await attendreStable(page);
  const pages = { '(coque)': await inventorierCoque(page) };
  const file = [ROLES[role].accueil, ...pages['(coque)'].actions.filter((a) => a.href).map((a) => a.href)];
  const vus = new Set();
  let n = 0;
  while (file.length && n < MAX_PAGES) {
    const chemin = file.shift();
    const c = chemin && interne(chemin);
    if (!c) continue;
    const g = gabarit(c);
    if (vus.has(g)) continue;
    vus.add(g);
    const reponse = await page.goto(`${BASE}${c}`).catch(() => null);
    if (!reponse || reponse.status() >= 400) continue;
    await attendreStable(page);
    // Page d'un autre rôle : redirigé vers sa propre page, on ne la compte pas.
    const arrivee = gabarit(interne(page.url()) ?? '');
    if (arrivee !== g) continue;
    n++;
    const releve = await inventorierPage(page, c);
    pages[g] = { exemple: c, ...releve };
    console.log(`  ${g} — ${releve.actions.length} actions`);
    for (const a of releve.actions) if (a.href) file.push(a.href);
  }
  await contexte.close();
  return { accueil: ROLES[role].accueil, pages };
}

(async () => {
  const navigateur = await chromium.launch({
    executablePath: process.env.CHROME || undefined,
    channel: process.env.CHROME ? undefined : 'chrome',
    args: ['--no-sandbox'],
  });
  const inventaire = { genere: new Date().toISOString().slice(0, 10), base: BASE, largeur: LARGEUR, roles: {} };
  for (const role of ROLES_CHOISIS) inventaire.roles[role] = await inventorierRole(navigateur, role);
  await navigateur.close();
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, `${JSON.stringify(inventaire, null, 2)}\n`);
  fs.writeFileSync(SORTIE.replace(/\.json$/, '.md'), resumeMarkdown(inventaire));
  const total = Object.values(inventaire.roles).reduce(
    (t, r) => t + Object.values(r.pages).reduce((n, p) => n + p.actions.length, 0),
    0,
  );
  console.log(`\nInventaire écrit dans ${SORTIE} : ${total} actions.`);
})();
