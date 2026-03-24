/**
 * One-time script to seed Firestore with existing JSON data.
 * Run once after setting up Firebase:
 *   node scripts/seed-firestore.js
 *
 * Requires scripts/serviceAccountKey.json (download from Firebase Console >
 * Project Settings > Service Accounts > Generate new private key)
 */

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function seed() {
  const dataDir = path.join(__dirname, '..', 'data');

  const players = JSON.parse(fs.readFileSync(path.join(dataDir, 'players.json'), 'utf8'));
  const quarters = JSON.parse(fs.readFileSync(path.join(dataDir, 'quarters.json'), 'utf8'));
  const tiers = JSON.parse(fs.readFileSync(path.join(dataDir, 'tiers.json'), 'utf8'));
  const standings = JSON.parse(fs.readFileSync(path.join(dataDir, 'standings.json'), 'utf8'));

  console.log('Seeding config/quarters...');
  await db.collection('config').doc('quarters').set(quarters);

  console.log('Seeding config/tiers...');
  await db.collection('config').doc('tiers').set(tiers);

  console.log('Seeding config/standings...');
  await db.collection('config').doc('standings').set(standings);

  console.log('Seeding players...');
  for (const player of players.players) {
    await db.collection('players').doc(player.id).set(player);
    console.log(`  ✓ ${player.name} (${player.id})`);
  }

  console.log('\n✓ Firestore seeded successfully!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
