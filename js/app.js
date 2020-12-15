mapboxgl.accessToken = 'pk.eyJ1Ijoib2hpb2RhdmUiLCJhIjoiY2swMDZqdWw1MjVxeDNqcW9uaG8xcW9nbyJ9.Hlqy7TBoh8QIPWC5j7AQNQ';

async function getSampleGrids() {
	let dataFile;
	if (location.search.indexOf('streaming') > -1) {
		dataFile = window.dataFileStreaming;
	} else {
		dataFile = window.dataFile;
	}

	let response = await fetch(dataFile);
	let data = await response.json();
	return data;
}

async function getTaxonomy() {
	let dataFile = window.taxonomyFile;
	let response = await fetch(dataFile);
	let data = await response.json();
	return data;
}

function filterTaxonomy(sampleGrids) {
	const uniqueReducer = (accumulator, item) => {
		return accumulator.findIndex(accumItem => accumItem.speciesCode === item.speciesCode) > -1 ? accumulator : accumulator.concat(item);
	};

	const combineReducer = (accumulator, item) => {
		if (!Array.isArray(accumulator)) {
			return [item.properties.observedSpecies];
		}
		return accumulator.concat(item.properties.observedSpecies);
	}

	const allSpecies = sampleGrids.features.reduce(combineReducer);
	const uniqueSpecies = allSpecies.reduce(uniqueReducer);
	return uniqueSpecies;
}

async function getData() {
	let sampleGrids = await getSampleGrids();
	let taxonomy = await getTaxonomy();
	let filteredTaxonomy = filterTaxonomy(sampleGrids);

	return {
		sampleGrids: sampleGrids,
		taxonomy: filteredTaxonomy
	}
}

getData().then(data => {
	normalizeData(data.sampleGrids);
	initApp(data);
});

const MapIntents = {
	DIVERSITY: 0,
	OBSERVATION_COUNT: 1
};

