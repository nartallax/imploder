module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: [
    "@typescript-eslint",
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  ignorePatterns: [
    "**/js/**",
    "node_modules",
    "**/node_modules/**",
    "**/generated/**",
    "build",
    "target",
    ".eslintrc.js",
    "bin",
    "test_projects",
    "ts/loader/loader.ts"
  ],
  rules: {
    // у const есть свои применения, но требовать его вообще везде - значит загрязнять код
    "prefer-const": "off",

    // у неймспейсов есть свои использования, запрещать их целиком неправильно
    "@typescript-eslint/no-namespace": "off",
    
    // не дает нормально пользоваться неймспейсами
    "no-inner-declarations": "off",

    // это про `value!` например
    // да, этот оператор теоретически может привести к ошибке
    // но это всего лишь означает, что его нужно применять, когда ты на 100% уверен, что там нет null/undefined
    // и такие ситуации есть
    "@typescript-eslint/no-non-null-assertion": "off",

    // для while(true) есть применения, не нужно его запрещать
    "no-constant-condition": ["error", { "checkLoops": false }],



    /* Правила про codestyle
    те, которые явно выключены - имеют аналогичное правило для тайпскрипта */
    "indent": "off",
    "eqeqeq": ["warn", "always"],
    "curly": ["warn", "all"],
    "semi": "off",
    "no-floating-decimal": ["warn"],
    "no-lonely-if": ["warn"],
    "no-useless-rename": ["warn"],
    "no-useless-return": ["warn"],
    "quote-props": ["warn", "as-needed", {numbers: true}],
    "spaced-comment": ["warn", "always"],
    "yoda": ["warn", "never"],
    "array-bracket-newline": ["warn", "consistent"],
    "array-bracket-spacing": ["warn", "never"],
    "array-element-newline": ["warn", "consistent"],
    "arrow-parens": ["warn", "as-needed"],
    "arrow-spacing": ["warn", { "before": true, "after": true }],
    "brace-style": "off",
    "comma-dangle": "off",
    "comma-spacing": "off",
    "comma-style": ["warn", "last"],
    "computed-property-spacing": ["warn", "never"],
    "dot-location": ["warn", "property"],
    "func-call-spacing": "off",
    "generator-star-spacing": ["warn", {"before": false, "after": true}],
    "key-spacing": ["warn", {
      "beforeColon": false,
      "afterColon": true,
      "mode": "strict"
    }],
    "keyword-spacing": "off",
    "linebreak-style": ["warn", "unix"],
    "new-parens": ["warn", "always"],
    "no-multi-spaces": ["warn"],
    "no-trailing-spaces": ["warn"],
    "no-whitespace-before-property": ["warn"],
    "object-curly-newline": ["warn", {"consistent": true}],
    "object-curly-spacing": "off",
    "operator-linebreak": ["warn", "before"],
    "quotes": "off",
    "rest-spread-spacing": ["warn", "never"],
    "space-before-blocks": ["warn", { 
      "functions": "always", 
      "keywords": "never", 
      "classes": "always"
    }],
    "space-before-function-paren": "off",
    "space-in-parens": ["warn", "never"],
    "space-infix-ops": "off",
    "space-unary-ops": ["warn", {"words": false, "nonwords": false}],
    // конфликтует со space-before-blocks
    // например case 5: {} - пробел и должен, и не должен существовать
    "switch-colon-spacing": "off",
    "template-curly-spacing": ["warn", "never"],
    "template-tag-spacing": ["warn", "never"],
    "unicode-bom": ["warn", "never"],
    "yield-star-spacing": ["warn", "after"],

    "@typescript-eslint/func-call-spacing": ["warn", "never"],
    "@typescript-eslint/member-delimiter-style": ["warn", {
      multiline: {delimiter: "none"}, 
      singleline: {delimiter: "comma", requireLast: false}
    }],
    "@typescript-eslint/method-signature-style": ["warn", "method"],
    "@typescript-eslint/no-confusing-non-null-assertion": ["warn"],
    "@typescript-eslint/type-annotation-spacing": ["warn"],
    "@typescript-eslint/brace-style": ["warn", "1tbs"],
    "@typescript-eslint/comma-dangle": ["warn", "never"],
    "@typescript-eslint/comma-spacing": ["warn", { "before": false, "after": true }],
    "@typescript-eslint/indent": ["warn", "tab"],
    "@typescript-eslint/keyword-spacing": ["warn", {
      "overrides": {
        "if": {"after": false},
        "for": {"after": false},
        "while": {"after": false},
        "catch": {"after": false},
        // ...more here?
      }
    }],
    "@typescript-eslint/object-curly-spacing": ["warn", "never"],
    "@typescript-eslint/quotes": ["warn", "double"],
    "@typescript-eslint/semi": ["warn", "never"],
    "@typescript-eslint/space-before-function-paren": ["warn", "never"],
    "@typescript-eslint/space-infix-ops": ["warn"],
  }
};

