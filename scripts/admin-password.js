const fs = require('node:fs');
const readline = require('node:readline');

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('A senha deve ter ao menos 12 caracteres.');
  }
  return password;
}

function passwordFromAutomation(environment = process.env) {
  if (environment.ADMIN_PASSWORD_FILE) {
    return fs.readFileSync(environment.ADMIN_PASSWORD_FILE, 'utf8').trim();
  }
  return environment.ADMIN_PASSWORD || null;
}

function promptHidden(message, input = process.stdin, output = process.stdout) {
  if (!input.isTTY) {
    throw new Error('Sem terminal interativo. Use ADMIN_PASSWORD ou ADMIN_PASSWORD_FILE.');
  }
  readline.emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();
  output.write(message);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(false);
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onKeypress = (character, key = {}) => {
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }
      if (key.ctrl && key.name === 'c') return finish(new Error('Entrada cancelada.'));
      if (character) value += character;
    };
    input.on('keypress', onKeypress);
  });
}

async function readPassword({ environment = process.env, prompt = promptHidden } = {}) {
  const automated = passwordFromAutomation(environment);
  if (automated !== null) return validatePassword(automated);
  const password = await prompt('Senha provisoria: ');
  const confirmation = await prompt('Confirme a senha provisoria: ');
  if (password !== confirmation) throw new Error('As senhas informadas nao conferem.');
  return validatePassword(password);
}

module.exports = { passwordFromAutomation, promptHidden, readPassword, validatePassword };
