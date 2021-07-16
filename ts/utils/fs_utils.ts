import {promises as Fs} from "fs";
import * as Path from "path";
import * as Os from "os";


export async function fileExists(path: string): Promise<boolean>{
	try {
		await Fs.stat(path);
		return true;
	} catch(e){
		if(e.code === "ENOENT"){
			return false;
		}
		throw e;
	}
}

export async function unlinkRecursive(fsEntryPath: string): Promise<void>{
	let st = await Fs.stat(fsEntryPath);
	if(st.isDirectory()){
		let list = await Fs.readdir(fsEntryPath);
		await Promise.all(list.map(name => {
			let fullPath = Path.join(fsEntryPath, name);
			return unlinkRecursive(fullPath);
		}));
		await Fs.rmdir(fsEntryPath);
	} else {
		await Fs.unlink(fsEntryPath);
	}
}

export async function withTempDir<T>(prefix: string, action: (path: string) => T | Promise<T>): Promise<T>{
	let dir = await Fs.mkdtemp(Path.join(Os.tmpdir(), prefix));
	try {
		return await Promise.resolve(action(dir));
	} finally {
		await unlinkRecursive(dir);
	}
}

export async function copyDir(src: string, dest: string): Promise<void>{
	let st = await Fs.stat(src);
	if(st.isDirectory()){
		let list = await Fs.readdir(src);
		if(!(await fileExists(dest))){
			await Fs.mkdir(dest);
		}
		await Promise.all(list.map(name => {
			return copyDir(Path.join(src, name), Path.join(dest, name));
		}));
	} else {
		await Fs.copyFile(src, dest);
	}
}