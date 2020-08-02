import * as tsc from "typescript";

let logVerbosityLevel: number = 0;

function twoDig(x: number){ return (x > 9? "": "0") + x }
function threeDig(x: number){ return x > 99? "" + x: "0" + twoDig(x) }

function timeStr(){
	let d = new Date();
	return `${d.getFullYear()}.${twoDig(d.getMonth() + 1)}.${twoDig(d.getDate())} ${twoDig(d.getHours())}:${twoDig(d.getMinutes())}:${twoDig(d.getSeconds())}:${threeDig(d.getMilliseconds())}`
}

export function setLogVerbosityLevel(level: number){
	logVerbosityLevel = level
}

function logWithLevel(verbosityLevel: number, str: string){
	if(verbosityLevel <= logVerbosityLevel)
		tsc.sys.write(timeStr() + "\t" + str + "\n");
}

export function logError(str: string){ return logWithLevel(-2, str) }
export function logWarn(str: string){ return logWithLevel(-1, str) }
export function logInfo(str: string){ return logWithLevel(0, str) }
export function logDebug(str: string){ return logWithLevel(1, str) }
export function logErrorAndExit(str: string): never {
	logError(str);
	process.exit(1);
}