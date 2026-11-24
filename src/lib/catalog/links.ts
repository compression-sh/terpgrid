import type { CatalogStrain, ProviderId } from './types';

/** Interne Route zur Detailseite einer Katalogsorte – je nach Quelle. */
export function externalLink(provider: ProviderId, id: string): string | undefined {
  if (provider === 'strainapi') return `discover/strain/${id}`;
  if (provider === 'cisp') return `discover/cultivar/${id}`;
  return undefined;
}

/** Genetics Explorer für eine Katalogsorte. */
export function geneticsLink(provider: ProviderId, id: string): string | undefined {
  if (provider === 'strainapi') return `discover/genetics/${id}`;
  if (provider === 'cisp') return `discover/genetics/c/${id}`;
  return undefined;
}

export const strainLink = (s: Pick<CatalogStrain, 'provider' | 'id'>) => externalLink(s.provider, s.id) ?? 'discover';

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  strainapi: 'StrainAPI',
  cannalib: 'CannaLib',
  cisp: 'CI-Strains-Pro',
};
