const fs = require('fs');

let engine = fs.readFileSync('src/lib/house/engine.ts', 'utf8');

engine = engine.replace(
  /const capacities:Record<string,number>=\{tower:1,hall:2,castle:4,'small-castle':3,'superior-castle':5,hamlet:1,'small-town':2,'large-town':4,'small-city':Infinity,'large-city':Infinity\};/,
  "const capacities:Record<string,number>={tower:1,hall:2,'small-castle':3,castle:4,'superior-castle':5,hamlet:1,'small-town':2,'large-town':4,'small-city':Infinity,'large-city':Infinity};"
);

fs.writeFileSync('src/lib/house/engine.ts', engine);
console.log('engine.ts capacity patched');
