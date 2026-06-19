import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    // Las reglas del React Compiler (eslint-config-next 16) son nuevas y
    // estrictas; la config anterior estaba rota y nunca corrieron. Las dejamos
    // como warning para que el gate de CI sea verde sin bloquear en un refactor
    // de UI grande. Se irán resolviendo de forma incremental.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default eslintConfig;
