/**
 * Firebase web-app config. These values are public identifiers, not secrets —
 * every Firebase site ships them in its bundle. Access control lives in
 * database.rules.json (deployed to the project), not in hiding this object.
 *
 * Leave the fields empty to ship the app without live scoring.
 */
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  databaseURL: '',
  projectId: '',
  appId: '',
}

export const syncConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId)
