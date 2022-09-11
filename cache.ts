import LRUCache from "lru-cache";
import path from "path";
import config from "./config";
import { DatabaseDriver } from "./database/driver";
import { parsedPkg } from "./npm_bundler/packageData";
import { fileExists } from "./utils/fileSys";
import logger from "./utils/logger";
const cacheOptions = config.caches;

const caches:  { memory: null | LRUCache<string, string>; database: null | DatabaseDriver } = { memory: null, database: null }


// init functions
async function initDatabase() {
	// database is disabled
	if(cacheOptions.database.enabled === false) return false;
	logger.debug(`Database Cache Enabled`);
	const driverFileLoc = path.join(__dirname, `./database/${cacheOptions.database.databaseType}.ts`)
	if(!await fileExists(driverFileLoc)) return logger.warn(`Driver ${cacheOptions.database.databaseType} not found (check: ${driverFileLoc}), continuing without database`);
	let Driver = await import(driverFileLoc);
	if(Driver.default) Driver = Driver.default
	const driver = new Driver(cacheOptions.database.databaseOptions);
	if(driver instanceof DatabaseDriver) {
		caches.database = driver;
		await driver.onInit()
	}
	else {
		return logger.warn(`Invalid Driver ${cacheOptions.database.databaseType}`);
	}
}

function initMemoryCache() {
	if(cacheOptions.memory.enabled === false) return false;
	logger.debug(`Memory Cache Enabled`);
	caches.memory = new LRUCache({
		max: 1000,
		noUpdateTTL: false,
		noDeleteOnStaleGet: true
	})
}

// has function for database
function database_has(key: string): Promise<boolean> {
	return new Promise((resolve) => {
		if(caches.database === null || !caches.database.has) return resolve(false);
		return caches.database.has(key).then((r) => {
			logger.debug(`CACHE:DATABASE:HAS: key: ${key}/ result: ${r}`)
			resolve(r || false)
		});
	});
}

// has function for memory cache
function cache_has(key: string) {
	if(caches.memory === null) return false;
	return caches.memory.has(key)
}

// get function for database
function database_get(key: string): Promise<string | undefined> {
	return new Promise((resolve) => {
		if(caches.database === null || !caches.database.get) return resolve(undefined);
		return caches.database.get(key).then((r) => {
			logger.debug(`CACHE:DATABASE:GET: key: ${key}/ result: ${r}`)
			resolve(typeof r === 'string' ? r : undefined)
		});
	});
}

// get function for memory cache
function cache_get(key: string): string | undefined {
	if(caches.memory === null) return undefined;
	return caches.memory.get(key)
}

// set function for database
function database_set(key: string, data: string): Promise<boolean> {
	return new Promise((resolve) => {
		if(caches.database === null || !caches.database.set) return resolve(false);
		return caches.database.set(key, data).then((r) => {
			logger.debug(`CACHE:DATABASE:SET: key: ${key}/ result: ${r}`)
			resolve(r)
		});
	});
}

// set function for memory cache
function cache_set(key: string, data: string): boolean {
	if(caches.memory === null) return false;
	return caches.memory.set(key, data) && true
}


async function has(key: string): Promise<boolean> {
	// cache is disabled
	if(caches.database === null && caches.memory === null) return false;
	return cache_has(key) || await database_has(key)
}

async function get(key: string): Promise<string | undefined>  {
	if(caches.database === null && caches.memory === null) return undefined;
	return cache_get(key) || await database_get(key)
}



async function set(key: string, data: string) {
	if(caches.database === null && caches.memory === null) return false;
	cache_set(key, data)
	await database_set(key, data)
	return true;
}

async function getDatabaseSize() {
	if(caches.database === null || !caches.database.size) return 0;
	return await caches.database.size()
}

export default {
	get,
	has,
	set,
	caches,
	getDatabaseSize
}

export async function prepareCaches() {
	await initMemoryCache()
	await initDatabase();
}
