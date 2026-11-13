import { Role } from '../../database/enums/role.enum';
import { pageAccueilDuRole } from './page-accueil-role';

describe('pageAccueilDuRole (US-NAV-01)', () => {
  it('donne la page de chaque rôle, identique au web', () => {
    expect(pageAccueilDuRole(Role.ADMINISTRATEUR)).toBe('/admin/tableau-de-bord');
    expect(pageAccueilDuRole(Role.FORMATEUR)).toBe('/formateur/tableau-de-bord');
    expect(pageAccueilDuRole(Role.APPRENANT)).toBe('/mon-espace');
  });

  it('couvre tous les rôles par un chemin interne', () => {
    for (const role of Object.values(Role)) {
      expect(pageAccueilDuRole(role)).toMatch(/^\/[a-z]/);
    }
  });
});
