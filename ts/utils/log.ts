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
	if(verbosityLevel <= logVerbosityLevel){
		process.stderr.write(timeStr() + "\t" + str + "\n");
	}
}

export const logError = logWithLevel.bind(null, -2);
export const logWarn = logWithLevel.bind(null, -1);
export const logInfo = logWithLevel.bind(null, 0);
export const logDebug = logWithLevel.bind(null, 1);

export function logErrorAndExit(str: string): never {
	logError(str);
	process.exit(1);
}