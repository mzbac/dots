// Public, presentation-only settings. Ownership is independently checked against
// the build identity and the deployment before a remote mood can be requested.
export const CHARACTER_PALETTES = Object.freeze(['amber', 'rose', 'seafoam']);
const HOME_KEYS = ['schemaVersion', 'ownerRepository', 'name', 'description', 'characterPalette', 'status'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/u;

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function parseRepository(value) {
  if (typeof value !== 'string') return null;
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/.exec(value);
  if (!match || match[2] === '.' || match[2] === '..') return null;
  return { owner: match[1], name: match[2], repository: value };
}

function isBranch(value) {
  return typeof value === 'string' && value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) &&
    !value.includes('..') && value.split('/').every(part =>
      part.length > 0 && !part.startsWith('.') && !part.endsWith('.') && !part.endsWith('.lock'));
}

function isDisplayText(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value === value.trim() && !UNSAFE_TEXT.test(value);
}

/** Validate the small, versioned public config. Arbitrary URLs are not supported. */
export function validateHomeConfig(value) {
  if (!hasExactKeys(value, HOME_KEYS) || value.schemaVersion !== 1) throw new Error('Invalid home schema');
  if (!parseRepository(value.ownerRepository)) throw new Error('Invalid home repository');
  if (!isDisplayText(value.name, 48) || !isDisplayText(value.description, 240)) throw new Error('Invalid home text');
  if (!CHARACTER_PALETTES.includes(value.characterPalette)) throw new Error('Invalid character palette');
  if (!hasExactKeys(value.status, ['branch', 'path']) || !isBranch(value.status.branch) ||
      value.status.path !== 'public/status.json') throw new Error('Invalid status location');
  return Object.freeze({
    schemaVersion: 1,
    ownerRepository: value.ownerRepository,
    name: value.name,
    description: value.description,
    characterPalette: value.characterPalette,
    status: Object.freeze({ branch: value.status.branch, path: 'public/status.json' })
  });
}

function isPathname(value) {
  // URL-normalized browser paths never need traversal or encoded separators here.
  // Fail closed for unusual inputs rather than trying to reinterpret their owner.
  return typeof value === 'string' && value.length <= 2048 && value.startsWith('/') &&
    !/[\s\\%?#\u0000-\u001f\u007f]/u.test(value) && !value.includes('//') &&
    value.split('/').every(part => part !== '.' && part !== '..');
}

function isBaseUrl(value) {
  if (value === './') return true;
  return isPathname(value) && value.endsWith('/') && !value.includes(':');
}

function isOwnPagesDeployment(repository, hostname, pathname) {
  if (!repository || typeof hostname !== 'string' || !isPathname(pathname)) return false;
  const pagesHost = `${repository.owner.toLowerCase()}.github.io`;
  if (hostname.toLowerCase() !== pagesHost) return false;
  if (repository.name.toLowerCase() === pagesHost) {
    // A root user/organization site is only unambiguously identifiable at root.
    // Other first path segments might belong to an entirely different project.
    return pathname === '/' || pathname === '/index.html';
  }
  const prefix = `/${repository.name}/`;
  return pathname === prefix.slice(0, -1) || pathname.startsWith(prefix);
}

function communityLinks(repository, branch) {
  const url = `https://github.com/${repository.repository}`;
  return Object.freeze({
    repository: url,
    fork: `${url}/fork`,
    invite: `${url}/issues/new?template=invitation.yml`,
    hello: `${url}/issues/new?template=hello.yml`,
    contribute: `${url}/blob/${branch}/CONTRIBUTING.md`
  });
}

/**
 * Resolve this build's own public home, without fetching anything.
 * `repository` must come from the build's GITHUB_REPOSITORY, never home.json.
 * Call again for each refresh to advance the 30-second cache-busting value.
 * A null statusUrl means no request and no bundled/copied-status fallback.
 * Before displaying a live response, the caller must also verify the payload's
 * ownerRepository matches this home: a fork may still contain a copied mood.
 */
export function resolveHomeContext(config, options = {}) {
  const { repository = '', hostname = '', pathname = '/', baseUrl = './', now = Date.now() } = options ?? {};
  let home = null;
  try { home = validateHomeConfig(config); } catch { /* Invalid settings leave a quiet, unconfigured home. */ }
  const buildRepository = parseRepository(repository);
  const verifiedPages = isOwnPagesDeployment(buildRepository, hostname, pathname);
  const ownerMatches = home && buildRepository &&
    home.ownerRepository.toLowerCase() === buildRepository.repository.toLowerCase();
  const branch = ownerMatches ? home.status.branch : 'main';
  const context = {
    mode: 'new-home',
    reason: 'unverified-deployment',
    home,
    statusUrl: null,
    repository: verifiedPages ? buildRepository.repository : null,
    links: verifiedPages ? communityLinks(buildRepository, branch) : null
  };
  if (!home) context.reason = 'invalid-config';
  else if (!isBaseUrl(baseUrl) || !Number.isSafeInteger(now) || now < 0) context.reason = 'invalid-runtime';
  else if (LOCAL_HOSTS.has(hostname) && isPathname(pathname)) {
    context.mode = 'local';
    context.reason = 'local-development';
    context.statusUrl = `${baseUrl}status.json`;
  } else if (verifiedPages && ownerMatches) {
    context.mode = 'live';
    context.reason = 'verified-pages';
    context.statusUrl = `https://raw.githubusercontent.com/${buildRepository.repository}/${home.status.branch}/public/status.json?v=${Math.floor(now / 30000)}`;
  } else if (verifiedPages && !ownerMatches) context.reason = 'repository-mismatch';
  else if (!buildRepository) context.reason = 'missing-build-identity';
  return Object.freeze(context);
}
