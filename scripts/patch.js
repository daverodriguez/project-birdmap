const args = require('yargs').argv;
const fs = require('fs');

if (!(args.base && args.patch)) {
	if (!args.base) { console.log('Missing base file'); }
	if (!args.patch) { console.log('Missing patch file'); }
	process.exit(1);
}

// console.log(args);
const baseFile = require(`../data/${args.base}`);
const patchFile = require(`../data/${args.patch}`);

function findMatchingObject(baseObject, key) {
	return baseObject.find(el => {
		return JSON.stringify(el.geometry.coordinates) === key;
	});
}

for (let patchFeature of patchFile.features) {
	key = JSON.stringify(patchFeature.geometry.coordinates);
	console.log(key);

	let baseFeature = findMatchingObject(baseFile.features, key);
	if (baseFeature) {
		console.log('Found match in base file. Updating!');
		Object.assign(baseFeature, patchFeature);
	} else {
		console.log('No match found in base file. Appending!');
		baseFile.features.push(patchFeature);
	}
}

console.log('Writing updated base file');
fs.writeFileSync(`../data/${args.base}`, JSON.stringify(baseFile));