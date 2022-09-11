import { parsedPkg } from "../npm_bundler/packageData";

/**
 * Driver to communicate with Database
 */
export class DatabaseDriver {
	/**
	 * 
	 * @param databaseOptions - Anything, most likely a object
	 */
	constructor(databaseOptions: any) {

	}
	/**
	 * Returns boolean value to indicate if key exists or not
	 * @param key - key to look for
	 */
	has(key: string): Promise<boolean> {
		throw new Error('Method Not Implemented')
	}
	get(key: string): Promise<string | boolean> {
		throw new Error('Method Not Implemented')
	}
	set(key: string, data: string): Promise<boolean> {
		throw new Error('Method Not Implemented')
	}
	async size(): Promise<number> {
		return 0;
	}
	onInit(): Promise<void> {
		throw new Error('Method Not Implemented')
	}
}