const { createApp } = require('./app');
const db = require('./db/connection');
const { port } = require('./config/env');
const app = createApp(db);

app.listen(port, () => {
  console.log(`Inventário disponível em http://localhost:${port}`);
});
