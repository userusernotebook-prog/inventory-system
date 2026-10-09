const { createApp } = require('./app');
const { port } = require('./config/env');
const db = require('./db/connection');
const app = createApp(db);

app.listen(port, () => {
  console.log(`Inventário disponível em http://localhost:${port}`);
});
