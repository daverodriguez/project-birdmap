# Taxonomy Generator

```
node taxonomy --family="<family name - see `taxonomy` table in SQLite>" --outfile="taxonomy-<familyname>.json"
```

## Example
```
node taxonomy --family="Troglodytidae (Wrens)" --outfile="taxonomy-troglodytidae.json"
```

# Sample Data Generator

```
node sample --db="<database file name.db>" --viewname="<SQLite view name>" --outfile="sample-data-<family>.json" --step="<grid size in degrees>" --reset="<specify any value to reset skip-list.json>"
```

## Example
```
node sample --db="ebird_eod_2.db" --viewname="observationsSimpleSittidae" --outfile="sample-data-sittidae.json" --step="20" --reset="true"
```