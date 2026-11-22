// Firestore only uses re2js for regex expressions in its Pipeline API, which this app never calls.
// Aliasing it to this stub (see vite.config.ts) keeps ~250 KB of regex engine out of the bundle.
export const RE2JS = {
  compile(): never {
    throw new Error('Regex pipeline expressions are not available in this build');
  },
};
