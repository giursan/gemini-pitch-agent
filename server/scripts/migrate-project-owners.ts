import admin from 'firebase-admin';
import path from 'path';

const serviceAccountPath = path.resolve(process.cwd(), '..', 'service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: process.env.FIREBASE_PROJECT_ID || 'gemini-pitch-agent-c23da',
    });
}

const db = admin.firestore();

type ProjectDoc = {
    ownerId?: string;
};

async function run() {
    const ownerEmail = process.env.MIGRATE_OWNER_EMAIL;
    if (!ownerEmail) {
        console.error('MIGRATE_OWNER_EMAIL is required (e.g. user@example.com).');
        process.exit(1);
    }

    const user = await admin.auth().getUserByEmail(ownerEmail);
    const ownerId = user.uid;

    const snapshot = await db.collection('projects').get();
    const batch = db.batch();
    let updated = 0;

    snapshot.docs.forEach((doc) => {
        const data = doc.data() as ProjectDoc;
        if (!data.ownerId) {
            batch.update(doc.ref, { ownerId });
            updated += 1;
        }
    });

    if (updated === 0) {
        console.log('No projects missing ownerId. Nothing to update.');
        return;
    }

    await batch.commit();
    console.log(`Updated ${updated} projects to ownerId ${ownerId}.`);
}

run().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
