// The CLIF consortium sites the public site draws: one list, so every count of
// sites (Home band and lede) reads the same number. Copied from CLIF's own cohort
// page, clif-icu.com/cohort (read 2026-11-04; Nick's ruling the same day).

export interface CLIFSite {
  name: string
  short: string
  city: string
  region: 'West' | 'Midwest' | 'Northeast' | 'Southeast' | 'Canada'
  isHome?: boolean
}

export const CLIF_SITES: CLIFSite[] = [
  { name: 'University of Minnesota',      short: 'UMN',     city: 'Minneapolis, MN',     region: 'Midwest', isHome: true },
  { name: 'University of Chicago',         short: 'UChicago', city: 'Chicago, IL',         region: 'Midwest' },
  { name: 'Rush University',               short: 'Rush',    city: 'Chicago, IL',         region: 'Midwest' },
  { name: 'Northwestern University',       short: 'Northwestern', city: 'Chicago, IL',    region: 'Midwest' },
  { name: 'University of Michigan',        short: 'Michigan', city: 'Ann Arbor, MI',      region: 'Midwest' },
  { name: 'Oregon Health & Science',       short: 'OHSU',    city: 'Portland, OR',        region: 'West' },
  { name: 'University of California, San Francisco', short: 'UCSF', city: 'San Francisco, CA', region: 'West' },
  { name: 'University of Pennsylvania',    short: 'Penn',    city: 'Philadelphia, PA',    region: 'Northeast' },
  { name: 'Johns Hopkins University',      short: 'Hopkins', city: 'Baltimore, MD',       region: 'Northeast' },
  { name: 'Weill Cornell Medicine',        short: 'Cornell', city: 'New York, NY',        region: 'Northeast' },
  { name: 'MIMIC (Beth Israel Deaconess)', short: 'MIMIC',   city: 'Boston, MA',          region: 'Northeast' },
  { name: 'Emory University',              short: 'Emory',   city: 'Atlanta, GA',         region: 'Southeast' },
  { name: 'Sunnybrook Health Sciences',    short: 'Sunnybrook', city: 'Toronto, ON',      region: 'Canada' },
]
