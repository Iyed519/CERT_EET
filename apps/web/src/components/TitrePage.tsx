'use client';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

/** Une miette ajoutée par une page profonde (sans `href` : la page courante). */
export interface Miette {
  href?: string;
  libelle: string;
}

const Contexte = createContext<{ miettes: Miette[]; definir: (m: Miette[]) => void }>({
  miettes: [],
  definir: () => undefined,
});

/** US-UI-04 — Porte les miettes déclarées par la page affichée. */
export function MiettesProvider({ children }: { children: ReactNode }): JSX.Element {
  const [miettes, definir] = useState<Miette[]>([]);
  return <Contexte.Provider value={{ miettes, definir }}>{children}</Contexte.Provider>;
}

export function useMiettesCourantes(): Miette[] {
  return useContext(Contexte).miettes;
}

/**
 * US-UI-04 — Une page profonde déclare la suite de son fil d'Ariane (après
 * « Accueil › Section ») ; effacée quand la page disparaît.
 */
export function useMiettes(miettes: Miette[] | null): void {
  const { definir } = useContext(Contexte);
  const cle = JSON.stringify(miettes ?? []);
  useEffect(() => {
    definir(JSON.parse(cle) as Miette[]);
    return () => definir([]);
  }, [cle, definir]);
}
