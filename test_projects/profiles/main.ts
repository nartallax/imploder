export async function main(){
	await new Promise(ok => setTimeout(ok, 1));
	console.log("Works");
}