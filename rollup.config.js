// rollup.config.js

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';

export default {
  input: 'globe-component.js',
  output: {
    file: 'bundle.js',
    format: 'esm',
  },
  plugins: [
    resolve(),
    commonjs(),
    json(),
    terser(),
  ],
};
