'use strict';
// Rejects postings the candidate cannot apply to from Brazil. Each source
// exposes location differently, so the check is per source first and then
// looks at the description for "US only"-style phrases.

const { firstTerm } = require('./text');

/**
 * @returns {string | null} the rejection reason, or null when the location is acceptable
 */
function locationReject(job, config) {
  const location = (job.location || '').toLowerCase();
  const description = (job.description || '').toLowerCase();

  const bySource = sourceSpecificReject(job, location, config);
  if (bySource) return bySource;

  const restriction = firstTerm(description, config.locationBad);
  if (restriction) return `description says "${restriction}"`;

  return null;
}

function sourceSpecificReject(job, location, config) {
  const provider = job.source.split(':')[0];

  if (provider === 'wwr') {
    // WWR tags each posting with a region and sometimes a country.
    const region = (job.meta.region || '').toLowerCase();
    const country = (job.meta.country || '').toLowerCase();
    const regionOk = config.wwrRegionOk.some((ok) => region.includes(ok));
    if (!regionOk && !country.includes('brazil')) return `region "${job.meta.region}"`;
    return null;
  }

  if (provider === 'himalayas') {
    // An explicit list of allowed countries/regions; empty means worldwide.
    const restrictions = (job.meta.locationRestrictions || []).map((item) => item.toLowerCase());
    const open = restrictions.length === 0 || restrictions.some((item) => firstTerm(item, config.locationOpen));
    if (!open) return `restricted to ${restrictions.slice(0, 3).join(', ')}`;
    return null;
  }

  if (provider === 'remotive') {
    // `candidate_required_location` is free text, so only a known-good marker passes.
    if (!firstTerm(location, config.locationOk)) return `location "${job.location}"`;
    return null;
  }

  // Greenhouse and Lever boards: reject only when the location names a foreign
  // place and nothing marks the role as open to Brazil/LATAM/worldwide.
  // An empty location is left to the description check.
  const foreign = firstTerm(location, config.foreignCountries);
  const open = firstTerm(location, config.locationOpen);
  if (foreign && !open) return `location "${job.location}"`;
  return null;
}

module.exports = { locationReject };
