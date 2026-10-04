const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const frontendRoot = path.join(__dirname, '..', '..', 'frontend');
const mainScript = fs.readFileSync(path.join(frontendRoot, 'scripts', 'main.js'), 'utf8');
const mainStyles = fs.readFileSync(path.join(frontendRoot, 'styles', 'main.css'), 'utf8');
const aboutPage = fs.readFileSync(path.join(frontendRoot, 'about.html'), 'utf8');

test('Google Identity script and initialization are cached and idempotent', () => {
  assert.match(mainScript, /googleIdentityScriptPromise/);
  assert.match(mainScript, /googleAuthConfigPromise/);
  assert.match(mainScript, /if \(!googleIdentityInitialized\)/);
  assert.match(mainScript, /script\[data-google-identity\]/);
});

test('Google button recovers after chooser cancellation or page restoration', () => {
  assert.match(mainScript, /click_listener:[\s\S]*googleChooserAttemptActive = true/);
  assert.match(mainScript, /addEventListener\('pageshow'/);
  assert.match(mainScript, /event\.persisted/);
  assert.match(mainScript, /addEventListener\('visibilitychange'/);
  assert.match(mainScript, /addEventListener\('focus'/);
  assert.match(mainScript, /container\.replaceChildren\(\)/);
});

test('Google button remains official, large, centered, and responsive', () => {
  assert.match(mainScript, /accounts\.id\.renderButton/);
  assert.match(mainScript, /size: 'large'/);
  assert.match(mainScript, /width: Math\.min\(400, availableWidth\)/);
  assert.match(mainStyles, /\.google-signin\{[^}]*width:min\(100%,400px\)/);
});

test('successful Google authentication still posts credential and stores VOMA JWT', () => {
  assert.match(mainScript, /apiBaseUrl \+ '\/owner\/google'/);
  assert.match(mainScript, /JSON\.stringify\(\{ credential: credential \}\)/);
  assert.match(mainScript, /sessionStorage\.setItem\(ownerJwtStorageKey, payload\.token\)/);
});

test('public support link uses the official VOMA mailbox', () => {
  assert.match(aboutPage, /mailto:support@voma\.ng/);
  assert.doesNotMatch(aboutPage, /maroserviceshub@gmail\.com/);
});
