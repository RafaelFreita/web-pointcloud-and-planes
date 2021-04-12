import rollupNodeResolve from "@rollup/plugin-node-resolve"; // locate and bundle dependencies in node_modules (mandatory)
import rollupJson from "rollup-plugin-json";
import rollupCommonjs from "rollup-plugin-commonjs";
import { terser } from "rollup-plugin-terser"; // code minification (optional)

export default {
  input: "src/main.js",
  output: [
    {
      format: "umd",
      name: "MYAPP",
      file: "build/bundle.js",
    },
  ],
  plugins: [
    rollupNodeResolve({ jsnext: true, preferBuiltins: true, browser: true }),
    rollupJson(),
    rollupCommonjs(),
    terser(),
  ],
};
