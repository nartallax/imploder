[["/button",["/exporter"],{"exports":["Button"]},"(t,n,o)=>{class Button extends o.Control{}t.Button=Button}"],["/data",[],{"exports":["cval","bval","aval"]},"a=>{a.aval=5,a.bval=10,a.cval=20}"],["/exporter",["tslib","/button","/data"],{"exportRefs":["/data"],"exports":["Control"]},"function(o,t,n,r,c){n.__exportStar(c,o),o.Control=class Control{constructor(){this instanceof r.Button&&console.log('Hooray!')}}}"],["/main",["/exporter","/exporter"],"(l,n,o,a)=>{l.main=function main(){console.log(o.aval+o.bval+o.cval);for(let l in a)console.log(l)}}"]]