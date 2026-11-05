// pg for the browser demo: never connects (the demo uses PGlite); type parsers are set on PGlite itself.
const pg = {
  types: { setTypeParser: () => {} },
  Pool: class {
    constructor() {
      throw new Error('PostgreSQL server not available in the demo');
    }
  },
};
export default pg;
