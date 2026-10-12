// The CLIF consortium sites the public site draws: one list, so the map and every
// count of sites (Home band, /network) read the same number.

export interface CLIFSite {
  name: string
  short: string
  city: string
  region: 'West' | 'Midwest' | 'Northeast' | 'Southeast'
  isHome?: boolean
}

export const CLIF_SITES: CLIFSite[] = [
  { name: 'University of Minnesota',      short: 'UMN',     city: 'Minneapolis, MN',     region: 'Midwest', isHome: true },
  { name: 'University of Chicago',         short: 'UChicago', city: 'Chicago, IL',         region: 'Midwest' },
  { name: 'Rush University',               short: 'Rush',    city: 'Chicago, IL',         region: 'Midwest' },
  { name: 'Northwestern University',       short: 'Northwestern', city: 'Chicago, IL',    region: 'Midwest' },
  { name: 'Loyola University',             short: 'Loyola',  city: 'Maywood, IL',         region: 'Midwest' },
  { name: 'University of Michigan',        short: 'Michigan', city: 'Ann Arbor, MI',      region: 'Midwest' },
  { name: 'University of Colorado',        short: 'Colorado', city: 'Denver, CO',         region: 'West' },
  { name: 'Oregon Health & Science',       short: 'OHSU',    city: 'Portland, OR',        region: 'West' },
  { name: 'University of Washington',      short: 'UW',      city: 'Seattle, WA',         region: 'West' },
  { name: 'University of Pennsylvania',    short: 'Penn',    city: 'Philadelphia, PA',    region: 'Northeast' },
  { name: 'Johns Hopkins University',      short: 'Hopkins', city: 'Baltimore, MD',       region: 'Northeast' },
  { name: 'Beth Israel Deaconess',         short: 'BIDMC',   city: 'Boston, MA',          region: 'Northeast' },
  { name: 'Emory University',              short: 'Emory',   city: 'Atlanta, GA',         region: 'Southeast' },
]
