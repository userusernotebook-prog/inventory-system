const eslint = require('@eslint/js');
const globals = require('globals');

// A interface antiga acessa elementos do DOM pelos IDs como variáveis globais.
// Eles ficam declarados aqui até a camada de apresentação ser refatorada.
const browserIds = `techSelect techModal actorBadge chooseTech adminBtn empSearch empList newEmp
  empForm saveEmp en ec ee ed eci el ep cancelEditEmp editEmpForm finishOff
  assetList assetSearch assetStatus newAsset assetForm saveAsset at ah as am af ar
  ai1 ai2 ac acity aloc ast ades ma ms me mr doMove te ta tt tp td saveTicket
  sendFile file impResult`.split(/\s+/);
const browserGlobals = Object.fromEntries(browserIds.map((name) => [name, 'readonly']));

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'vendor/**',
      '.artifact-template/**',
      '.import-test-*/**',
      '.offboard-test-*/**',
      '.migration-test-*/**',
      '.contract-test-*/**'
    ]
  },
  {
    files: ['*.js', '*.cjs', 'src/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: eslint.configs.recommended.rules
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...browserGlobals
      },
      sourceType: 'script'
    },
    rules: { ...eslint.configs.recommended.rules, 'no-unused-vars': 'off' }
  },
  {
    files: ['public/app.js'],
    languageOptions: { globals: { dashboard: 'readonly' } }
  },
  {
    files: ['public/dashboard.js'],
    languageOptions: {
      globals: {
        api: 'readonly',
        notify: 'readonly',
        esc: 'readonly',
        app: 'readonly',
        importPage: 'readonly'
      }
    }
  }
];
