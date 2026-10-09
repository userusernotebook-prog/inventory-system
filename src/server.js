const app = require('./app');
const { port } = require('./config/env');

app.listen(port, () => {
  console.log(`Inventário disponível em http://localhost:${port}`);
});
