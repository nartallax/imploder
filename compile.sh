#!/bin/bash
# this script compiles bundler itself.
# its somehow gruesome, but lets just deal with it.

cd `dirname "$0"`
rm ./main.js 2> /dev/null
rm ./parts/loader.js 2> /dev/null
mkdir ts/generated 2> /dev/null

set -e

./node_modules/typescript/bin/tsc --out ./parts/loader.js ./ts/loader/loader.ts --target ES5
echo "export const loaderCode = \`" > ts/generated/loader_code.ts
cat ./parts/loader.js | sed 's;\\;\\\\;g' >> ts/generated/loader_code.ts
echo "\`;" >> ts/generated/loader_code.ts

echo "export const testListStr = \`" > ts/generated/test_list_str.ts
ls ./test >> ts/generated/test_list_str.ts
echo "\`;" >> ts/generated/test_list_str.ts

./node_modules/typescript/bin/tsc --project tsconfig.json --outFile ./main.js
cat ./parts/bundler_launcher.js > /tmp/bundler.compiled.js.partial
cat ./main.js >> /tmp/bundler.compiled.js.partial
mv /tmp/bundler.compiled.js.partial ./main.js