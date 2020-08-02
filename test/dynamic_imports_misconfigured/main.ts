export async function main(){
	console.log("importing...");
	let ref = await import("./fs");
	console.log(ref.x + "!");
}