const { Pool } = require('pg');

function getConnectionConfig() {
  // Cloud Foundry: parse VCAP_SERVICES
  if (process.env.VCAP_SERVICES) {
    const vcap = JSON.parse(process.env.VCAP_SERVICES);
    const pgService = vcap['postgres']?.[0];
    if (pgService) {
      return {
        connectionString: pgService.credentials.uri,
        ssl: false,
      };
    }
  }

  // Local: use DATABASE_URL
  return { connectionString: process.env.DATABASE_URL };
}

const pool = new Pool(getConnectionConfig());

module.exports = pool;
