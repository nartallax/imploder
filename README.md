
# Imploder

This tool allows you to pack Typescript projects into launchable single-js-file bundles.  

Disclaimer: this tool does not support, and is not aiming to support all possible ways of using Typescript. It does not support triple-slash directives, it does not support non-module code files and so on.  

# Usage

## Install

	npm install --save-dev @nartallax/imploder

The tool will use any Typescript version it could find. The tool will use tslib that is installed in the project.  
Versions of Typescript below 4 are not supported.  
That is, you should also install Typescript and tslib, though it not always required:  

	npm install --save-dev typescript
	npm install --save-dev tslib

## Basic usage: Bundling

To get started, you need to modify your tsconfig.json.  
Add block imploderConfig to your tsconfig.json like this:  

	{
		"imploderConfig": {
			"entryModule": "my_main_file.ts",
			"entryFunction": "myEntryPoint",
			"outFile": "js/bundle.js",
			"target": "ES2018"
		},
		
		"compilerOptions": { ... }
	}

In this block you can see that tool is pointed to .ts file (my_main_file.ts), which is exporting function myEntryPoint. This is how entry point is defined. When the tool produces bundle, this function will be invoked. Function should not expect any arguments and should not return any value.  
There is also outFile defined. This file will contain the bundle.  
Defining target is not required, but strongly recommended. Default target is ES5. ES3 is not supported. Target constants are the same as in compilerOptions.  
Some of compilerOptions won't be compatible with the tool. In this case, you will see error messages during tool launch.  

After configuration block is added, it's time to build. Launch build:  

	node ./node_modules/.bin/imploder --tsconfig ./tsconfig.json

After build is finished, you should end up with either bundle in desired location, or with bunch of errors in tool output.  

## Watch mode

Watch mode is special mode supported by Typescript compiler. It allows to watch .ts files for changes and recompile them after changes immediately.  
This mode is supported by the tool. To activate it, add following option to imploderConfig block:  

	"watchMode": true

Next time tool is launched, it will not stop after first build; instead, it will run indefinitely.  
Note that not each build results in bundle file update. To actually update the bundle, you will need to trigger the bundling; it is done through HTTP service. To make tool create HTTP service, you can pass following options:  

	"httpPort": 7570,
	"showErrorsOverHttp": true

Port number is arbitrary.  
Now, after tool is restarted, when HTTP request is sent to <http://localhost:7570/assemble_bundle> , a bundle is assembled and put into designated file, as well as sent over HTTP as response. Build errors are also sent over HTTP, if any. In case of errors, bundle is not produced.  

## Profiles

Now you may want to separate production and development options. The tool offers means to do this: profiles.  
You may define profile like this (within imploderConfig block):  

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

Values from profile definition will override values from "base" profile, which is options in imploderConfig block. Note that if no profile name passed, just the values of the imploderConfig block will be used.  

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

The tool is able to apply user-defined source code transformations at compilation. Transformer could alter resulting code in arbitrary way, as well as generate new files.  
To define custom transformer, you should create separate project and link this project in tsconfig.json of project you want to transform:  

	"transformerProjects": ["../my_transformer/tsconfig.json"]

Entrypoint of transformer project should not be just any function; it should be TransformerCreationFunction (see .d.ts). For example of transformer projects, see test projects transformer_change_ts and/or transformer_list_all_classes.  

## Other options

### TSLib embedding

By default, the tool embeds tslib as one of the modules if any other module requires it. You can prevent it with following option:  

	"embedTslib": false

### Module blacklisting/whitelisting

You could blacklist/whitelist some modules with following tsconfig.json options:  

	"moduleBlacklistRegexp": ["^/bad_modules/.*?$"],
	"moduleWhitelistRegexp": ["^/good_modules/.*?$"]

If bundler detects that bundle includes module which name is matches any blacklist entry, bundling is failed.  
If whitelist regexps are defined and non-empty, then names of all modules included in bundle must match at least one of the regexps, otherwise bundling is failed.  
Use-case of this option is sanity checks (to prevent accidently bundling a ton of code you won't actually use), or to keep some secret server-side logic away from client-side bundle.  

### Output directory deletion

By default, output directory is deleted on tool start. This is done to ensure build consistency (there are bugs related to changing "target" value without purging old js files, resulting in inconsistency of ES version within single bundle).  
You can disable such behavior with following option (which is not recommended):  

	"preserveOutDir": true

## Better circular links resolution

The tool provides its own module loader. One of reasons behind this is need for better circular dependencies resolution between modules.  
By default (that is, in requirejs loader) if there is circular dependency between modules, one of the modules receives empty module object (which is filled with values later), which sometimes could lead to runtime errors if said module tries to use any value from that module object at definition time (for example, during creation of subclass).  
The loader of the tool have knowledge about names of values each module exports, and this allows the loader to actually run definition of module only when module value is actually used.  
Note that there is still possible to generate circular dependency link that will not possible to be resolved, and this will fail at runtime; the loader could only resolve circular dependencies that are actually resolvable.  

## Compiling the tool

As a user of the tool you will probably never need this, but I'll write this just in case:

	npm install
	npm run compile
	npm run test

Running tests is optional, but you definitely should do this.  

## TODO

These features probably will be implemented at some point; just not yet.  

Decide about asynchronous module loading and separation of project into several bundles  
Support for modules in C - asmjs/wasm  
Test for not enough file watchers to properly watch all the files (it could lead to interesting results in projects with file-generating transformers, even in single-build launch)  
