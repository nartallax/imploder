import * as path from "path";
import * as fs from "fs";
import {promises as Fs} from "fs";
import {BundlerImpl} from "impl/bundler";
import {LoggerImpl} from "impl/logger";
import * as ChildProcess from "child_process";

let testProjectsRoot: string | null = null;
export function testProjectDir(name: string): string {
	if(!testProjectsRoot){
		let root = path.resolve(__dirname, "./test_projects/");
		try {
			fs.statSync(root);
		} catch(e){
			LoggerImpl.writeDefaultAndExit(`Failed to stat() test projects root directory (which is ${root}). Maybe you're trying to run tests on packed npm package? You cannot do that; you may only run tests on source code.`);
		}
		testProjectsRoot = root;
	}
	return path.join(testProjectsRoot, name);
}


export async function runTestBundle(code: string, bundler: BundlerImpl, bundlePath: string, codePrefix: string | null = null): Promise<string> {
	let allCode = await bundler.wrapBundleCode(code);
	if(codePrefix !== null){
		allCode = codePrefix + "\n" + allCode;
	}
	let result = await runBundleCodeAsFile(allCode, bundlePath);
	if(result.stderr.trim()){
		throw new Error(result.stderr.split("\n")[0]);
	}
	failOnNonEmptyCodeOrSignal(result);

	return result.stdout;
}

export function failOnNonEmptyCodeOrSignal(result: {code: number | null, signal: NodeJS.Signals | null}): void {
	let {code, signal} = result;
	if(code !== 0 || !!signal){
		throw new Error(`Expected zero exit code and no exit signal, got code = ${code} and signal = ${signal}`);
	}
}

async function runBundleCodeAsFile(code: string, originalBundlePath: string): Promise<ProcessExecutionResult> {
	let tmpJsPath = path.join(path.dirname(originalBundlePath), "wrapped_" + path.basename(originalBundlePath));
	await Fs.writeFile(tmpJsPath, code, "utf8");
	try {
		return await runJsCode(tmpJsPath);
	} finally {
		try {
			await Fs.unlink(tmpJsPath);
		} catch(e){}
	}
}

export interface ProcessExecutionResult {
	stdout: string;
	stderr: string;
	code: number | null;
	signal: NodeJS.Signals | null;
}

export async function runJsCode(path: string): Promise<ProcessExecutionResult> {
	return new Promise((ok, bad) => {
		try {
			let res = ChildProcess.spawn(process.argv[0], [path])

			let stderrChunks: Buffer[] = [];
			let stdoutChunks: Buffer[] = [];

			let onExit = (code: number | null, signal: NodeJS.Signals | null) => {
				ok({
					stdout: Buffer.concat(stdoutChunks).toString("utf8").trim(),
					stderr: Buffer.concat(stderrChunks).toString("utf8").trim(),
					code, signal
				})
			}

			res.on("error", err => bad(err));
			res.on("exit", onExit);
			res.on("close", onExit);
			res.stderr.on("data", chunk => stderrChunks.push(chunk));
			res.stdout.on("data", chunk => stdoutChunks.push(chunk));
		} catch(e){
			bad(e);
		}
	});
}