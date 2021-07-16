module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: [
		'@typescript-eslint',
	],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
	],
	rules: {
		"prefer-const": "off",
		"@typescript-eslint/no-unused-vars": "off",

		// in this project I do some strange things with module loading and need require with variables
		"@typescript-eslint/no-var-requires": "off",

		// namespaces have their own uses, no need to disallow them completely
		"@typescript-eslint/no-namespace": "off",
	}
};