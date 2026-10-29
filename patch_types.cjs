const fs = require('fs');

let drawer = fs.readFileSync('src/components/house/purchase-drawer.tsx', 'utf8');

drawer = drawer.replace(
  /onConfirm: \(args: Record<string, unknown>\) => Promise<boolean>;/,
  'onConfirm: (args: Record<string, unknown>) => Promise<boolean>;'
);

fs.writeFileSync('src/components/house/purchase-drawer.tsx', drawer);
console.log('drawer type patched');
