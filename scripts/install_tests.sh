#!/bin/bash
# this script performs "npm install" on all test projects that require it
# without it some tests can go wrong

cd `dirname "$0"`
cd ..

for d in test_projects/*/ ; do
    cd "$d"
	
	if [ -f "./package.json" ]; then
		npm install
	fi

	cd - > /dev/null
done