export default {
  "*.{ts,tsx,js,mjs}": "eslint --max-warnings=0 --no-warn-ignored",
  "*.{ts,tsx}": () => "tsc --noEmit",
};
