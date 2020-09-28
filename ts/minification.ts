import * as terser from "terser";
import * as tsc from "typescript";
import {logErrorAndExit} from "log";

export async function minifyJsCode(code: string, tscEcmaVersion: tsc.ScriptTarget,  moduleName: string): Promise<string> {
	let ecma = tscEcmaToTerserEcma(tscEcmaVersion);
	try {
		let res = await terser.minify("return " + code, {
			compress: {
				passes: 3,
				toplevel: false, // true probably will drop entire module definition
				arrows: tscEcmaVersion > tsc.ScriptTarget.ES5,
				arguments: true,
				booleans: true,
				booleans_as_integers: false,
				collapse_vars: true,
				comparisons: true,
				computed_props: true,
				conditionals: true,
				dead_code: true,
				directives: true, // what is this?
				drop_console: false,
				drop_debugger: false,
				ecma: ecma,
				evaluate: true,
				hoist_funs: true,
				hoist_props: true,
				if_return: true,
				inline: false,
				join_vars: true,
				keep_classnames: true,
				keep_fnames: true,
				keep_fargs: false,
				keep_infinity: false,
				loops: true,
				module: false,
				negate_iife: false,
				properties: true,
				pure_getters: false,
				reduce_vars: true,
				sequences: true,
				side_effects: true,
				switches: true,
				typeofs: false, // for IE
				unsafe_arrows: true,
				unsafe_comps: true,
				unsafe_Function: false,
				unsafe_math: false,
				unsafe_symbols: false,
				unsafe_methods: false,
				unsafe_proto: false,
				unsafe_regexp: false, // ???
				unused: true
			},
			mangle: {
				eval: false,
				keep_classnames: true,
				keep_fnames: true,
				module: false
			},
			format: {
				ascii_only: false,
				braces: false,
				comments: "some",
				ecma: ecma,
				quote_style: 1, // код потом будет положен в JSON, а в JSON всегда двойные кавычки, т.е. нам тут нужны одинарные, чтобы было меньше эскейпинга
				keep_quoted_props: false,
				wrap_func_args: false
			},
			parse: {
				bare_returns: true
			},
			ecma: ecma
		});
		
		if(!res.code){
			logErrorAndExit(`Minifier failed on JS code of module ${moduleName}: \n${code}`);
		}

		let resultCode = res.code.replace(/^return\s*/, "").replace(/;\s*$/, "");
		return resultCode;

	} catch(e){
		logErrorAndExit(`Minifier failed on JS code of module ${moduleName}: \n${code}\n${e}`);
	}
}

function tscEcmaToTerserEcma(tscEcma: tsc.ScriptTarget): terser.ECMA {
	if(tscEcma === tsc.ScriptTarget.ES5){
		return 5;
	}

	// вот тут немного стремно
	// но я не хочу прописывать каждый год новую версию стандарта
	if(tscEcma > tsc.ScriptTarget.ES5 && tscEcma < Math.min(90, tsc.ScriptTarget.Latest)){
		return (2013 + tscEcma) as terser.ECMA;
	}

	logErrorAndExit(`Could not minify code with this target (${tscEcma}): no conversion to minifier ECMA version exists.`);
}