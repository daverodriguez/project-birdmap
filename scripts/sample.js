const sqlite = require('sqlite3');
const humanizeDuration = require('humanize-duration');
const fs = require('fs');

const skipFilePath = '../data/skip-list.json';
let skipList;
if (fs.existsSync(skipFilePath)) {
	skipList = require(skipFilePath);
} else {
	skipList = [];
}

const args = require('yargs').argv;
const outFile = args.hasOwnProperty('outfile') ? args.outfile : 'sample-data.json';
const dbName = args.hasOwnProperty('db') ? args.db : 'ebird_eod.db';
const viewName = args.hasOwnProperty('viewname') ? args.viewname : 'observationsSimple';
const LAT_MIN = args.hasOwnProperty('latmin') ? args.latmin : -58;
const LAT_MAX = args.hasOwnProperty('latmax') ? args.latmax : 80;
const LNG_MIN = args.hasOwnProperty('lngmin') ? args.lngmin : -180;
const LNG_MAX = args.hasOwnProperty('lngmax') ? args.lngmax : 180;
const STEP = args.hasOwnProperty('step') ? args.step : 10;
const resetSkipList = args.hasOwnProperty('reset') ? true : false;
const outFileStreaming = args.hasOwnProperty('outfile') ? outFile.replace('.json', '-streaming.json') : 'sample-data-streaming.json';
// const outFileStreaming = 'sample-data-streaming.json';
const outPath = `../data/${outFile}`;
const outPathStreaming = `../data/${outFileStreaming}`;

// Iteration counter and metrics for how long this query will take to run - we'll update this as we the query progresses
let i = 1;
const numXSteps = Math.ceil( (Math.abs(LAT_MIN) + LAT_MAX) / STEP );
const numYSteps = Math.ceil( (Math.abs(LNG_MIN) + LNG_MAX) / STEP );
const numSteps = numXSteps * numYSteps;
const QUERY_TIME = 2500;
let averageQueryTime = 2500;
let writeInterval = Infinity;
let lastTime = new Date().getTime();

const sampleData = {
	type: "FeatureCollection",
	features: []
};

function sleep(millis) {
	return new Promise(resolve => setTimeout(resolve, millis));
}

if (resetSkipList) {
	console.log('Resetting skip list');
	fs.writeFileSync('../data/skip-list.json', '[]', { flag: 'w+' });
	sleep(1000);
}

const db = new sqlite.Database(`../data/${dbName}`, sqlite.OPEN_READONLY, (err) => {
	if (err) {
		return console.error(err.message);
	}
	console.log(`Connected to the SQlite database: ${dbName}`);
	doQueries();
	doCleanup();
});

function doQueries() {
	console.log(`Querying view name: ${viewName}`);

	let runtime = numSteps * QUERY_TIME;
	writeInterval = Math.ceil(60 / (QUERY_TIME / 1000) ); // Attempt to write a file about once per minute
	console.log(`I'll write to the data file about once every ${writeInterval} queries`);
	console.log(`Approximate runtime is ${humanizeDuration(runtime)}`);

	for (let lat = LAT_MIN; lat < LAT_MAX; lat += STEP) {
		for (let lng = LNG_MIN; lng < LNG_MAX; lng += STEP) {

			const query = `SELECT DISTINCT verbatimScientificName, commonName, speciesCode, count(*) AS observationCount
			FROM ${viewName}
			WHERE decimalLatitude BETWEEN ${lat} AND ${lat + STEP} 
			AND decimalLongitude BETWEEN ${lng} AND ${lng + STEP}
			GROUP BY verbatimScientificName
			ORDER BY observationCount DESC`;

			// console.log(query);

			let skip = skipList.find(el => {
				return el.step === STEP && el.lat === lat && el.lng === lng;
			});
			db.serialize(() => {
				if (skip) {
					writeNextGrid(lat, lng, STEP, null, true);
				} else {
					// console.log(query);
					db.all(query, (err, result) => {
						if (!err) {
							writeNextGrid(lat, lng, STEP, result);
						} else {
							console.log(err);
							return process.exit(1);
						}
					});
				}
			});
		}
	}
}

function writeNextGrid(lat, lng, step, result, skipped = false) {
	newTime = new Date().getTime();
	averageQueryTime = (averageQueryTime + (newTime - lastTime)) / 2;
	lastTime = newTime;

	const sampleFeature = {
		type: "Feature",
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[lng, lat], [lng + STEP - 0.0001, lat], [lng + STEP - 0.0001, lat + STEP - 0.0001],
					[lng, lat + STEP - 0.0001], [lng, lat]
				]
			]
		},
		properties: {
			lngMin: lng,
			lngMax: lng + STEP,
			latMin: lat,
			latMax: lat + STEP,
			numSpecies: 0,
			observedSpecies: []
		}
	};

	let gridOutput = `${i++}/${numSteps}: Sampling ${lat}, ${lng} to ${lat + STEP}, ${lng + STEP}`;
	gridOutput = `${gridOutput}. ${result ? result.length : 0} species found.`;

	if (result && result.length) {
		sampleFeature.properties.numSpecies = result.length;
		sampleFeature.properties.observedSpecies = result;
	} else {
		if (skipped) {
			gridOutput = `${gridOutput} Skipping!`;
		} else {
			skipList.push({
				lat: lat,
				lng: lng,
				step: step
			});
		}
	}

	console.log(gridOutput);

	sampleData.features.push(sampleFeature);

	// Experimental: try and update progress to a streaming data file about once per minute
	if (i % writeInterval === 0) {

		// Write the updated streaming data file
		const sampleJson = JSON.stringify(sampleData);
		fs.writeFileSync(outPathStreaming, sampleJson);
		const timeRemaining = humanizeDuration((numSteps - i) * averageQueryTime);
		console.log(`Writing data file. About ${timeRemaining} remaining!`);
		console.log(`Average query time is ${humanizeDuration(averageQueryTime)}`);

		// Write the updated skip list
		fs.writeFileSync('../data/skip-list.json', JSON.stringify(skipList, null, '\t'));
	}
}

function doCleanup() {
	db.close((err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Closed the database connection.');

		const sampleJson = JSON.stringify(sampleData);
		fs.writeFileSync(outPathStreaming, sampleJson);
		fs.writeFileSync(outPath, sampleJson);
	});
}