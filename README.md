
# TS Tool

This tool allows you to pack Typescript projects into launchable single-file bundles.  
Disclaimer: this tool does not support, and is not aiming to support all possible ways of using Typescript. It does not support triple-slash directives, it does not support non-module code files and so on.  

# Usage

## Install

	npm install --save-dev @nartallax/tstool
	npm install --save-dev typescript
	npm install --save-dev tslib

The tool will use any Typescript version it could find. The tool will use tslib that is installed in the project.  
Versions of Typescript below 4 are not supported.  

## Basic usage: Bundling

To get started, you need to modify your tsconfig.json.  
Add block tstoolConfig to your tsconfig.json like this:  

	{
		"tstoolConfig": {
			"entryModule": "my_main_file.ts",
			"entryFunction": "myEntryPoint",
			"outFile": "js/bundle.js",
			"target": "ES2018"
		},
		
		"compilerOptions": { ... }
	}

In this block you can see that tool is pointed to .ts file (my_main_file.ts), which is exporting function myEntryPoint. This is how entry point is defined. When the tool produces bundle, this function will be invoked.  
There is also outFile defined. This file will contain the bundle.  
Defining target is not required, but strongly recommended. Default target is ES5. ES3 is not supported. Target constants are the same as in compilerOptions.  
Some of compilerOptions won't be compatible with the tool. In this case, you will see error messages during tool launch.  

After configuration block is added, it's time to build. Launch build:  

	node ./node_modules/.bin/tstool --tsconfig ./tsconfig.json

After build is finished, you should end up with either bundle in desired location, or with bunch of errors in tool output.  

## Watch mode

Watch mode is special mode supported by Typescript compiler. It allows to watch .ts files for changes and recompile them after changes immediately.  
This mode is supported by the tool. To activate it, add following option to tstoolConfig block:  

	"watchMode": true

Next time tool is launched, it will not stop after first build; instead, it will run indefinitely.  
Note that not each build results in bundle file update. To actually update the bundle, you will need to trigger the bundling; it is done through http service. To make tool create HTTP service, you can pass following options:  

	"httpPort": 7570,
	"showErrorsOverHttp": true

Port number is arbitrary.  
Now, after tool is restarted, when HTTP request is sent to <http://localhost:7570/assemble_bundle> , a bundle is assembled and put into designated file, as well as sent over HTTP as response. Build errors are also sent over HTTP, if any. In case of errors, bundle is not produced.  

## Profiles

Now you may want to separate production and development options. The tool offers means to do this: profiles.  
You may define profile like this (within tstoolConfig block):  

	"profiles": {
		"development": {
			"watchMode": true,
			"target": "ES2018"
		},
		"production": {
			"target": "ES5"
		}
	}

After these changes are made, you may pass profile name on tool launch:  

	--profile development

Values from profile definition will override values from "base" profile, which is options in tstoolConfig block. Note that if no profile name passed, just the values of the tstoolConfig block will be used.  

## Minification

The tool is able to minify modules before putting it into bundle. To do this, add option to config:  

	"minify": true

Terser minifier is used.  
If you need, you may pass overrides to terser:  

	"minificationOverrides": {
		"collapse_vars": false
	}

Some overrides could break the tool.

## Transformers

TBD
	"transformerProjects": ["../my_transformer/tsconfig.json"]

## Other options

TBD
	"moduleBlacklistRegexp": ["^/bad_modules/.*?$"]
	"moduleWhitelistRegexp": ["^/good_modules/.*?$"]
	"preserveOutDir": true
	"embedTslib": false

## TODO

Test for not enough inotify to properly watch all the files (it could lead to interesting results in projects with file-generating transformers, even in single-build launch)  
Decide about asynchronous module loading and separation of project into several bundles  
Support for modules in C - asmjs/wasm  