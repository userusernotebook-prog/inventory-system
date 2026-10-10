const path = require('node:path');
const dotenv = require('dotenv');

const envFile = path.resolve(__dirname, '..', '..', '.env');

// Carrega o .env da raiz do projeto para a aplicação e os scripts de operação.
// Variáveis já definidas no ambiente têm precedência sobre o arquivo.
function loadEnv() {
  dotenv.config({ path: envFile, quiet: true });
}

module.exports = { loadEnv, envFile };
