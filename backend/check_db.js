const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgres://ioc:iocpass@localhost:5433/iocdb'
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully!');

    console.log('\n--- CUSTOMERS ---');
    const customers = await client.query('SELECT id, name FROM customers');
    console.log(customers.rows);

    console.log('\n--- GLPI CONFIGS ---');
    const configs = await client.query('SELECT id, customer_id, glpi_url, enabled, user_token FROM glpi_configs');
    console.log(configs.rows);

  } catch (err) {
    console.error('Error connecting or querying database:', err);
  } finally {
    await client.end();
  }
}

main();
