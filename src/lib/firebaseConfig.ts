/**
 * Firebase web-app config. These values are public identifiers, not secrets —
 * every Firebase site ships them in its bundle. Access control lives in
 * database.rules.json (deployed to the project), not in hiding this object.
 *
 * Leave the fields empty to ship the app without live scoring.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyAoiKLwDxBZYwhhyoeMhqH08Tgx7tkpSzE',
  authDomain: 'game-tournament-1.firebaseapp.com',
  databaseURL: 'https://game-tournament-1-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'game-tournament-1',
  appId: '1:830234889770:web:2eaa65055aa5c8e8933d53',
}

export const syncConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId)
