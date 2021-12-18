import {Imploder} from "imploder"

function twoDig(x: number) {
	return (x > 9 ? "" : "0") + x
}
function threeDig(x: number) {
	return x > 99 ? "" + x : "0" + twoDig(x)
}

function timeStr() {
	let d = new Date()
	return `${d.getFullYear()}.${twoDig(d.getMonth() + 1)}.${twoDig(d.getDate())} ${twoDig(d.getHours())}:${twoDig(d.getMinutes())}:${twoDig(d.getSeconds())}:${threeDig(d.getMilliseconds())}`
}

export class LoggerImpl implements Imploder.Logger {
	private readonly verbosityLevel: number
	private readonly writeLogStr: (str: string) => void

	constructor(args: Imploder.CLIArgs & {writeLogLine?(str: string): void}) {
		this.writeLogStr = args.writeLogLine || (str => {
			let line = str + "\n"
			if(!args.plainLogs){
				line = timeStr() + "\t" + line
			}
			process.stderr.write(line)
		})
		this.verbosityLevel = args.verbose ? 1 : 0
	}

	private logWithLevel(verbosityLevel: number, str: string) {
		if(verbosityLevel <= this.verbosityLevel){
			this.writeLogStr(str)
		}
	}

	error(str: string): void {
		this.logWithLevel(-2, str)
	}
	warn(str: string): void {
		this.logWithLevel(-1, str)
	}
	info(str: string): void {
		this.logWithLevel(-0, str)
	}
	debug(str: string): void {
		this.logWithLevel(1, str)
	}
	errorAndExit(str: string): never {
		this.error(str)
		process.exit(1)
	}

	/** Для случаев, когда полноценный контекст недоступен, а что-то вывести надо.
	 * Например, при парсинге командной строки, или в тестах. */
	static writeDefault(str: string): void {
		process.stderr.write(str + "\n")
	}

	static writeDefaultAndExit(str: string): never {
		this.writeDefault(str)
		process.exit(1)
	}
}