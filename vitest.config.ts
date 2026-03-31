import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: [
            "src/**/*.spec.ts", // unit tests
            "tests/**/*.spec.ts", // integration tests
        ],
        reporters: ["default", "vitest-sonar-reporter"],
        outputFile: {
            "vitest-sonar-reporter": "coverage/test-reporter.xml",
        },
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov"],
            reportsDirectory: "coverage",
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.spec.ts"],
        },
    },
});
