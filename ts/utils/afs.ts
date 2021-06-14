import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function wrap<T>(call: (callback: (err: Error | NodeJS.ErrnoException | null, res: T) => void) => void | Promise<void>): Promise<T>{
	return new Promise<T>(async (ok, bad) => {
		try {
			await Promise.resolve(call((err, res) => {
				if(err){
					bad(err)
				} else {
					ok(res);
				}
			}));
		} catch(e){
			bad(e);
		}
	})
}

export function createDirsToFile(pathToFile: string): Promise<string>{
	return wrap<string>(cb => fs.mkdir(path.dirname(pathToFile), {recursive: true}, cb));
}

export function readTextFile(path: string, encoding: string = "utf8"): Promise<string>{
	return wrap(cb => fs.readFile(path, encoding, cb));
}

export function writeTextFile(path: string, content: string, encoding: string = "utf8"): Promise<void>{
	return wrap<void>(cb => fs.writeFile(path, content, encoding, err => cb(err)));
}

export function stat(path: string): Promise<fs.Stats>{
	return wrap(cb => fs.stat(path, cb))
}

export function mkdir(path: fs.PathLike, options?: number | string | fs.MakeDirectoryOptions | undefined | null): Promise<void>{
	return wrap(cb => fs.mkdir(path, options, err => cb(err)))
}

export async function fileExists(path: string): Promise<boolean>{
	return wrap(cb => fs.stat(path, err => cb(null, !err)))
}

export function unlink(path: string): Promise<void>{
	return wrap<void>(cb => fs.unlink(path, err => cb(err)));
}

export function rmdir(path: string): Promise<void>{
	return wrap<void>(cb => fs.rmdir(path, err => cb(err)));
}

export function readdir(path: string): Promise<string[]>{
	return wrap<string[]>(cb => fs.readdir(path, cb));
}

export function unlinkRecursive(fsEntryPath: string): Promise<void>{
	return wrap(async cb => {
		let st = await stat(fsEntryPath);
		if(st.isDirectory()){
			let list = await readdir(fsEntryPath);
			await Promise.all(list.map(name => {
				let fullPath = path.join(fsEntryPath, name);
				return unlinkRecursive(fullPath);
			}));
			await rmdir(fsEntryPath);
		} else {
			await unlink(fsEntryPath);
		}
		cb(null);
	});
}

export function withTempDir<T>(prefix: string, action: (path: string) => T | Promise<T>): Promise<T>{
	return new Promise((ok, bad) => {
		fs.mkdtemp(path.join(os.tmpdir(), prefix), async (err, dir) => {
			if(err){
				bad(err);
				return;
			}

			try {
				ok(await Promise.resolve(action(dir)));
			} catch(e){
				bad(e);
			} finally {
				await unlinkRecursive(dir);
			}

		})
	})
	
}

export function copyFile(src: fs.PathLike, dest: fs.PathLike): Promise<void>{
	return wrap<void>(cb => fs.copyFile(src, dest, err => cb(err)));
}

export function copyDir(src: string, dest: string): Promise<void>{
	return wrap<void>(async cb => {
		let st = await stat(src);
		if(st.isDirectory()){
			let list = await readdir(src);
			if(!(await fileExists(dest))){
				await mkdir(dest);
			}
			await Promise.all(list.map(name => {
				return copyDir(path.join(src, name), path.join(dest, name));
			}));
		} else {
			await copyFile(src, dest);
		}
		cb(null);
	})
}