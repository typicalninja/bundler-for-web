import { DatabaseDriver } from "./driver"
import { Collection, Db, MongoClient } from 'mongodb'
import logger from "../utils/logger";


export default class MongoDbDriver extends DatabaseDriver {
	client: MongoClient;
	ready: boolean;
	options: any;
	db: null | Db;
	collection: null | Collection;
	constructor(options:any) {
		super(null);
		if(!options.mongoURL) throw new Error('Option mongoURL not found')
		this.client = new MongoClient(options.mongoURL);
		this.options = options;
		this.ready = false;
		this.db = null;
		this.collection = null;
	}
	async has(key: string) { 
		if(!this.ready || this.db === null || this.collection === null) {
			logger.debug(`MongoDB:Driver:HAS: key: ${key} status: NOT_READY/CONNECT_FAIL`)
			return false;
		}
		const has = await this.collection.findOne({ hash: key });
		logger.debug(`MongoDB:Driver:Has: key: ${key} / found: ${has ? true : false}`);
		if(has) return true;
		else return false;
	}
	async get(key: string) {
		if(!this.ready || this.db === null || this.collection === null) {
			logger.debug(`MongoDB:Driver:GET: key: ${key} status: NOT_READY/CONNECT_FAIL`)
			return false;
		}
		const data = await this.collection.findOne({ hash: key });
		logger.debug(`MongoDB:Driver:get: key: ${key} / found: ${data ? true : false}`);
		if(!data) return false;
		else return data.script && typeof data.script === 'string' ? data.script : false
	}
	async set(key: string, data: string) {
		if(!this.ready || this.db === null || this.collection === null) {
			logger.debug(`MongoDB:Driver:SET: key: ${key} status: NOT_READY/CONNECT_FAIL`)
			return false;
		}
		// process if valid
		await this.collection.insertOne({
			hash: key,
			script: data
		})
		return true;
	}
	async size() {
		const all = await this.collection?.estimatedDocumentCount()

		return all || 0
	}
	async onInit(): Promise<void> {
		if(this.ready) throw new Error(`Driver Already Initiated`);
		await this.client.connect()
		this.db = await this.client.db(this.options.mongoNAME || undefined);
		this.collection = this.db.collection(`bundlerForWeb`)
		this.ready = true;
		logger.info(`Driver: mongodb is initiated mongoUrl ${this.options.mongoURL} with name ${this.options.mongoNAME || this.db.databaseName}`)
	}
}