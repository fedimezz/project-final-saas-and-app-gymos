const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expo,
  {
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.json" },
      },
    },
  },
  { ignores: ["dist/*", "gymapos/*", ".expo/*", "node_modules/*", "hero3d-viewer/*", "scripts/*", "src/hero3d/*.generated.ts"] },
]);
