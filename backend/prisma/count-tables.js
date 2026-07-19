const { Client } = require('pg');
const client = new Client({ connectionString: process.argv[2] });
(async () => {
  await client.connect();
  const res = await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  for (const row of res.rows) {
    const count = await client.query(`SELECT COUNT(*) as c FROM "${row.tablename}"`);
    console.log(`${row.tablename}: ${count.rows[0].c}`);
  }
  await client.end();
})();
