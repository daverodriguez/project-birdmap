const sqlite = require('sqlite3');
const fs = require('fs');
const args = require('yargs').argv;
const outFile = args.hasOwnProperty('outfile') ? args.outfile : 'taxonomy.json';
const family = args.family;
const order = args.order;
const outPath = `../data/${outFile}`;

if (family) {
	console.log(`Creating taxonomy for family ${family}`);
} else if (order) {
	console.log(`Creating taxonomy for order ${order}`);
}


const db = new sqlite.Database('../data/ebird_eod.db', sqlite.OPEN_READONLY, (err) => {
	if (err) {
		return console.error(err.message);
	}
	console.log('Connected to the SQlite database.');
});

let taxonomy = [];

let query = `SELECT SPECIES_CODE as speciesCode, PRIMARY_COM_NAME as commonName,
SCI_NAME as scientificName FROM taxonomy `;
if (family) {
	query = query.concat(`WHERE FAMILY = '${family}' AND CATEGORY = 'species';`);
} else if (order) {
	query = query.concat(`WHERE ORDER1 = '${order}' AND CATEGORY = 'species';`);
}

db.all(query, (err, result) => {
	if (!err) {
		taxonomy = result;
	} else {
		console.log(err);
		return process.exit(1);
	}
});

db.close((err) => {
	if (err) {
		return console.error(err.message);
	}
	console.log('Closed the database connection.');

	console.log('Writing taxonomy file');
	const taxonomyJson = JSON.stringify(taxonomy);
	fs.writeFileSync(outPath, taxonomyJson);
});
