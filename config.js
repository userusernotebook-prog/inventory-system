const path = require('node:path');
const dotenv = require('dotenv');

// Resolve a configuração a partir do projeto, independentemente do diretório de execução.
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

const adminPassword = process.env.ADMIN_PASSWORD?.trim();
if (!adminPassword || adminPassword === 'admin123') {
  throw new Error(
    'Defina ADMIN_PASSWORD com uma senha diferente de admin123 antes de iniciar o servidor.'
  );
}

const portValue = process.env.PORT || '3000';
const port = Number(portValue);
if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT deve ser um número inteiro entre 1 e 65535.');
}

module.exports = Object.freeze({ adminPassword, port });
