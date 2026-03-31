import tseslint from "typescript-eslint";

export default [
    {
        ignores: [
            "dist/**",
            "coverage/**",
            "node_modules/**",
            "*.config.ts",
            "*.config.js",
            "src/generated/**",
            "scripts/**",
        ],
    },
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { prefer: "type-imports" },
            ],
        },
    },
];
