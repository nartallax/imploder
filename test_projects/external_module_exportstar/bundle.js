[["/ts/a",["/ts/b"],{"exports":["Button"]},"(o,t,n)=>{o.Button=class Button{constructor(o){o.notify(),console.log(n.someFunction('meow-meow!'))}}}"],["/ts/b",["tslib","/ts/a","../../some_external_module"],{"exportRefs":["../../some_external_module"],"exports":["Page"]},"function(t,n,e,o,r){t.Page=class Page{constructor(){this.getButton()}getButton(){return new o.Button(this)}notify(){}},e.__exportStar(r,t)}"],["/ts/main",["/ts/b"],"(n,a,e)=>{n.main=function main(){new e.Page}}"]]