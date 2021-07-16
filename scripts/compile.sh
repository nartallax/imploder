#!/bin/bash
# this script compiles the tool itself.
# its somehow gruesome, but lets just deal with it.

cd `dirname "$0"`
cd ..

# preparing the build space
rm -r ./target 2> /dev/null
rm -r ./js 2> /dev/null
mkdir ./ts/generated 2> /dev/null

set -e

# lint the code first
scripts/eslint.sh

# build loader .ts code, as it is mostly one big string with js in it
./node_modules/.bin/tsc --out ./target/loader.js ./ts/loader/loader.ts ./ts/loader/loader_types.d.ts --target ES5
echo "export const loaderCode = \`" > ./ts/generated/loader_code.ts
cat ./target/loader.js | sed 's;\\;\\\\;g' >> ./ts/generated/loader_code.ts
echo "\`;" >> ./ts/generated/loader_code.ts
rm ./target/loader.js

# generating tests list
echo "export const testListStr = \`" > ./ts/generated/test_list_str.ts
ls ./test_projects >> ./ts/generated/test_list_str.ts
echo "\`;" >> ./ts/generated/test_list_str.ts

# building the tool and wrapping it with launch code of the tool
./node_modules/.bin/tsc --project tsconfig.json --outFile ./target/imploder_main_outfile.js
cat ./parts/packed_imploder_exporter_start.js > ./target/bundler.compiled.js.partial
cat ./target/imploder_main_outfile.js >> ./target/bundler.compiled.js.partial
cat ./parts/packed_imploder_exporter_end.js >> ./target/bundler.compiled.js.partial
mv ./target/bundler.compiled.js.partial ./target/imploder.js
rm ./target/imploder_main_outfile.js

# building .d.ts
./node_modules/.bin/tsc --project tsconfig.json --emitDeclarationOnly --declaration --outDir dts --removeComments false
mv ./dts/imploder.d.ts ./target/
rm -r ./dts

# creating executable entrypoint
mkdir ./target/bin
cp ./bin/imploder.cli.js ./target/bin/
chmod u+x ./target/bin/imploder.cli.js

# copying other files to packaging point 
cp README.md ./target/
cp LICENSE ./target/
cp package.json ./target/