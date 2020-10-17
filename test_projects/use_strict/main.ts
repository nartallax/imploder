export function main(){
	console.log(testFn());
}

function testFn(): string {
	return typeof(this);
}