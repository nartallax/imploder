// this is file from another project that wants to load bundle of our project as separate file
const {meaningOfEverything, spice} = require("./js/bundle_wrapped");
console.log(meaningOfEverything + "! spice " + spice);