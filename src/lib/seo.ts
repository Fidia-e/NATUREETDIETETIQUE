import { contact, practitioner, site } from '../config';

/*
 * Donnees structurees (schema.org, au format JSON-LD).
 * Elles disent a Google, sans qu'il ait a deviner, qui est derriere le site,
 * ou il se trouve et qui ecrit les articles. C'est ce qui nourrit la fiche
 * locale, les fils d'Ariane dans les resultats et l'attribution des articles.
 *
 * Chaque entite porte un identifiant (@id) stable : les articles s'y referent
 * au lieu de tout redecrire.
 */

/** Adresse absolue d'un chemin du site. */
export const absolute = (path: string, base: URL | string) => new URL(path, base).href;

export const ids = (base: URL | string) => ({
  website: absolute('/#site', base),
  business: absolute('/#cabinet', base),
  person: absolute('/mon-histoire/#florie', base),
});

/** Le site, le cabinet et la praticienne : presents sur toutes les pages. */
export function siteGraph(base: URL | string) {
  const id = ids(base);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': id.website,
        url: absolute('/', base),
        name: site.name,
        description: site.description,
        inLanguage: 'fr-CH',
        publisher: { '@id': id.business },
      },
      {
        // Sous-type de LocalBusiness : c'est lui qui alimente la recherche locale
        '@type': 'HealthAndBeautyBusiness',
        '@id': id.business,
        name: site.name,
        url: absolute('/', base),
        logo: absolute('/images/logo-nature-et-dietetique.png', base),
        image: absolute('/images/florie-portrait.jpg', base),
        description: site.description,
        telephone: contact.phone,
        email: contact.email,
        address: {
          '@type': 'PostalAddress',
          streetAddress: contact.address.street,
          postalCode: contact.address.zip.replace(/^CH-/, ''),
          addressLocality: contact.address.city,
          addressRegion: contact.address.canton,
          addressCountry: 'CH',
        },
        areaServed: { '@type': 'AdministrativeArea', name: `Canton de ${contact.address.canton}` },
        founder: { '@id': id.person },
      },
      {
        '@type': 'Person',
        '@id': id.person,
        name: practitioner.fullName,
        url: absolute('/mon-histoire/', base),
        image: absolute('/images/florie-portrait.jpg', base),
        worksFor: { '@id': id.business },
      },
    ],
  };
}

/** Fil d'Ariane, du plus general au plus precis. */
export function breadcrumb(base: URL | string, items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(item.path, base),
    })),
  };
}

/**
 * Serialise pour une balise <script type="application/ld+json">.
 * `<` est echappe : un titre contenant « </script> » ne peut pas fermer la
 * balise avant l'heure.
 */
export const toJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
