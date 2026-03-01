const { execSync } = require('child_process');
const path = require('path');

// Build DATABASE_URL from VCAP_SERVICES for node-pg-migrate
if (process.env.VCAP_SERVICES) {
  const vcap = JSON.parse(process.env.VCAP_SERVICES);
  const pgService = vcap['postgres']?.[0];
  if (pgService) {
    process.env.DATABASE_URL = pgService.credentials.uri;
  }
}

const root = path.join(__dirname, '..');

try {
  console.log('Running migrations...');
  execSync(`npx node-pg-migrate up --migrations-dir server/migrations --database-url-var DATABASE_URL`, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  console.log('Migrations complete.');
} catch (err) {
  console.error('Migration failed:', err.message);
}

try {
  console.log('Seeding food database...');
  execSync('node server/seed/foods.js', {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  console.log('Seeding complete.');
} catch (err) {
  console.error('Seeding failed:', err.message);
}

// Start the server
require('./index.js');
