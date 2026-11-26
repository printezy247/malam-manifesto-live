import tseslint from 'typescript-eslint';
export default [{ignores:['node_modules/**','dist/**','releases/**','coverage/**','public/**']},{
  files: ['**/*.js','**/*.mjs','**/*.ts','**/*.tsx'],
  languageOptions: {parser:tseslint.parser,parserOptions:{ecmaFeatures:{jsx:true}},ecmaVersion:'latest',sourceType:'module'},
  plugins:{'@typescript-eslint':tseslint.plugin},
  rules: {'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^React$'}], 'no-unreachable':'error','no-constant-condition':'error'}
},{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: { 'no-unused-vars': 'error', 'no-unreachable': 'error', 'no-constant-condition': 'error' }
}];
