#!/bin/bash
set -e
cd `dirname "$0"`
cd ..

./node_modules/.bin/eslint ./ts/ --ext .ts --max-warnings 0