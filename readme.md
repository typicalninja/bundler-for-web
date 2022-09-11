# Bundler For web

* Bundle Npm packages that do not provide web packages instantly on web

* Supports loading with <scripts\>

* To get a bundle of npm package use the following format

> /npm/{packageName}{version}

* **version** - defaults to latest (we will parse the Latest tag from the api);

* so providing version is optional but suggested to pin a version to specific one

# Using a required Script

* we provide the [webpack.output.library](https://webpack.js.org/configuration/output/#outputlibrary) as a normalized packageName of the package you required

> How we Normalize Package Names:

* `is-number` -> `isNumber` ("-" removed and 1st letter of the word after is capitalized)


* `lodash` -> `lodash` (no change)

* after requiring it, use the packageName to access it

# Try 

* You can Experiment with it [here](https://bundlerforweb.ga/repl)