function initApp(data) {
	let birdMapApp = new Vue({
		el: '#birdMapApp',
		data: {
			isLoaded: false,
			sampleGrids: data.sampleGrids,
			map: null,
			taxonomy: data.taxonomy,
			filter: '',
			filterAll: true,
			selectedSpecies: [],
			mapIntent: MapIntents.DIVERSITY,
			inspectedSampleGrid: null,
			debug: location.search.indexOf('debug') > -1
		},
		computed: {
			mapStyles: function() {
				let maxNumSpecies = this.getMaxNumSpecies() || 40;
				console.log(`Max num of species is ${maxNumSpecies}`);

				let fillStops;
				if (this.mapIntent === MapIntents.DIVERSITY) {

					fillStops = [
						'interpolate', ['linear'], ['get', 'numSpecies'],
						0, '#033', // DEBUG ONLY
						1, '#fff7ec',
						// Math.ceil((maxNumSpecies / 9) * 2), '#fee8c8',
						Math.ceil((maxNumSpecies / 6) * 2), '#fdd49e',
						// Math.ceil((maxNumSpecies / 9) * 4), '#fdbb84',
						Math.ceil((maxNumSpecies / 6) * 3), '#fc8d59',
						// Math.ceil((maxNumSpecies / 9) * 6), '#ef6548',
						Math.ceil((maxNumSpecies / 6) * 4), '#d7301f',
						Math.ceil((maxNumSpecies / 6) * 5), '#b30000',
						maxNumSpecies, '#7f0000',
					];
				} else {
					fillStops = [
						'interpolate', ['linear'], ['get', 'observationCount'],
						0, '#033', // DEBUG ONLY
						// 1, '#fff7ec',
						// 1, '#fee8c8',
						// 1, '#fdd49e',
						1, '#fdbb84',
						100, '#fc8d59',
						// 16, '#ef6548',
						2500, '#d7301f',
						10000, '#b30000',
						50000, '#7f0000',
					];
				}

				let styles = {
					'fill-color': fillStops,
					'fill-opacity': {
						property: this.mapIntent === MapIntents.DIVERSITY ? 'numSpecies' : 'observationCount',
						stops: [
							// [0, 0],
							[0, 0.05], // DEBUG only
							[1, 0.7]
						]
					}
				};

				return styles;
			},
			currentFilterSet: function() {
				if (this.filterAll === true) {
					return 'All species';
				}

				return this.selectedSpecies.join(', ');
			},
			filteredTaxonomy: function() {
				if (this.filter === '') {
					return this.taxonomy;
				} else {
					return this.taxonomy.filter(el => {
						let commonName = el.commonName.toLowerCase();
						let scientificName = el.verbatimScientificName.toLowerCase();
						let filterValue = this.filter.toLowerCase();

						return commonName.indexOf(filterValue) > -1 || scientificName.indexOf(filterValue) > -1;
					});
				}
			},
			filteredSampleGrids: function() {
				if (this.filterAll) {
					let filteredFeatures = this.sampleGrids.features.filter(el => {
						if (this.debug) {
							return true;
						}
						return el.properties.numSpecies > 0;
					});

					return {
						type: this.sampleGrids.type,
						features: filteredFeatures
					}
				} else {
					let filteredFeatures = this.sampleGrids.features.filter(el => {
						if (el.properties.numSpecies < 1) { return false; }

						let observedSpeciesList = el.properties.observedSpecies.map(el => el.verbatimScientificName);
						let matches = true;
						el.properties.observationCount = 0;
						for (let species of this.selectedSpecies) {
							let foundMatch = observedSpeciesList.indexOf(species) > -1;
							matches = matches && foundMatch;

							if (foundMatch) {
								let speciesObj = el.properties.observedSpecies.find(obj => obj.verbatimScientificName === species);
								if (speciesObj) {
									el.properties.observationCount += speciesObj.observationCount;
								}
							}
						}

						return matches;
					});

					return {
						type: this.sampleGrids.type,
						features: filteredFeatures
					};
				}
			},
			inspectedSampleGridLabel: function() {
				// let boundsLabel = document.querySelector('.js-observation-bounds');
				let label = '';

				const properties = this.inspectedSampleGrid.properties;
				if (properties.hasOwnProperty('lngMin')) {
					const lngLabel = `${Math.abs(properties.lngMin)}&ndash;${Math.abs(properties.lngMax)}&deg;${properties.lngMin < 0 ? 'W' : 'E'}`;
					const latLabel = `${Math.abs(properties.latMin)}&ndash;${Math.abs(properties.latMax)}&deg;${properties.latMin < 0 ? 'S' : 'N'}`;
					label = `for ${lngLabel}, ${latLabel}`;
				}

				return label;
			},
			inspectedSampleGridThreshold: function() {
				const {totalObservations, observationThreshold} = this.calculateObservationCountAndThreshold();
				return ` (at least ${observationThreshold} observation${observationThreshold === 1 ? '' : 's'})`;
			},
			inspectedSampleGridTotalObservations: function() {
				const {totalObservations, observationThreshold} = this.calculateObservationCountAndThreshold();
				return totalObservations.toLocaleString();
			},
			filteredObservedSpeciesList: function() {
				const observedSpecies = JSON.parse(this.inspectedSampleGrid.properties.observedSpecies);
				const {totalObservations, observationThreshold} = this.calculateObservationCountAndThreshold();

				return observedSpecies.filter(species => {
					return species.observationCount >= observationThreshold;
				});
			},

		},
		methods: {
			getMaxNumSpecies() {
				const maxReducer = (accumulator, currentValue) => {
					if (typeof(accumulator) === 'object') {
						return accumulator.properties.numSpecies;
					} else {
						return Math.max(accumulator, currentValue.properties.numSpecies);
					}
				}

				const max = data.sampleGrids.features.reduce(maxReducer);
				return Math.max(max, 10);
			},
			toggleFilterAll: function(e) {
				this.selectedSpecies = [];
				if (!e.target.checked) {
					this.filterAll = true;
					e.target.checked = true;
				}

				this.updateMapLayers();
			},
			addSpeciesToFilter: function(e, species, replace = false) {
				e.preventDefault();
				let scientificName = species.hasOwnProperty('verbatimScientificName') ? species.verbatimScientificName : species.scientificName;

				if (this.selectedSpecies.indexOf(scientificName) < 0) {
					if (replace) {
						this.selectedSpecies = [scientificName];
					} else {
						this.selectedSpecies.push(scientificName);
					}

					this.filterAll = false;
					this.updateMapLayers();
				}
			},
			removeSpeciesFromFilter: function(species) {
				let i = this.selectedSpecies.indexOf(species);
				this.selectedSpecies.splice(i, 1);
				if (!this.selectedSpecies.length) {
					this.filterAll = true;
				}

				this.updateMapLayers();
			},
			toggleSpeciesInFilter: function(e) {
				if (e.target.checked) {
					this.filterAll = false;
				} else {
					if (!this.selectedSpecies.length) {
						this.filterAll = true;
					}
				}

				this.updateMapLayers();
			},
			updateMapLayers: function() {
				if (this.filterAll) {
					this.mapIntent = MapIntents.DIVERSITY;
				} else {
					this.mapIntent = MapIntents.OBSERVATION_COUNT;
				}

				if (this.map.getLayer('sample-grids')) {
					this.map.removeLayer('sample-grids');
				}

				if (this.map.getLayer('sample-grid-borders')) {
					this.map.removeLayer('sample-grid-borders');
				}

				if (this.map.getSource('sampleGrids')) {
					this.map.removeSource('sampleGrids');
				}

				this.map.off('click', 'sample-grids');

				this.map.addSource('sampleGrids', {
					type: 'geojson',
					data: this.filteredSampleGrids
				});

				if (!this.filterAll) {
					let bounds = turf.bbox(this.filteredSampleGrids);
					this.map.fitBounds(bounds, { padding: 150 });
				} else {
					this.map.flyTo({
						center: [0, 0],
						zoom: 2
					});
				}

				this.map.addLayer({
					id: 'sample-grids',
					type: 'fill',
					source: 'sampleGrids',
					maxzoom: 8,
					paint: this.mapStyles
				});

				this.map.addLayer({
					id: 'sample-grid-borders',
					type: 'line',
					source: 'sampleGrids',
					maxzoom: 8,
					paint: {
						'line-color': ['case',
							['boolean', ['feature-state', 'selected'], false],
							'#333',
							'rgba(0, 0, 0, 0)'
						],
						'line-opacity': 0.6,
						'line-width': ['case',
							['boolean', ['feature-state', 'selected'], false],
							1.5,
							0
						]
					}
				});

				this.map.on('render', () => {
					// alert('Loaded!');
					if (this.map.loaded() && this.map.areTilesLoaded()) {
						this.isLoaded = true;
						this.map.off('render');
					}
				});

				this.map.on('click', 'sample-grids', (e) => {
					this.handleClick(e, 'sampleGrids');
				});

				// this.isLoaded = true;
			},
			handleClick: function(e, layerName) {
				let features = this.map.queryRenderedFeatures(e.point);
				let foundFeature;
				let toggleOff = false;

				// console.log(features);

				for (let feature of features) {
					if (feature.hasOwnProperty('source') && feature.source === layerName) {
						// console.log(feature);
						foundFeature = feature;

						/*if (this.inspectedSampleGrid && foundFeature.id === this.inspectedSampleGrid.id) {
							toggleOff = true;
						}*/

						this.clearInspectedSampleGrid();

						if (!toggleOff) {
							// Select this grid square
							this.map.setFeatureState({ source: 'sampleGrids', id: foundFeature.id}, { selected: true });
							this.inspectedSampleGrid = foundFeature;
						}
					}
				}

				if (foundFeature && !toggleOff) {
					// const {totalObservations, observationThreshold} = this.calculateObservationCountAndThreshold();
				} else {
					// this.clearInspectedSampleGrid();
				}
			},
			calculateObservationCountAndThreshold: function() {
				const observedSpecies = JSON.parse(this.inspectedSampleGrid.properties.observedSpecies);
				let totalObservations = 0;
				observedSpecies.map(el => {
					totalObservations += el.observationCount;
				});

				return {
					totalObservations: totalObservations,
					observationThreshold: Math.ceil(totalObservations * 0.001)
				}
			},
			clearInspectedSampleGrid: function() {
				// Clear the last-inspected grid square
				if (this.inspectedSampleGrid) {
					this.map.setFeatureState({ source: 'sampleGrids', id: this.inspectedSampleGrid.id}, { selected: false });
				}
				this.inspectedSampleGrid = null;
			},
			getDescriptionUrl: function(species) {
				return `https://ebird.org/species/${species.speciesCode}`;
			},
			getMapUrl: function(species) {
				const properties = this.inspectedSampleGrid.properties;
				return `https://ebird.org/map/${species.speciesCode}?env.minX=${properties.lngMin}&env.minY=${properties.latMin}&env.maxX=${properties.lngMax}&env.maxY=${properties.latMax}`;
			},
			getSampleGridAttributes() {
				window.map = this.map;
				window.sampleGridAttributes = {};
				const LAT_MIN = -90;
				const LAT_MAX = 90;
				const LNG_MIN = -180;
				const LNG_MAX = 180;
				// const LAT_MIN = -10;
				// const LAT_MAX = -4;
				// const LNG_MIN = -10;
				// const LNG_MAX = -4;

				for (let lat = LAT_MIN; lat < LAT_MAX; lat++) {
					for (let lng = LNG_MIN; lng <= LNG_MAX; lng++) {
						// console.log(lng, lat);
						let x1y1 = this.map.project([lng, Math.max(-89.999999), lat]);
						let x2y2 = this.map.project([lng + 0.999999, lat + 0.999999]);
						// console.log(x1y1);
						// console.log(x2y2);
						// window.x1y1 = x1y1;
						// window.x2y2 = x2y2;
						let nextGrid = [x1y1, x2y2];
						let features = this.map.queryRenderedFeatures(nextGrid);
						let featureNames = features.map(el => el.layer.id);
						window.sampleGridAttributes[`${lat},${lng}`] = featureNames;
					}
				}

				console.log(window.sampleGridAttributes);
			}
		},
		created: function() {
			document.querySelectorAll('.before-vue-initialized').forEach(el => {
				el.classList.remove('before-vue-initialized');
			});

			this.map = new mapboxgl.Map({
				container: 'map',
				style: 'mapbox://styles/mapbox/light-v10',
				zoom: 2
			});

			this.map.on('load', () => {
				// this.getSampleGridAttributes();
				this.updateMapLayers();
			})
		}
	})
}

function normalizeData(sampleGrids) {
	let i = 0;

	for (const grid of sampleGrids.features) {
		grid.id = i++;

		// grid.properties.observedSpecies = JSON.parse(grid.properties.observedSpecies);
		observedSpecies = grid.properties.observedSpecies;

		let totalObservations = 0;
		observedSpecies.map(el => {
			totalObservations += el.observationCount;
		});

		grid.properties.totalObservations = totalObservations;
		grid.properties.observationThreshold = Math.ceil(totalObservations * 0.001);
		grid.properties.rareSpecies = [];

		for (let i = observedSpecies.length - 1; i >=0; i--) {
			let nextSpecies = observedSpecies[i];
			if (nextSpecies.observationCount < grid.properties.observationThreshold) {
				let tmp = observedSpecies.splice(i, 1);
				grid.properties.numSpecies--;
				grid.properties.rareSpecies.push(tmp);
			}
		}
	}
}
